import type { Rng } from '../../core/Rng';
import { distance } from '../../core/math/Vec2';
import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import { nearestDevice } from '../skills/DeviceSystem';
import type { AiStateName } from './AiBrain';
import type { AiContext, IAiState } from './IAiState';
import { ChaseState } from './states/ChaseState';
import { IdleState } from './states/IdleState';
import { ReturnState } from './states/ReturnState';
import { SquadTactics } from './SquadTactics';

/** 被打中後持續追擊的秒數（超過 Leash 也不回家） */
const ANGER_SECONDS = 4;

/**
 * 對每個有 AiBrain 的 Actor 執行狀態機。怪物與（未來的）召喚物共用，只是敵對陣營不同。
 */
export class AiSystem {
  private readonly states: Record<AiStateName, IAiState> = {
    idle: new IdleState(),
    chase: new ChaseState(),
    return: new ReturnState(),
  };

  private readonly squad: SquadTactics;

  constructor(
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    private readonly pathfinder: Pathfinder,
    private readonly skills: DataTable<SkillDef>,
    private readonly rng: Rng,
    /** 怪物何時改打機關（aggroRange、attraction、retargetMargin） */
    private readonly devices: Balance['devices'],
    tactics: Balance['enemyTactics'],
    private readonly events: GameEventBus,
  ) {
    this.squad = new SquadTactics(tactics, nav, rng);
    // 被攻擊時記錄仇恨來源
    events.on('ActorDamaged', (e) => {
      const target = targeting.getActor(e.targetId);
      if (target?.ai && e.sourceId !== null) {
        target.ai.provokedBy = e.sourceId;
        target.ai.angerTimer = ANGER_SECONDS;
      }
    });
  }

  update(actors: readonly Actor[], dt: number): void {
    this.squad.update(actors, dt);
    for (const self of actors) {
      const brain = self.ai;
      if (!brain || !self.alive || self.isDisabled) continue;
      brain.angerTimer = Math.max(0, brain.angerTimer - dt);
      const ctx: AiContext = {
        self,
        brain,
        actors,
        targeting: this.targeting,
        nav: this.nav,
        pathfinder: this.pathfinder,
        skills: this.skills,
        rng: this.rng,
        dt,
      };
      if (self.faction === 'enemy') this.lureToDevice(ctx);
      const next = this.states[brain.state].update(ctx);
      if (next !== null && next !== brain.state) {
        const from = brain.state;
        brain.state = next;
        this.states[next].enter(ctx);
        // 自己發現或被打而開始追擊：招呼附近的同伴（被叫來的不再往外叫）
        if (from === 'idle' && next === 'chase' && !brain.rallied && brain.targetId !== null && self.faction === 'enemy' && !self.isBoss) {
          const called = this.squad.rally(self, brain.targetId, actors);
          this.events.emit('EnemyAlerted', { actorId: self.id, allies: called });
        }
      }
    }
  }

  /**
   * 機關在附近（aggroRange 內）且比主角「更有吸引力」時改打機關；打壞後由 DeviceSystem 把目標改回玩家。
   * 機關的有效距離 = 實際距離 ÷ attraction（< 1），同樣距離一定先打主角；
   * 在兩者之間換目標，新目標的有效距離要短 retargetMargin 以上。
   */
  private lureToDevice(ctx: AiContext): void {
    const { self, brain, actors, targeting } = ctx;
    const { aggroRange, attraction, retargetMargin } = this.devices;
    const current = brain.targetId === null ? null : targeting.getActor(brain.targetId);
    const onDevice = !!current?.device && current.alive;
    const device = onDevice ? current : nearestDevice(self, actors, aggroRange);
    if (!device) return;
    const hostile = nearestHostile(self, actors, targeting);
    const deviceScore = gap(self, device) / attraction;
    const hostileScore = hostile ? gap(self, hostile) : Infinity;
    if (onDevice) {
      // 主角明顯更近（或機關已在範圍外）：改回打主角
      if (hostile && (gap(self, device) > aggroRange || hostileScore * (1 + retargetMargin) < deviceScore)) {
        brain.targetId = hostile.id;
        self.intent = null;
      }
      return;
    }
    if (deviceScore * (1 + retargetMargin) >= hostileScore) return;
    brain.targetId = device.id;
    self.intent = null;
    if (brain.state !== 'chase') {
      brain.state = 'chase';
      this.states.chase.enter(ctx);
    }
  }
}

/** 兩者邊緣之間的距離 */
const gap = (self: Actor, other: Actor): number => distance(self.position, other.position) - other.radius;

/** 最近的敵對目標（不含機關）：主角、召喚物 */
function nearestHostile(self: Actor, actors: readonly Actor[], targeting: TargetingService): Actor | null {
  let best: Actor | null = null;
  let bestGap = Infinity;
  for (const other of actors) {
    if (!other.alive || other.device || !targeting.isHostile(self.faction, other.faction)) continue;
    const g = gap(self, other);
    if (g < bestGap) {
      best = other;
      bestGap = g;
    }
  }
  return best;
}
