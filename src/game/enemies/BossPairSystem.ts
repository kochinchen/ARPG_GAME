import type { Rng } from '../../core/Rng';
import { distance, normalize, sub, vec2, type Vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { BossPair } from '../../data/schema/enemy';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';

/** 趕往站位時移動速度的加成（Modifier 的來源） */
const GATHER = 'pair-gather';
/** 離站位這麼近就算到了（Tile） */
const ARRIVED = 0.8;

/**
 * 成對的魔王（EnemyDef.pair，奪界雙手）：共用一個名字、兩段血條，兩隻都倒下才掉一份寶。
 * 每隔一段時間一起出招：先趕到目標兩側的站位，再同時施放。任何一隻進入 stopAtPhase 階段後不再一起出招。
 */
export class BossPairSystem {
  private timer: number | null = null;
  private gathering: { pair: BossPair; skill: string; left: number } | null = null;
  private nextMove = 0;

  constructor(
    private readonly data: Pick<DataRegistry, 'enemies' | 'skills'>,
    private readonly events: GameEventBus,
    private readonly rng: Rng,
    private readonly nav: NavGrid,
    private readonly actors: readonly Actor[],
    private readonly phaseOf: (actor: Actor) => number,
  ) {
    events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.defId === null || !data.enemies.has(e.defId)) return;
      const pair = data.enemies.get(e.defId).pair;
      if (!pair) return;
      this.stopGathering();
      if (!actors.some((a) => a.alive && a.defId === pair.partner)) events.emit('BossPairDefeated', { position: e.position, lootTable: pair.lootTable });
    });
    // 同一招不要兩隻同時放：一隻放了，另一隻要等
    events.on('SkillCast', (e) => {
      const caster = this.actors.find((a) => a.id === e.actorId);
      if (!caster?.defId || !data.enemies.has(caster.defId)) return;
      const pair = data.enemies.get(caster.defId).pair;
      if (!pair?.alternate.includes(e.skillId)) return;
      const other = this.actors.find((a) => a.alive && a.defId === pair.partner);
      if (other) other.cooldowns.set(e.skillId, Math.max(other.cooldowns.get(e.skillId) ?? 0, data.skills.get(e.skillId).cooldown / 2));
    });
  }

  /** 這隻魔王的另一半（還活著的） */
  partnerOf(actor: Actor): Actor | null {
    if (actor.defId === null || !this.data.enemies.has(actor.defId)) return null;
    const pair = this.data.enemies.get(actor.defId).pair;
    return pair ? (this.actors.find((a) => a.alive && a.defId === pair.partner) ?? null) : null;
  }

  update(dt: number): void {
    const first = this.actors.find((a) => a.alive && a.defId !== null && this.data.enemies.has(a.defId) && this.data.enemies.get(a.defId).pair);
    const second = first && this.partnerOf(first);
    if (!first || !second) return;
    const pair = this.data.enemies.get(first.defId!).pair!;
    const target = first.ai?.targetId != null ? this.actors.find((a) => a.id === first.ai!.targetId && a.alive) : undefined;
    const usable = target && first.ai?.state === 'chase' && second.ai?.state === 'chase' && this.phaseOf(first) < pair.stopAtPhase && this.phaseOf(second) < pair.stopAtPhase;
    if (!usable) {
      this.stopGathering();
      return;
    }
    if (this.gathering) {
      this.gathering.left -= dt;
      // 手上的招式放完才算準備好
      if (first.cast || second.cast) return;
      const arrived = [first, second].every((a) => a.ai!.gatherAt !== null && distance(a.position, a.ai!.gatherAt) <= ARRIVED);
      if (arrived || this.gathering.left <= 0) this.fire(first, second, target);
      return;
    }
    this.timer ??= this.rng.range(pair.every[0], pair.every[1]) / 2;
    this.timer -= dt;
    if (this.timer > 0) return;
    const move = pair.moves[this.nextMove++ % pair.moves.length]!;
    this.timer = this.rng.range(pair.every[0], pair.every[1]);
    this.gathering = { pair, skill: move.skill, left: pair.gatherFor };
    // 第一隻往目標的方向不變，第二隻站在隔 spreadDeg 度的地方
    const from = sub(first.position, target.position);
    const dir = from.x === 0 && from.y === 0 ? vec2(1, 0) : normalize(from);
    const angle = (move.spreadDeg * Math.PI) / 180;
    const other = vec2(dir.x * Math.cos(angle) - dir.y * Math.sin(angle), dir.x * Math.sin(angle) + dir.y * Math.cos(angle));
    this.sendTo(first, target.position, dir, move.distance, pair.gatherSpeed);
    this.sendTo(second, target.position, other, move.distance, pair.gatherSpeed);
  }

  private sendTo(actor: Actor, center: Vec2, dir: Vec2, far: number, speed: number): void {
    let spot = center;
    for (let d = far; d >= 1; d -= 1) {
      const p = vec2(center.x + dir.x * d, center.y + dir.y * d);
      if (this.nav.isClearAt(p, actor.radius)) {
        spot = p;
        break;
      }
    }
    actor.ai!.gatherAt = spot;
    actor.intent = null;
    actor.stats.addModifier({ stat: 'moveSpeed', kind: 'increased', value: speed, source: GATHER });
  }

  private fire(first: Actor, second: Actor, target: Actor): void {
    const skill = this.gathering!.skill;
    this.stopGathering();
    for (const actor of [first, second]) {
      actor.path = [];
      actor.skillRanks.set(skill, 1);
      actor.intent = { skillId: skill, targetId: null, point: target.position, hold: false };
    }
  }

  private stopGathering(): void {
    if (!this.gathering) return;
    this.gathering = null;
    for (const actor of this.actors) {
      if (!actor.ai?.gatherAt) continue;
      actor.ai.gatherAt = null;
      actor.stats.removeBySource(GATHER);
    }
  }

  /** 換樓層時清空 */
  clear(): void {
    this.gathering = null;
    this.timer = null;
    this.nextMove = 0;
  }
}
