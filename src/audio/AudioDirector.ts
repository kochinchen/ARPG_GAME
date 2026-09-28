import type { Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import type { Actor, ActorId } from '../game/entities/Actor';
import type { GameEventBus } from '../game/GameEvents';
import type { GameWorld } from '../game/GameWorld';
import type { AudioEngine, SfxOptions } from './AudioEngine';
import { musicTierForFloor } from './AudioSettings';
import type { MusicId } from './Music';
import type { SfxName } from './Sfx';
import { skillSound, type SkillSound } from './SkillSounds';

/** 超過這個距離（格）聽不到 */
const HEARING = 18;
/** 這個距離以內音量不衰減 */
const NEAR = 4;
/** 魔王進入這個距離時怒吼一次（登場） */
const BOSS_GREET = 11;
/** 同一隻魔王兩次吼叫的最短間隔（秒） */
const ROAR_GAP = 3;
/** 魔王的吼聲傳得比較遠 */
const ROAR_HEARING = 32;

/**
 * 監聽遊戲事件並播放對應的聲音（ARCHITECTURE.md 第 G 節的 Audio 訂閱者）。
 * 只讀 GameWorld（位置、是否為魔王），不修改任何遊戲狀態。
 */
export class AudioDirector {
  private readonly sounds = new Map<string, SkillSound>();
  private readonly greeted = new Set<ActorId>();
  private readonly lastRoar = new Map<ActorId, number>();
  private greetTimer = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly world: GameWorld,
    private readonly data: DataRegistry,
    events: GameEventBus,
  ) {
    events.on('SkillCast', (e) => this.onSkillCast(e.actorId, e.skillId, e.impactIn));
    events.on('AreaTriggered', (e) => this.onImpact(e.skillId, e.position));
    events.on('ChainTriggered', (e) => {
      e.points.slice(0, 6).forEach((p, i) => this.at(p, 'zap', { delay: i * 0.05, minGap: 0.02, gain: this.isPlayerSkill(e.skillId) ? 0.9 : 0.6 }));
    });
    events.on('ActorDamaged', (e) => {
      if (e.amount <= 0) return;
      if (e.targetId === this.world.player.id) this.engine.play('playerHurt', { gain: 0.8, minGap: 0.15 });
      else if (e.sourceId === this.world.player.id) this.at(e.position, e.isCrit ? 'crit' : 'hit', { gain: 0.7, minGap: 0.05 });
    });
    events.on('ActorDied', (e) => {
      if (e.faction === 'player') {
        this.engine.play('playerDeath', { reverb: 0.4 });
        this.engine.duckMusic(0.15, 1.5);
      } else if (e.boss && !e.miniBoss) this.at(e.position, 'bossDeath', { gain: 1, reverb: 0.4, rate: this.roarRate(e.actorId) }, ROAR_HEARING);
    });
    events.on('PlayerRespawned', () => {
      this.engine.play('respawn');
      this.engine.duckMusic(1, 2);
    });
    events.on('PlayerLeveledUp', () => this.engine.play('levelUp', { reverb: 0.35 }));
    events.on('ItemEquipped', () => this.engine.play('equip', { reverb: 0.05 }));
    events.on('ItemUnequipped', () => this.engine.play('unequip', { reverb: 0.05 }));
    events.on('ShopTransaction', (e) => this.engine.play(e.kind === 'ascend' ? 'ascend' : 'coins', { reverb: 0.1 }));
    events.on('ItemDropped', () => this.engine.play('drop', { reverb: 0.05 }));
    events.on('ItemsSalvaged', () => this.engine.play('salvage', { reverb: 0.15 }));
    events.on('WaypointUsed', () => this.engine.play('teleport', { reverb: 0.35 }));
    events.on('BossPhaseChanged', (e) => this.roar(e.actorId, true));
    events.on('FloorEntered', (e) => {
      this.greeted.clear();
      this.lastRoar.clear();
      this.playMusic(musicTierForFloor(e.floor) as MusicId);
    });
  }

  /** 目前樓層的背景音樂（讀檔後第一次進入遊戲時呼叫） */
  playFloorMusic(): void {
    this.playMusic(musicTierForFloor(this.world.floors.floor) as MusicId);
  }

  private playMusic(id: MusicId): void {
    this.engine.duckMusic(1, 0.5);
    this.engine.playMusic(id);
  }

  /** 每幀呼叫：魔王登場的怒吼、模型待機時的怒吼（Renderer 回報） */
  update(dt: number, idleRoars: readonly ActorId[]): void {
    for (const id of idleRoars) this.roar(id, false);
    this.greetTimer -= dt;
    if (this.greetTimer > 0) return;
    this.greetTimer = 0.25;
    const p = this.world.player.position;
    for (const a of this.world.actors) {
      if (!a.isBoss || !a.alive || this.greeted.has(a.id)) continue;
      if (Math.hypot(a.position.x - p.x, a.position.y - p.y) > BOSS_GREET) continue;
      this.greeted.add(a.id);
      this.roar(a.id, true);
    }
  }

  private soundFor(skillId: string): SkillSound | null {
    let s = this.sounds.get(skillId);
    if (!s) {
      if (!this.data.skills.has(skillId)) return null;
      s = skillSound(this.data.skills.get(skillId));
      this.sounds.set(skillId, s);
    }
    return s;
  }

  private isPlayerSkill(skillId: string): boolean {
    return this.data.skills.has(skillId) && this.data.skills.get(skillId).tree !== undefined;
  }

  private actor(id: ActorId): Actor | undefined {
    return this.world.actors.find((a) => a.id === id);
  }

  private onSkillCast(actorId: ActorId, skillId: string, impactIn: number): void {
    const actor = this.actor(actorId);
    const sound = this.soundFor(skillId);
    if (!actor || !sound) return;
    const isPlayer = actor === this.world.player;
    // 怪物的招式比主角小聲；體型越大聲音越低
    const gain = isPlayer ? 1 : actor.isBoss ? 0.95 : 0.6;
    const rate = isPlayer ? 1 : Math.min(1.15, Math.max(0.7, Math.pow(0.35 / actor.visualRadius, 0.35)));
    if (sound.windup) this.at(actor.position, sound.windup, { gain: gain * 0.8, rate });
    // 揮砍聲比命中稍早開始，聽起來是「揮下去」
    const melee = sound.release.some((n) => n.startsWith('swing'));
    const delay = Math.max(0, impactIn - (melee ? 0.08 : 0));
    for (const name of sound.release) this.at(actor.position, name, { gain, rate, delay });
    // 魔王施法 / 召喚時仰天怒吼
    const skill = this.data.skills.get(skillId);
    if (actor.isBoss && (skill.tags.includes('spell') || skill.tags.includes('summon'))) this.roar(actor.id, false);
  }

  private onImpact(skillId: string, position: Vec2): void {
    const impact = this.soundFor(skillId)?.impact;
    if (!impact) return;
    const gain = this.isPlayerSkill(skillId) ? 1 : 0.75;
    // 箭雨、隕石雨一次落下很多發：間隔拉長
    this.at(position, impact, { gain, minGap: impact === 'arrowRain' ? 0.45 : 0.09, reverb: 0.3 });
  }

  private roarRate(actorId: ActorId): number {
    const actor = this.actor(actorId);
    return actor ? Math.min(1.15, Math.max(0.65, Math.sqrt(0.9 / actor.visualRadius))) : 1;
  }

  private roar(actorId: ActorId, force: boolean): void {
    const actor = this.actor(actorId);
    if (!actor || !actor.alive) return;
    const now = performance.now() / 1000;
    if (!force && now - (this.lastRoar.get(actorId) ?? -Infinity) < ROAR_GAP) return;
    this.lastRoar.set(actorId, now);
    this.at(actor.position, 'bossRoar', { gain: actor.miniBoss ? 0.7 : 1, rate: this.roarRate(actorId) * (actor.miniBoss ? 1.15 : 1), reverb: 0.45, minGap: 0.3 }, ROAR_HEARING);
  }

  /** 在世界座標播放：距離主角越遠越小聲，左右聲道依畫面位置 */
  private at(position: Vec2, name: SfxName, options: SfxOptions = {}, hearing = HEARING): void {
    const p = this.world.player.position;
    const dx = position.x - p.x;
    const dy = position.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > hearing) return;
    const falloff = dist <= NEAR ? 1 : 1 - (dist - NEAR) / (hearing - NEAR);
    // 等角投影：畫面上的左右 = World 的 x - y
    const pan = Math.max(-0.7, Math.min(0.7, (dx - dy) / 14));
    this.engine.play(name, { ...options, gain: (options.gain ?? 1) * falloff * falloff, pan });
  }
}
