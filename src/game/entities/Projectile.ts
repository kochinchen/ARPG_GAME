import type { Vec2 } from '../../core/math/Vec2';
import type { EffectDef } from '../../data/schema/effects';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from './Actor';

/** 飛行中的投射物。擊中敵人或牆壁時執行 onHit。 */
export interface Projectile {
  id: number;
  /** 發射者；發射者死亡後投射物仍會繼續飛行並造成傷害 */
  caster: Actor;
  skill: SkillDef;
  rank: number;
  position: Vec2;
  prevPosition: Vec2;
  /** 單位向量 */
  direction: Vec2;
  speed: number;
  radius: number;
  /** 剩餘飛行距離 */
  remaining: number;
  pierceLeft: number;
  /** 已擊中過的角色，穿透時不重複擊中 */
  hitIds: Set<number>;
  onHit: EffectDef[];
  alive: boolean;
}
