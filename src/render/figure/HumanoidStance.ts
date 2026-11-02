import type { FigureModel, Joint, Pose } from './FigureModel';
import type { V3 } from './Poly3D';
import { flatFeet, makeStance, mergeAngles, type Angles } from './Stance';

/**
 * 人形怪物統一的站姿（待機；招式與走路不變）：
 * - skeleton：骷髏戰士的戰鬥站姿（左腳在前、膝微彎、身體微轉；右手垂在前下、左手舉在身前）。
 * - knight：墮落騎士的站姿（兩腳大開、挺胸；右手把武器扛在肩上、左拳垂在身側），給重甲的怪物。
 * - behemoth：熔岩巨獸的站姿（兩腳大開、微駝；雙臂粗重地垂在身前、拳頭接近地面），給要塞魔像。
 * 站姿只蓋掉身體與手臂的關節，其他會動的部位（燈籠、光環、圍巾）照原本的動作；腳底依這隻怪物的骨架貼地。
 */

const SKELETON_BODY: Angles = {
  root: [0.1, -0.15, 0],
  torso: [0.16, -0.12, 0.05],
  neck: [-0.12, 0.1, 0],
  head: [-0.18, 0.12, -0.05],
  thighL: [-0.5, 0, 0.1],
  shinL: [0.33, 0, 0],
  footL: [0, 0.17, -0.1],
  thighR: [0.2, 0, -0.12],
  shinR: [0.1, 0, 0],
  footR: [0, -0.45, 0.12],
};
/** 骷髏戰士的手：右手持武器垂在前下、左手舉在身前 */
export const SKELETON_ARMS: Angles = {
  upperArmR: [0.2, 0, -0.18],
  forearmR: [-0.75, 0, 0],
  handR: [0.35, 0.3, 0],
  upperArmL: [-0.55, 0, 0.25],
  forearmL: [-0.95, 0, 0],
  handL: [0.2, 0, 0],
};
const KNIGHT_BODY: Angles = {
  root: [0.04, -0.12, 0],
  torso: [-0.1, 0.1, 0],
  neck: [0.04, 0, 0],
  head: [-0.08, 0.04, 0],
  thighL: [-0.28, 0.1, 0.22],
  shinL: [0.32, 0, 0],
  footL: [0, 0.25, -0.22],
  thighR: [0.12, -0.15, -0.22],
  shinR: [0.22, 0, 0],
  footR: [0, -0.35, 0.22],
};
/** 墮落騎士的手：右手把武器扛在肩上（武器往後上）、左拳垂在身側 */
const KNIGHT_ARMS: Angles = {
  upperArmR: [-0.39, 0, -0.3],
  forearmR: [-2.1, 0, 0],
  handR: [-1.22, 0, 0],
  upperArmL: [0.14, 0, 0.3],
  forearmL: [-0.25, 0, 0],
  handL: [-0.1, 0, 0],
};

const BEHEMOTH_BODY: Angles = { ...KNIGHT_BODY, root: [0.076, -0.12, 0], torso: [-0.004, 0.1, 0], neck: [-0.032, 0, 0], head: [-0.128, 0.04, 0] };
/** 熔岩巨獸的手：雙臂垂在身前、微微往外，拳頭朝下 */
const BEHEMOTH_ARMS: Angles = {
  upperArmR: [-0.172, 0, -0.38],
  forearmR: [-0.35, 0, 0],
  handR: [0.45, 0, 0],
  upperArmL: [-0.172, 0, 0.38],
  forearmL: [-0.35, 0, 0],
  handL: [0.45, 0, 0],
};

const add = (a: V3 | undefined, b: V3): V3 => (a ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : b);

/** keep：這些關節維持模型自己的動作（例如晃動的燈籠） */
function stanced(model: FigureModel, body: Angles, arms: Angles, keep: readonly Joint[] = []): FigureModel {
  const { planted } = makeStance(model.parts, model.hipHeight);
  const base = planted(flatFeet(mergeAngles(body, arms)));
  const breathing = ['torso', 'head'] as const;
  return {
    ...model,
    poses: {
      ...model.poses,
      ready: (t): Pose => {
        const own = model.poses.ready(t);
        const angles: Partial<Record<Joint, V3>> = { ...own.angles, ...base.angles };
        for (const joint of keep) {
          const mine = own.angles[joint];
          if (mine) angles[joint] = mine;
          else delete angles[joint];
        }
        const breath = Math.sin(t * 2);
        angles[breathing[0]] = add(base.angles.torso, [breath * 0.025, Math.sin(t * 0.9) * 0.03, 0]);
        angles[breathing[1]] = add(base.angles.head, [Math.sin(t * 0.8 + 1) * 0.04, Math.sin(t * 0.7) * 0.14, 0]);
        return { ...base, angles };
      },
    },
  };
}

/** 骷髏戰士的站姿；arms 蓋掉要不一樣的手（法杖要直立、爪子要舉起） */
export const skeletonStance = (model: FigureModel, arms: Angles = {}, keep: readonly Joint[] = []): FigureModel => stanced(model, SKELETON_BODY, { ...SKELETON_ARMS, ...arms }, keep);
/** 墮落騎士的站姿 */
export const knightStance = (model: FigureModel): FigureModel => stanced(model, KNIGHT_BODY, KNIGHT_ARMS);
/** 熔岩巨獸的站姿 */
export const behemothStance = (model: FigureModel): FigureModel => stanced(model, BEHEMOTH_BODY, BEHEMOTH_ARMS);
