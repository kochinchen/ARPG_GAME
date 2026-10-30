import type { CommandQueue } from '../../../src/core/CommandQueue';
import { vec2, type Vec2 } from '../../../src/core/math/Vec2';
import type { Rng } from '../../../src/core/Rng';
import type { SkillDef } from '../../../src/data/schema/skill';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
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

export class Bot {
  private tick = 0;
  /** 正在做的閃避 / 後退：方向與剩餘秒數 */
  private evade: { dir: Vec2; remaining: number } | null = null;
  /** 每個前搖只擲一次「有沒有躲掉」 */
  private readonly judgedCasts = new WeakMap<object, boolean>();
  private attacking = false;
  private chase: { id: number; best: number; since: number } | null = null;
  private readonly skipped = new Map<number, number>();
  /** 站樁：已經貼到怪了 */
  private planted = false;

  constructor(
    private readonly world: GameWorld,
    private readonly commands: CommandQueue<GameCommand>,
    private readonly build: Build,
    readonly persona: Persona,
    private readonly rng: Rng,
  ) {}

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
    if (hpPct < p.potionAt || player.mana / player.maxMana < 0.15) this.send({ type: 'UsePotion' });

    if (this.evade && this.evade.remaining > 0) return this.move(this.evade.dir);
    this.evade = null;

    const enemies = this.enemies();
    const target = this.pickTarget(enemies);
    if (!target) return this.stop();

    if (p.dodge) {
      const threat = this.threat(enemies, p);
      if (threat) return this.startEvade(away(threat, player.position), 0.6);
    }
    if (p.retreat && hpPct < 0.3) {
      const close = enemies.filter((e) => dist(e.position, player.position) < 4);
      if (close.length >= 2) return this.startEvade(away(centroid(close), player.position), 1.2);
    }
    if (p.kite && this.build.ranged) {
      const melee = enemies.find((e) => dist(e.position, player.position) < KITE_DISTANCE && attackRange(e) < 2);
      if (melee) return this.startEvade(away(melee.position, player.position), 0.5);
    }
    this.fight(target);
  }

  private fight(target: Actor): void {
    const player = this.world.player;
    const key = this.readyCombo();
    if (key !== null && dist(target.position, player.position) < 8) {
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
   * 追同一隻 5 秒都沒靠近（牆後、走不到）就先跳過 20 秒。
   */
  private pickTarget(enemies: readonly Actor[]): Actor | null {
    const player = this.world.player;
    const now = this.world.playTime;
    for (const [id, until] of this.skipped) if (until <= now) this.skipped.delete(id);
    const usable = enemies.filter((e) => !this.skipped.has(e.id));
    const floors = this.world.floors;
    const key = floors.remainingToOpen === 0 ? usable.find((e) => e.isBoss || e.name.startsWith('首領')) : undefined;
    const target = key ?? nearest(player.position, usable);
    if (!target) return null;
    const d = dist(target.position, player.position);
    if (this.chase?.id !== target.id || d < this.chase.best - 0.5) this.chase = { id: target.id, best: d, since: now };
    else if (now - this.chase.since > 5 && d > 3) {
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
    if (dist(target.position, player.position) < 2.5 || player.hp < player.maxHp) {
      this.planted = true;
      this.release();
      this.send({ type: 'MoveDirection', dir: null });
      player.path = [];
      player.intent = null;
      return;
    }
    this.send({ type: 'PrimaryAction', worldPos: target.position, targetId: null, held: false });
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

  private startEvade(dir: Vec2, seconds: number): void {
    this.evade = { dir, remaining: seconds };
    this.move(dir);
  }

  private move(dir: Vec2): void {
    this.release();
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
