import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Actor, ActorId, Faction } from '../entities/Actor';

/** 以 World 座標點選時的容許誤差（Tile） */
const PICK_TOLERANCE = 0.4;

/**
 * 回答「誰是合法目標」「這個點附近有沒有敵人」。只查詢，不修改任何狀態。
 */
export class TargetingService {
  constructor(private readonly actors: readonly Actor[]) {}

  getActor(id: ActorId): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  /** player 與 summon 同一陣營，與 enemy 敵對 */
  isHostile(a: Faction, b: Faction): boolean {
    return (a === 'enemy') !== (b === 'enemy');
  }

  /** 目標存在、活著、且與 source 敵對才回傳 */
  getValidTarget(source: Actor, id: ActorId): Actor | null {
    const target = this.getActor(id);
    if (!target || !target.alive || !this.isHostile(source.faction, target.faction)) return null;
    return target;
  }

  /** 以 center 為圓心、半徑 radius 內（含目標自身半徑）所有活著的敵對角色 */
  hostilesWithin(source: Actor, center: Vec2, radius: number): Actor[] {
    return this.actors.filter(
      (a) => a.alive && this.isHostile(source.faction, a.faction) && distance(a.position, center) <= radius + a.radius,
    );
  }

  /** 離 source 最近、距離 range 內（含目標自身半徑）的敵對角色 */
  nearestHostile(source: Actor, range: number): Actor | null {
    let best: Actor | null = null;
    let bestDistance = Infinity;
    for (const actor of this.actors) {
      if (!actor.alive || !this.isHostile(source.faction, actor.faction)) continue;
      const d = distance(actor.position, source.position) - actor.radius;
      if (d <= range && d < bestDistance) {
        best = actor;
        bestDistance = d;
      }
    }
    return best;
  }

  /** World 座標點選：回傳最接近該點的敵對目標 */
  pickAt(source: Actor, worldPos: Vec2): Actor | null {
    let best: Actor | null = null;
    let bestDistance = Infinity;
    for (const actor of this.actors) {
      if (!actor.alive || !this.isHostile(source.faction, actor.faction)) continue;
      const d = distance(actor.position, worldPos);
      if (d <= actor.radius + PICK_TOLERANCE && d < bestDistance) {
        best = actor;
        bestDistance = d;
      }
    }
    return best;
  }
}
