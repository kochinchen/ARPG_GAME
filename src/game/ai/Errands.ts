import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { CorpseView, Errand } from './AiBrain';
import type { AiContext } from './IAiState';

/** 沒找到藥水 / 屍體時，隔這麼多秒再找 */
const SCAN_INTERVAL = 0.5;

/**
 * 追擊中的怪要不要先去做別的事（依序）：
 * 1. 撿藥水（potion）：血量低於 potion.hpBelow、附近地上有藥水 → 跑去撿、當場喝掉（每隻一次）
 * 2. 吃屍體（devour）：血量低於 devour.hpBelow、附近有屍體 → 走過去吃，回血變大（最多 maxEats 次）
 * 3. 復活（raise）：冷卻好、附近有不死族的屍體 → 施法讓牠站起來（最多 max 次）
 * 別的怪已經要去撿 / 吃 / 復活的不重複。
 */
export function pickErrand(ctx: AiContext): Errand | null {
  const { self, brain, tactics, surroundings } = ctx;
  if (self.isBoss || self.moveSpeed <= 0 || brain.tactics.length === 0 || brain.scanTimer > 0) return null;
  const hp = self.hp / self.maxHp;
  const can = (t: 'potion' | 'devour' | 'raise') => brain.tactics.includes(t);
  const wantsPotion = can('potion') && !brain.drankPotion && hp < tactics.potion.hpBelow;
  const wantsDevour = can('devour') && brain.eats < tactics.devour.maxEats && hp < tactics.devour.hpBelow;
  const wantsRaise = can('raise') && brain.raises < tactics.raise.max && brain.raiseCooldown <= 0;
  if (!wantsPotion && !wantsDevour && !wantsRaise) return null;
  brain.scanTimer = SCAN_INTERVAL;
  const claimed = claims(ctx.actors, self);
  if (wantsPotion) {
    let best: { id: number; position: Errand['position']; d: number } | null = null;
    for (const g of surroundings.groundItems) {
      if (g.content.kind !== 'potion' || claimed.items.has(g.id)) continue;
      const d = distance(self.position, g.position);
      if (d <= tactics.potion.range && (!best || d < best.d)) best = { id: g.id, position: g.position, d };
    }
    if (best) return { kind: 'potion', itemId: best.id, position: best.position };
  }
  if (wantsDevour) {
    const corpse = nearestCorpse(ctx, tactics.devour.range, claimed.corpses, () => true);
    if (corpse) return { kind: 'devour', corpse, position: corpse.position, timer: tactics.devour.duration };
  }
  if (wantsRaise) {
    const corpse = nearestCorpse(ctx, tactics.raise.range, claimed.corpses, (c) => {
      const def = ctx.enemies.has(c.defId) ? ctx.enemies.get(c.defId) : null;
      return !!def && def.family === 'undead' && !def.boss && !def.treasure;
    });
    if (corpse) return { kind: 'raise', corpse, position: corpse.position, timer: tactics.raise.duration };
  }
  return null;
}

/**
 * 誘敵：血量低於 lure.hpBelow 時擲一次機率，往附近另一群閒置的怪逃（不叫醒牠們）；
 * 追過來的主角走進牠們的視野就會一起打。回傳逃往的位置，不逃回傳 null。
 */
export function pickLure(ctx: AiContext): Vec2 | null {
  const { self, brain, tactics, rng } = ctx;
  if (brain.lureRolled || self.isBoss || brain.solitary || self.moveSpeed <= 0 || self.hp / self.maxHp >= tactics.lure.hpBelow) return null;
  brain.lureRolled = true;
  if (!rng.chance(tactics.lure.chance)) return null;
  return pickLureSpot(ctx);
}

function pickLureSpot({ self, brain, actors, targeting, tactics }: AiContext): Vec2 | null {
  const target = brain.targetId === null ? null : targeting.getActor(brain.targetId);
  if (!target) return null;
  let best: { actor: Actor; d: number } | null = null;
  for (const other of actors) {
    const ai = other.ai;
    if (other === self || !other.alive || !ai || other.faction !== self.faction || other.isBoss || ai.solitary) continue;
    if (ai.state !== 'idle' || ai.alertTargetId !== null) continue;
    if (brain.pack && ai.pack?.id === brain.pack.id) continue;
    // 已經看得到主角的不算（等一下就會自己過來）
    if (distance(other.position, target.position) <= ai.detectRange) continue;
    const d = distance(self.position, other.position);
    if (d <= tactics.lure.range && (!best || d < best.d)) best = { actor: other, d };
  }
  return best ? best.actor.position : null;
}

function nearestCorpse(ctx: AiContext, range: number, claimed: ReadonlySet<CorpseView>, ok: (c: CorpseView) => boolean): CorpseView | null {
  let best: { corpse: CorpseView; d: number } | null = null;
  for (const c of ctx.surroundings.corpses) {
    if (claimed.has(c)) continue;
    const d = distance(ctx.self.position, c.position);
    if (d > range || (best && d >= best.d) || !ok(c)) continue;
    if (!ctx.nav.hasLineOfSight(ctx.self.position, c.position, 0)) continue;
    best = { corpse: c, d };
  }
  return best?.corpse ?? null;
}

/** 其他怪已經要去撿的藥水、要吃 / 要復活的屍體 */
function claims(actors: readonly Actor[], self: Actor): { items: Set<number>; corpses: Set<CorpseView> } {
  const items = new Set<number>();
  const corpses = new Set<CorpseView>();
  for (const a of actors) {
    const errand = a !== self && a.alive ? a.ai?.errand : null;
    if (!errand) continue;
    if (errand.kind === 'potion') items.add(errand.itemId);
    else corpses.add(errand.corpse);
  }
  return { items, corpses };
}
