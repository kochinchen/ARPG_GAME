import type { CommandQueue } from '../../../src/core/CommandQueue';
import { vec2, type Vec2 } from '../../../src/core/math/Vec2';
import type { Rng } from '../../../src/core/Rng';
import type { SkillDef } from '../../../src/data/schema/skill';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { Pathfinder } from '../../../src/game/movement/Pathfinder';
import type { ComboKey } from '../../../src/game/player/PlayerLoadout';
import type { Build } from './character';

/**
 * 機器人玩家：跟真人一樣只送 Command，不直接改遊戲狀態。每 0.1 秒做一次決定。
 * - rusher（莽撞型）：直衝最近的怪、一直打，血剩 20% 才喝水，不躲
 * - normal（正常型）：血剩 45% 喝水；看到大招前搖 0.3 秒後才反應、有 20% 沒躲掉；遠程流派會拉開距離；危險時後退
 * - idle（站樁）：走到怪群旁邊後完全不動，用來量「站著不動多久會倒」
 */
export type Persona = 'rusher' | 'normal' | 'idle';

export const PERSONA_LABELS: Record<Persona, string> = { rusher: '莽撞型', normal: '正常型', idle: '站樁' };

interface PersonaParams {
  potionAt: number;
  dodge: boolean;
  reaction: number;
  dodgeMiss: number;
  kite: boolean;
  retreat: boolean;
}

const PARAMS: Record<Exclude<Persona, 'idle'>, PersonaParams> = {
  rusher: { potionAt: 0.2, dodge: false, reaction: 0, dodgeMiss: 1, kite: false, retreat: false },
  normal: { potionAt: 0.45, dodge: true, reaction: 0.3, dodgeMiss: 0.2, kite: true, retreat: true },
};

const DECIDE_EVERY = 6;
/** 遠程流派與近戰怪保持的距離 */
const KITE_DISTANCE = 3;
/** 開打的距離（要看得到目標） */
const ENGAGE_DISTANCE = 7;

export class Bot {
  private tick = 0;
  /** 正在做的閃避 / 後退：方向與剩餘秒數 */
  private evade: { dir: Vec2; remaining: number } | null = null;
  /** 每個前搖只擲一次「有沒有躲掉」 */
  private readonly judgedCasts = new WeakMap<object, boolean>();
  private attacking = false;
  private moving = false;
  private lastMoveOrder = -Infinity;
  private lastKite = -Infinity;
  private lastRetreat = -Infinity;
  private readonly planner: Pathfinder;
  private chase: { id: number; from: Vec2; since: number } | null = null;
  private readonly skipped = new Map<number, number>();
  /** 站樁：已經貼到怪了 */
  private planted = false;

  constructor(
    private readonly world: GameWorld,
    private readonly commands: CommandQueue<GameCommand>,
    private readonly build: Build,
    readonly persona: Persona,
    private readonly rng: Rng,
  ) {
    this.planner = new Pathfinder(world.nav, Number.MAX_SAFE_INTEGER);
  }

  update(dt: number): void {
    if (this.evade) this.evade.remaining -= dt;
    if (this.tick++ % DECIDE_EVERY !== 0) return;
    const player = this.world.player;
    if (!player.alive) {
      this.attacking = false;
      this.evade = null;
      return;
    }
    if (this.persona === 'idle') return this.idle();
    const p = PARAMS[this.persona];
    const hpPct = player.hp / player.maxHp;
    // 魔力見底也會喝（藥水同時回魔），但留 5 瓶給生命用
    const lowMana = player.mana / player.maxMana < 0.15 && this.world.potions.count > 5;
    if (hpPct < p.potionAt || lowMana) this.send({ type: 'UsePotion' });

    if (this.evade && this.evade.remaining > 0) return this.move(this.evade.dir);
    this.evade = null;

    const enemies = this.enemies();
    const target = this.pickTarget(enemies);
    if (!target) return this.stop();

    // 閃避、後退、拉開距離：要有路可走才做（被逼到牆角就只能硬打）
    if (p.dodge) {
      const threat = this.threat(enemies, p);
      const dir = threat && this.openDirection(away(threat, player.position));
      if (dir) return this.startEvade(dir, 0.6);
    }
    const now = this.world.playTime;
    if (p.retreat && hpPct < 0.3 && now - this.lastRetreat > 4) {
      const close = enemies.filter((e) => dist(e.position, player.position) < 4);
      const dir = close.length >= 2 && this.openDirection(away(centroid(close), player.position));
      if (dir) {
        this.lastRetreat = now;
        return this.startEvade(dir, 1.2);
      }
    }
    if (p.kite && this.build.ranged && now - this.lastKite > 2) {
      const melee = enemies.find((e) => dist(e.position, player.position) < KITE_DISTANCE && attackRange(e) < 2);
      const dir = melee && this.openDirection(away(melee.position, player.position));
      if (dir) {
        this.lastKite = now;
        return this.startEvade(dir, 0.5);
      }
    }
    this.fight(target);
  }

  private fight(target: Actor): void {
    const player = this.world.player;
    const d = dist(target.position, player.position);
    // 太遠或隔著牆：先走過去（真人也是先走近再出手，不會對著牆射）
    if (d > ENGAGE_DISTANCE || !this.world.nav.hasLineOfSight(player.position, target.position, 0.1)) {
      this.release();
      // 已經在走就不要每 0.1 秒重算路徑（大地圖的尋路很貴）：路走完或過了 1 秒才重點一次
      const now = this.world.playTime;
      if (!this.moving || player.path.length === 0 || now - this.lastMoveOrder > 1) {
        this.send({ type: 'PrimaryAction', worldPos: this.nextStop(target), targetId: null, held: false });
        this.lastMoveOrder = now;
      }
      this.moving = true;
      return;
    }
    this.moving = false;
    const key = this.readyCombo();
    if (key !== null) {
      this.release();
      this.send({ type: 'SelectRightSlot', slot: key });
      this.send({ type: 'CastRight', worldPos: target.position, targetId: target.id });
      return;
    }
    this.send({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: this.attacking });
    this.attacking = true;
  }

  /**
   * 目標：出口只差首領 / 魔王時直接找它，否則打最近的怪。
   * 追同一隻 5 秒都沒移動（牆後、走不到）就先跳過 20 秒。
   */
  private pickTarget(enemies: readonly Actor[]): Actor | null {
    const player = this.world.player;
    const now = this.world.playTime;
    for (const [id, until] of this.skipped) if (until <= now) this.skipped.delete(id);
    const usable = enemies.filter((e) => !this.skipped.has(e.id));
    const floors = this.world.floors;
    // 出口的關鍵：一般層清到門檻後找首領；Boss 層（remainingToOpen 在 Boss 死前都是 1）清掉同樣比例的怪後找 Boss
    const boss = usable.find((e) => e.isBoss);
    const cleared = floors.killed >= Math.ceil(floors.total * (floors.def?.clearRatio ?? 0));
    const key = boss && cleared ? boss : floors.remainingToOpen === 0 ? usable.find((e) => e.name.startsWith('首領')) : undefined;
    const target = key ?? nearest(player.position, usable);
    if (!target) return null;
    const d = dist(target.position, player.position);
    // 卡住：5 秒內幾乎沒移動、也還沒打到 → 先跳過這隻（繞路時直線距離會變遠，所以看自己有沒有在動）
    if (this.chase?.id !== target.id || dist(player.position, this.chase.from) > 1 || d < 3) this.chase = { id: target.id, from: player.position, since: now };
    else if (now - this.chase.since > 5) {
      this.skipped.set(target.id, now + 20);
      this.chase = null;
    }
    return target;
  }

  private idle(): void {
    if (this.planted) return;
    const player = this.world.player;
    const target = nearest(player.position, this.enemies());
    if (!target) return;
    if (player.hp < player.maxHp) {
      this.planted = true;
      this.release();
      this.send({ type: 'MoveDirection', dir: null });
      // 量測用：直接停下手上的攻擊（站樁不出手，看怪要打多久才倒）
      player.path = [];
      player.intent = null;
      return;
    }
    // 先打一下把怪叫醒，被打到之後就站著不動
    if (dist(target.position, player.position) > ENGAGE_DISTANCE) {
      this.send({ type: 'PrimaryAction', worldPos: this.nextStop(target), targetId: null, held: false });
    } else {
      this.send({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: false });
    }
  }

  /**
   * 下一個要點的地方：真人看得到整張地圖，會沿著走廊繞過去；遊戲的點擊尋路有搜尋上限，
   * 遠的目標可能會停在死路。所以先用不限搜尋量的尋路規劃整條路，只點第一個轉角。
   */
  private nextStop(target: Actor): Vec2 {
    const player = this.world.player;
    const goal = this.groundNear(target);
    const route = this.planner.findPath(player.position, goal, player.radius);
    return route[0] ?? goal;
  }

  /** 目標旁邊、走得到的地面（點在怪身上會變成攻擊；點進牆裡會算不出路） */
  private groundNear(target: Actor): Vec2 {
    const nav = this.world.nav;
    const player = this.world.player;
    const toward = away(target.position, player.position);
    const base = Math.atan2(toward.y, toward.x);
    const r = target.radius + 1;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const spot = vec2(target.position.x + Math.cos(base + turn) * r, target.position.y + Math.sin(base + turn) * r);
      if (nav.isClearAt(spot, player.radius)) return spot;
    }
    return target.position;
  }

  /** 第一組已解鎖、技能都學了、沒在冷卻、魔力夠的連段 */
  private readyCombo(): ComboKey | null {
    const world = this.world;
    const player = world.player;
    for (let k = 0; k < world.comboKeysUnlocked; k++) {
      const steps = world.loadout.combos[k]!.slice(0, world.comboSlotsUnlocked).filter((s): s is string => s !== null);
      if (steps.length === 0) continue;
      if (steps.some((s) => (player.cooldowns.get(s) ?? 0) > 0)) continue;
      if (player.mana < player.maxMana * 0.25) continue;
      return k as ComboKey;
    }
    return null;
  }

  /** 會打到自己的大招前搖（只看有地面預警的） */
  private threat(enemies: readonly Actor[], p: PersonaParams): Vec2 | null {
    const player = this.world.player;
    for (const e of enemies) {
      const cast = e.cast;
      if (!cast || cast.fired || !cast.skill.telegraph) continue;
      if (cast.elapsed < p.reaction) continue;
      const reach = skillReach(cast.skill) * e.skillArea + player.radius + 0.4;
      const fromCaster = dist(e.position, player.position);
      const fromPoint = dist(cast.point, player.position);
      if (Math.min(fromCaster, fromPoint) > reach) continue;
      let dodged = this.judgedCasts.get(cast);
      if (dodged === undefined) {
        dodged = !this.rng.chance(p.dodgeMiss);
        this.judgedCasts.set(cast, dodged);
      }
      if (dodged) return fromPoint < fromCaster ? cast.point : e.position;
    }
    return null;
  }

  private enemies(): Actor[] {
    return this.world.actors.filter((a) => a.alive && a.faction === 'enemy' && !a.device);
  }

  /** 往 dir 附近（最多偏 90°）找一個 2 格內走得通的方向；都被擋住回傳 null */
  private openDirection(dir: Vec2): Vec2 | null {
    const nav = this.world.nav;
    const player = this.world.player;
    const base = Math.atan2(dir.y, dir.x);
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.57, -1.57]) {
      const d = vec2(Math.cos(base + turn), Math.sin(base + turn));
      const to = vec2(player.position.x + d.x * 2, player.position.y + d.y * 2);
      if (nav.isClearAt(to, player.radius) && nav.hasLineOfSight(player.position, to, player.radius)) return d;
    }
    return null;
  }

  private startEvade(dir: Vec2, seconds: number): void {
    this.evade = { dir, remaining: seconds };
    this.move(dir);
  }

  private move(dir: Vec2): void {
    this.release();
    this.moving = false;
    this.send({ type: 'MoveDirection', dir });
  }

  private stop(): void {
    this.release();
    this.send({ type: 'MoveDirection', dir: null });
  }

  private release(): void {
    if (!this.attacking) return;
    this.attacking = false;
    this.send({ type: 'PrimaryRelease' });
  }

  private send(command: GameCommand): void {
    this.commands.push(command);
  }
}

function skillReach(skill: SkillDef): number {
  let reach = skill.range ?? 1;
  for (const effect of skill.effects) {
    if ('radius' in effect && typeof effect.radius === 'number') reach = Math.max(reach, effect.radius);
    if ('length' in effect && typeof effect.length === 'number') reach = Math.max(reach, effect.length);
  }
  return reach;
}

function attackRange(actor: Actor): number {
  return actor.stats.get('attackRange');
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearest(from: Vec2, actors: readonly Actor[]): Actor | null {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const a of actors) {
    const d = dist(a.position, from);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

function centroid(actors: readonly Actor[]): Vec2 {
  const x = actors.reduce((s, a) => s + a.position.x, 0) / actors.length;
  const y = actors.reduce((s, a) => s + a.position.y, 0) / actors.length;
  return vec2(x, y);
}

/** 從 from 往 to 的反方向（單位向量） */
function away(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return vec2(dx / len, dy / len);
}
