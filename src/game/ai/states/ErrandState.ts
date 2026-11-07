import { distance, normalize, sub } from '../../../core/math/Vec2';
import { findPathFor, type AiContext, type IAiState } from '../IAiState';

/** 走到這麼近（加上自己的半徑）就撿得到藥水 / 吃得到屍體（Tile） */
const REACH = 0.4;

/**
 * 離開戰鬥去做一件事（Errands.pickErrand 決定），途中不出手：
 * - 撿藥水：走到藥水上當場喝掉，回復最大 HP 的 potion.heal；藥水消失，主角撿不到
 * - 吃屍體：走到屍體上吃 devour.duration 秒，回血、體型變大、傷害提高；屍體消失
 * - 復活：屍體在 raise.range 內就站著施法 raise.duration 秒，屍體站起來（GameWorld 生成）
 * 藥水被撿走、屍體被吃掉或走不到就放棄，回頭打原本的目標。
 */
export class ErrandState implements IAiState {
  readonly name = 'errand' as const;

  enter(ctx: AiContext): void {
    const { self, brain, events } = ctx;
    self.intent = null;
    self.path = [];
    brain.slot = null;
    brain.waiting = false;
    brain.flanking = false;
    if (brain.errand) events.emit('EnemyErrand', { actorId: self.id, kind: brain.errand.kind });
  }

  update(ctx: AiContext) {
    const { self, brain, surroundings, tactics, events, dt } = ctx;
    const errand = brain.errand;
    if (!errand) return this.done(ctx);
    const exists =
      errand.kind === 'potion' ? surroundings.groundItems.some((g) => g.id === errand.itemId) : surroundings.corpses.includes(errand.corpse);
    if (!exists) return this.done(ctx);
    const reach = errand.kind === 'raise' ? tactics.raise.range : REACH + self.radius;
    if (distance(self.position, errand.position) > reach) {
      if (!self.isMoving && brain.dodgeTimer <= 0) {
        self.path = findPathFor(ctx, errand.position);
        if (self.path.length === 0) return this.done(ctx);
      }
      return null;
    }
    self.path = [];
    const toward = sub(errand.position, self.position);
    if (toward.x !== 0 || toward.y !== 0) self.facing = normalize(toward);
    if (errand.kind === 'potion') {
      const before = self.hp;
      self.hp = Math.min(self.maxHp, self.hp + self.maxHp * tactics.potion.heal);
      brain.drankPotion = true;
      events.emit('EnemyDrankPotion', { actorId: self.id, itemId: errand.itemId, healed: self.hp - before });
      return this.done(ctx);
    }
    errand.timer -= dt;
    if (errand.timer > 0) return null;
    if (errand.kind === 'devour') {
      const config = tactics.devour;
      self.hp = Math.min(self.maxHp, self.hp + self.maxHp * config.heal);
      self.growth *= 1 + config.grow;
      self.stats.addModifier({ stat: 'damageBonus', kind: 'flat', value: config.damage, source: 'devour' });
      brain.eats++;
    } else {
      brain.raises++;
      brain.raiseCooldown = tactics.raise.cooldown;
    }
    events.emit('CorpseConsumed', { actorId: self.id, corpse: errand.corpse, kind: errand.kind });
    return this.done(ctx);
  }

  private done({ self, brain, targeting }: AiContext) {
    brain.errand = null;
    self.path = [];
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    return target ? ('chase' as const) : ('return' as const);
  }
}
