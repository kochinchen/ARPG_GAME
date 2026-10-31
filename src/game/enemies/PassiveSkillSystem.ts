import type { Rng } from '../../core/Rng';
import { vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { Actor, ActorId } from '../entities/Actor';
import type { SkillExecutor } from '../skills/SkillExecutor';

/**
 * 怪物的被動技能（EnemyDef.passives）：戰鬥中（AI 有目標時）自動發動，不經過施法、不打斷動作。
 * every：每隔幾秒（每次隨機 ±30%）；trail：每移動幾格。效果在施放者腳下、以等級 1 執行，
 * 方向朝向目前的面向（例如熔岩巨獸走過留下的岩漿、身上不定時噴出的岩漿）。
 */
export class PassiveSkillSystem {
  /** 怪物 → 每個被動技能的計時（秒）或累積的移動距離（格） */
  private readonly progress = new Map<ActorId, number[]>();
  private readonly lastPosition = new Map<ActorId, { x: number; y: number }>();

  constructor(
    private readonly data: Pick<DataRegistry, 'enemies' | 'skills'>,
    private readonly executor: SkillExecutor,
    private readonly rng: Rng,
  ) {}

  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      if (actor.defId === null || !this.data.enemies.has(actor.defId)) continue;
      const passives = this.data.enemies.get(actor.defId).passives;
      if (passives.length === 0) continue;
      if (!actor.alive) {
        this.progress.delete(actor.id);
        this.lastPosition.delete(actor.id);
        continue;
      }
      const last = this.lastPosition.get(actor.id) ?? actor.position;
      const moved = Math.hypot(actor.position.x - last.x, actor.position.y - last.y);
      this.lastPosition.set(actor.id, { x: actor.position.x, y: actor.position.y });
      // 只在戰鬥中發動（閒置走動、走回出生點時不留岩漿）
      if (!actor.ai?.targetId) continue;
      let state = this.progress.get(actor.id);
      if (!state) {
        state = passives.map((p) => (p.every ? this.interval(p.every) : 0));
        this.progress.set(actor.id, state);
      }
      passives.forEach((p, i) => {
        if (p.every) {
          state[i]! -= dt;
          if (state[i]! > 0) return;
          state[i] = this.interval(p.every);
        } else if (p.trail) {
          state[i]! += moved;
          if (state[i]! < p.trail) return;
          state[i] = 0;
        }
        this.cast(actor, p.skill);
      });
    }
  }

  /** 換樓層時清空 */
  clear(): void {
    this.progress.clear();
    this.lastPosition.clear();
  }

  private interval(every: number): number {
    return every * (0.7 + this.rng.next() * 0.6);
  }

  private cast(actor: Actor, skillId: string): void {
    const skill = this.data.skills.get(skillId);
    this.executor.execute(actor, skill, 1, null, vec2(actor.position.x, actor.position.y), actor.facing);
  }
}
