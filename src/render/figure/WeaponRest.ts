import { alignTo } from './AiRig';
import { solveJoints, type FigureModel, type Joint, type Pose } from './FigureModel';
import { apply, mul, type V3 } from './Poly3D';

/**
 * 不攻擊時（待機、走路、受傷）拿武器的姿勢：
 * - restArm：手臂改成武器專屬的角度（法杖：上臂垂下、手肘彎成直角、前臂往前）
 * - upright：武器沿 axis（尾 → 頭）直立朝上，依目前的手臂算武器關節的角度（身體前傾、呼吸時仍是直的）
 * - rest：其他武器在武器關節額外轉的角度（斧頭橫拿、弓直立在身前）
 */
/** PolyFigure 的 WeaponMount 用到的欄位（不 import PolyFigure，避免互相引用） */
export interface RestMount {
  joint: Joint;
  axis: [V3, V3];
  rest?: V3;
  restArm?: Partial<Record<Joint, V3>>;
  upright?: boolean;
}

export function restPose(model: Pick<FigureModel, 'parts' | 'hipHeight'>, pose: Pose, mount: RestMount): Pose {
  const joint = mount.joint;
  const out = mount.restArm ? { ...pose, angles: { ...pose.angles, ...mount.restArm } } : pose;
  if (mount.upright) {
    const w = solveJoints(model.parts, model.hipHeight, { ...out, angles: { ...out.angles, [joint]: [0, 0, 0] } });
    const f = w.get(joint);
    const parent = model.parts.find((p) => p.joint === joint)?.parent;
    if (!f || !parent) return out;
    const [a, b] = mount.axis;
    const along: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    // 只轉最少的角度讓 axis 朝正上方，再換回相對手的角度（jointRotation = Ry · Rx · Rz）
    const upM = mul(alignTo(apply(f.m, along), [0, 1, 0]), f.m);
    const pm = w.get(parent)!.m;
    const local = mul([pm[0], pm[3], pm[6], pm[1], pm[4], pm[7], pm[2], pm[5], pm[8]], upM);
    return { ...out, angles: { ...out.angles, [joint]: [Math.asin(Math.max(-1, Math.min(1, -local[5]))), Math.atan2(local[2], local[8]), Math.atan2(local[3], local[4])] } };
  }
  const rest = mount.rest;
  if (!rest) return out;
  const b = out.angles[joint] ?? [0, 0, 0];
  return { ...out, angles: { ...out.angles, [joint]: [b[0] + rest[0], b[1] + rest[1], b[2] + rest[2]] } };
}
