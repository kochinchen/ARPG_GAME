import { distance } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import type { AiContext, IAiState } from '../IAiState';

/**
 * 傳令兵（求援）：自己這一群被打掉超過一半時，離開戰場跑去叫附近閒置的其他群（SquadTactics 指定）。
 * 途中被打也不回頭；走到那一群旁邊就叫醒牠們一起追主角，叫完所有的群再回來打。
 * 打倒傳令兵就叫不到援兵。
 */
export class CallState implements IAiState {
  readonly name = 'call' as const;

  enter({ self, brain, events }: AiContext): void {
    self.intent = null;
    self.path = [];
    brain.slot = null;
    brain.waiting = false;
    events.emit('EnemyCalling', { actorId: self.id, packs: brain.callPacks.length });
  }

  update(ctx: AiContext) {
    const { self, brain, actors, nav, pathfinder, tactics, rng, events, targeting } = ctx;
    const reinforce = tactics.reinforce;
    while (brain.callPacks.length > 0) {
      const id = brain.callPacks[0]!;
      const members = actors.filter((a) => a !== self && a.alive && a.ai?.pack?.id === id);
      const idle = members.filter((a) => a.ai!.state === 'idle' && a.ai!.alertTargetId === null);
      const nearest = closest(self, idle);
      if (!nearest) {
        brain.callPacks.shift();
        continue;
      }
      if (distance(self.position, nearest.position) <= reinforce.reachDistance && nav.hasLineOfSight(self.position, nearest.position, 0)) {
        for (const m of members) {
          m.ai!.packCalled = true;
          if (!idle.includes(m)) continue;
          m.ai!.alertTargetId = brain.callTargetId;
          m.ai!.alertTimer = rng.range(0.2, 0.5);
        }
        events.emit('EnemyAlerted', { actorId: self.id, allies: idle.length });
        brain.callPacks.shift();
        continue;
      }
      if (!self.isMoving) {
        const path = pathfinder.findPath(self.position, nearest.position, self.radius);
        if (path.length === 0) brain.callPacks.shift();
        else self.path = path;
      }
      return null;
    }
    // 叫完了：回去打原本的目標
    brain.targetId = brain.callTargetId;
    brain.callTargetId = null;
    self.path = [];
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    return target ? ('chase' as const) : ('return' as const);
  }
}

function closest(self: Actor, actors: readonly Actor[]): Actor | null {
  let best: Actor | null = null;
  for (const a of actors) if (!best || distance(self.position, a.position) < distance(self.position, best.position)) best = a;
  return best;
}
