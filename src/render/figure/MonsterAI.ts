import { aiFigure, aiPoints, alignDown, alignTo, I3, sub, type AiMonsterData } from './AiRig';
import { mapPoses } from './bosses/BossPoses';
import { grounded, skinVerts, solveJoints, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from './FigureModel';
import { apply, box, jointRotation, mul, prism, type M3, type Mesh, type V3 } from './Poly3D';

/**
 * AI 版的一般人形怪（1～3 層的不死系起）：設計者生成的 TRELLIS 模型（art/monsters/<怪物>/ai/trellis-1.glb），
 * 由 scripts/monster_ai.py 減面、接上骨架（關節名稱同 MonsterParts.humanoid）、算好權重，每個三角形一個顏色。
 *
 * 動作、大小、步頻都沿用舊版模型（classic）：只換外觀。四肢在遊戲的靜止姿勢是筆直往下、腰挺直，
 * 所以這些關節轉正（只轉方向、不改形狀；駝背的食屍鬼由舊版的動作彎回去）。頭維持模型原本朝前的樣子。
 * 舊版的姿勢依舊版的腿長貼地，這裡依 AI 模型的腳重新貼地。
 * 武器沿用舊版程式畫的（握點在手腕，依 AI 模型的前臂長度縮放）：AI 生成的四視圖是空手。
 */

export interface MonsterAiOptions {
  /** 拿在手上的東西（舊版的關節座標、握點在手腕） */
  held?: Partial<Record<Joint, readonly Mesh[]>>;
  /** 垂掛的東西（燈籠）：掛在 parent 關節的原點（手腕），不管手怎麼擺都朝正下方垂著；網格是舊版的座標（往 -Y 垂下） */
  hang?: { joint: Joint; parent: Joint; meshes: readonly Mesh[]; scale: number };
  /** held 的個別倍率（例如鐵籠面罩要配合頭的大小） */
  heldScaleOf?: Partial<Record<Joint, number>>;
  /** 這些關節在生成的模型裡已經是待機的姿勢（駝背）：不轉正，動作只加上舊版和待機的差 */
  modeled?: readonly Joint[];
  /**
   * 靜止姿勢：humanoid（預設）= 四肢轉成筆直往下、腰挺直；asModeled = 照生成的樣子（蟲、漂浮的孢子：舊版的靜止姿勢本來就是那個樣子）
   */
  rest?: 'humanoid' | 'asModeled';
  /** 重新貼地：feet（預設）= 腳底、paws = 四隻腳掌（四足獸：前撲時前爪不會陷進地面）、all = 全身最低點（蟲）、none = 不貼地（漂浮的怪物照舊版的高度） */
  ground?: 'feet' | 'paws' | 'all' | 'none';
  /** 漂浮：模型最低點離地多高（遊戲單位；骨盆高度不變，模型整個往上移） */
  lift?: number;
  /**
   * 握在右手的劍：build(握把長度) 產生沿 -Y 的劍（握把正中間在原點）。握把長度配合 AI 模型拳頭的寬度，
   * 拳頭握在握把上，握把往劍尖依序是護手、rain-guard、劍身；劍與手臂垂直（手臂往下時劍尖朝前）
   */
  sword?: { build: (grip: number) => { meshes: Mesh[]; tip: number } };
  /** 左手的圓盾（盾面朝 +Y）：盾面朝外（手的 +X、與手臂平行，手臂平舉或下垂時盾面都垂直地面），放在拳頭外側、不和手臂重疊 */
  shield?: { meshes: readonly Mesh[]; scale: number };
  /**
   * 左手的弓（舊版的座標：握把在 grip、弓身沿手的 Z、弓弦在 +Y）：握把在拳心，手臂往前平舉時弓直立、弓弦朝自己。
   * 弓弦分上下兩段（從弓的兩端到中間）：拉弓時兩段被拉到右手的位置、放箭時彈回原位（往前多彈一點）；
   * 拉弓的後半段弦上搭著一支箭，放箭時箭消失（飛出去的箭由技能的投射物畫）
   */
  bow?: { meshes: readonly Mesh[]; grip: V3; scale: number; string: { y: number; half: number; color: number }; arrow: { color: number; fletch: number; head: number } };
  /**
   * 左手的法杖（網格沿 -Y 是杖頭方向，握點在原點）：穿過拳心、與手臂垂直（前臂往前平舉時杖身直立、杖頭朝上）
   */
  staff?: { meshes: readonly Mesh[] };
  /** 拿在手上的東西再放大幾倍（舊版的劍與盾放在 AI 模型上偏小） */
  heldScale?: number;
  /**
   * 大小：hip（預設）= 骨盆高度同舊版；height = 整隻的高度同舊版（毒液食屍鬼蹲得很低、背上的膿包很高，用骨盆高度對齊會大一圈）
   */
  fit?: 'hip' | 'height';
  /** 直接指定骨盆高度（遊戲單位）：背上的刺拉長後，用整隻的高度對齊會把身體縮小 */
  hip?: number;
  /** 武器尖端（舊版 handR 座標；省略時沿用舊版） */
  weaponTip?: V3;
}

const LIMB = /^(upperArm|forearm|hand|thigh|shin|foot)([LR])$/;

function scaled(meshes: readonly Mesh[], k: number): Mesh[] {
  return meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0] * k, v[1] * k, v[2] * k]) }));
}

const length = (v: V3) => Math.hypot(v[0], v[1], v[2]);

export function monsterAi(json: unknown, classic: FigureModel, o: MonsterAiOptions = {}): FigureModel {
  const data = json as AiMonsterData;
  const { J } = aiPoints(data);
  const modeled = new Set<string>(o.modeled ?? []);
  const rotOf = (j: string): M3 => {
    if (modeled.has(j) || o.rest === 'asModeled') return I3;
    if (j === 'torso') return alignTo(sub(J('neck'), J('torso')), [0, 1, 0]);
    const limb = LIMB.exec(j);
    if (!limb) return I3;
    const s = limb[2]!;
    if (limb[1] === 'upperArm') return alignDown(sub(J(`forearm${s}`), J(`upperArm${s}`)));
    if (limb[1] === 'thigh') return alignDown(sub(J(`shin${s}`), J(`thigh${s}`)));
    if (limb[1] === 'shin' || limb[1] === 'foot') return alignDown(sub(J(`foot${s}`), J(`shin${s}`)));
    return alignDown(sub(J(`hand${s}`), J(`forearm${s}`)));
  };
  const lift = o.lift ?? 0;
  let hip = o.hip ?? classic.hipHeight;
  if (o.fit === 'height' && o.hip === undefined) {
    // 舊版待機時的高度（駝背）↔ AI 模型的高度（腰、頭是生成的駝背樣子）
    const idlePose = classic.poses.ready(0);
    let classicTop = -Infinity;
    for (const [j, f] of solveJoints(classic.parts, classic.hipHeight, idlePose)) {
      for (const m of classic.parts.find((p) => p.joint === j)!.meshes) for (const v of m.verts) classicTop = Math.max(classicTop, f.p[1] + apply(f.m, v)[1]);
    }
    const aiTop = Math.max(...aiFigure(data, { hip }, rotOf).skin.verts.map((v) => v[1]));
    hip *= classicTop / aiTop;
  }
  const { parts, skin } = aiFigure(data, { hip: hip - lift }, rotOf);

  // 武器依前臂長度縮放（舊版的前臂 = 手腕關節離手肘的距離）
  const forearmOf = (model: { parts: readonly { joint: Joint; offset: V3 }[] }) => length(model.parts.find((p) => p.joint === 'handR')?.offset ?? [1, 0, 0]);
  const k = o.held || o.sword || o.shield || o.bow || o.staff ? (forearmOf({ parts }) / forearmOf(classic)) * (o.heldScale ?? 1) : 1;
  const held = o.held ?? {};
  const withHeld = parts.map((p) => {
    const extra = held[p.joint];
    return extra ? { ...p, meshes: [...p.meshes, ...scaled(extra, k * (o.heldScaleOf?.[p.joint] ?? 1))] } : p;
  });

  // 拳頭：權重大多在手上的頂點（手的靜止座標）；武器握在它的中心
  const S = o.shield ? length(parts.find((p) => p.joint === 'handR')!.offset) / length(sub(J('handR'), J('forearmR'))) : 1;
  const fistOf = (s: 'L' | 'R') => {
    const hand: Joint = `hand${s}`;
    const at = skin.rest[hand]!;
    const pts = skin.verts.filter((_, i) => skin.infl[i]!.some((x) => x.joint === hand && x.w > 0.6)).map((v) => sub(v, at));
    const span = (k: 0 | 1 | 2) => [Math.min(...pts.map((v) => v[k])), Math.max(...pts.map((v) => v[k]))] as const;
    const [x, y, z] = [span(0), span(1), span(2)];
    // 握點：拳頭的中心偏下（手指包住的地方），不是手腕
    return { center: [(x[0] + x[1]) / 2, y[0] + (y[1] - y[0]) * 0.4, (z[0] + z[1]) / 2] as V3, x, z };
  };
  const gearK = k;
  let tip = o.weaponTip ?? classic.weaponTip;
  let weaponJoint: Joint | undefined;
  if (o.sword) {
    const fist = fistOf('R');
    // 握把比拳頭寬一點（舊版的單位）
    const sword = o.sword.build(((fist.z[1] - fist.z[0]) / gearK) * 1.15);
    // 沿 -Y → 劍尖朝手的 +Z（與手臂垂直）
    const toGrip = (v: V3): V3 => [v[0] * gearK, v[2] * gearK, -v[1] * gearK];
    withHeld.push({ joint: 'weapon', parent: 'handR', offset: fist.center, meshes: sword.meshes.map((m) => ({ ...m, verts: m.verts.map(toGrip) })) });
    tip = toGrip([0, sword.tip, 0]);
    weaponJoint = 'weapon';
  }
  if (o.staff) {
    const toGrip = (v: V3): V3 => [v[0] * gearK, v[2] * gearK, -v[1] * gearK];
    withHeld.push({ joint: 'weaponL', parent: 'handL', offset: fistOf('L').center, meshes: o.staff.meshes.map((m) => ({ ...m, verts: m.verts.map(toGrip) })) });
  }
  if (o.hang) withHeld.push({ joint: o.hang.joint, parent: o.hang.parent, offset: [0, 0, 0], meshes: scaled(o.hang.meshes, k * o.hang.scale) });
  const windupOnly: Joint[] = [];
  let bowRig: { top: V3; bottom: V3; arrow: (nock: V3) => Mesh[] } | null = null;
  if (o.bow) {
    const fist = fistOf('L');
    const bk = gearK * o.bow.scale;
    const g = o.bow.grip;
    const local = (v: V3): V3 => [(v[0] - g[0]) * bk, (v[1] - g[1]) * bk, (v[2] - g[2]) * bk];
    const bm = o.bow.meshes.map((m) => ({ ...m, verts: m.verts.map(local) }));
    withHeld.push({ joint: 'weaponL', parent: 'handL', offset: fist.center, meshes: bm });
    const { y, half } = o.bow.string;
    const top = local([0, y, half]);
    const bottom = local([0, y, -half]);
    bowRig = {
      top,
      bottom,
      arrow: (nock) => {
        const w = 0.22 * bk;
        const len = nock[1] - top[1] + 9 * bk;
        const tipY = nock[1] - len;
        return [
          box(w, len, w, o.bow!.arrow.color, [nock[0], nock[1] - len / 2, nock[2]]),
          prism(4, tipY + 1.4 * bk, tipY, [0.5 * bk, 0.5 * bk], [0.04, 0.04], o.bow!.arrow.head, [nock[0], 0, nock[2]], 0),
          box(0.08 * bk, 2.4 * bk, 0.9 * bk, o.bow!.arrow.fletch, [nock[0], nock[1] - 1.6 * bk, nock[2]]),
          box(0.9 * bk, 2.4 * bk, 0.08 * bk, o.bow!.arrow.fletch, [nock[0], nock[1] - 1.6 * bk, nock[2]]),
        ];
      },
    };
  }
  if (o.shield) {
    const fist = fistOf('L');
    const sk = gearK * o.shield.scale;
    const sm = o.shield.meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[1] * sk, -v[0] * sk, v[2] * sk]) }));
    const back = Math.min(...sm.flatMap((m) => m.verts).map((v) => v[0]));
    // 盾背在拳頭外側再往外一點，盾心對著拳頭
    const out = fist.x[1] + 0.01 * S - back;
    withHeld.push({ joint: 'weaponL', parent: 'handL', offset: [out, fist.center[1], fist.center[2]], meshes: sm });
  }
  const idle = classic.poses.ready(0).angles;
  const relative = (p: Pose): Pose => {
    if (!modeled.size) return p;
    const angles = { ...p.angles };
    for (const j of modeled as Set<Joint>) {
      const a = angles[j] ?? [0, 0, 0];
      const b = idle[j] ?? [0, 0, 0];
      angles[j] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    return { ...p, angles };
  };
  const ground = o.ground ?? 'feet';
  const poses =
    ground === 'none' && !modeled.size
      ? classic.poses
      : mapPoses(classic.poses, (p, kind) =>
          ground === 'none'
            ? relative(p)
            : grounded(
                withHeld,
                hip,
                hangDown(withHeld, hip, (ground === 'feet' || ground === 'paws') && kind !== 'dead' ? levelFeet(withHeld, hip, relative(p)) : relative(p), o.hang?.joint),
                kind === 'dead' || ground === 'all' ? 'all' : ground === 'paws' ? ['footL', 'footR', 'handL', 'handR'] : ['footL', 'footR'],
              ),
        );
  const finalPoses = bowRig && o.bow ? stringPoses(poses, withHeld, hip, bowRig, fistOf('R').center, o.bow.string.color, windupOnly) : poses;
  // 次級運動（腰布）只有舊版有那個關節
  const { secondary: _, ...rest } = classic;
  return {
    ...rest,
    hipHeight: hip,
    parts: withHeld,
    skin,
    poses: finalPoses,
    softLight: true,
    ...(windupOnly.length ? { windupOnly } : {}),
    ...(weaponJoint && tip ? { weaponJoint, weaponTip: tip } : tip ? { weaponTip: [tip[0] * k, tip[1] * k, tip[2] * k] as V3 } : {}),
  };
}

/**
 * 弓弦：上下兩段（ex_stringT / ex_stringB，掛在弓上、支點在弓的兩端）。拉弓的姿勢（攻擊與施法的前搖）把兩段轉到右手拳心的位置，
 * 放箭的姿勢往前多彈一點（之後收回到 0 = 筆直），其他姿勢筆直。兩段的長度是拉到最滿時的長度（筆直時在中間重疊，看不出來）。
 * 拉弓時弦上的箭（ex_arrow）只在前搖的後半段出現。
 */
function stringPoses(set: PoseSet, parts: PartDef[], hip: number, rig: { top: V3; bottom: V3; arrow: (nock: V3) => Mesh[] }, rightFist: V3, color: number, windupOnly: Joint[]): PoseSet {
  /** 右手拳心在弓的座標裡的位置（弦只在弓的 YZ 平面裡彎；不會比弦的原位更往前） */
  const nockOf = (pose: Pose): V3 => {
    const w = solveJoints(parts, hip, pose);
    const hand = w.get('handR')!;
    const bow = w.get('weaponL')!;
    const palm = apply(hand.m, rightFist);
    const d = sub([hand.p[0] + palm[0], hand.p[1] + palm[1], hand.p[2] + palm[2]], bow.p);
    const m = bow.m;
    const local: V3 = [m[0] * d[0] + m[3] * d[1] + m[6] * d[2], m[1] * d[0] + m[4] * d[1] + m[7] * d[2], m[2] * d[0] + m[5] * d[1] + m[8] * d[2]];
    return [0, Math.max(rig.top[1], local[1]), local[2]];
  };
  const draws = [set.attackWindup, set.castWindup];
  const nocks = draws.map(nockOf);
  const halfLen = Math.max(...nocks.flatMap((n) => [Math.hypot(n[1] - rig.top[1], n[2] - rig.top[2]), Math.hypot(n[1] - rig.bottom[1], n[2] - rig.bottom[2])]));
  const w = Math.max(0.2, Math.abs(rig.top[2]) * 0.012);
  // 上段沿 -Z、下段沿 +Z（從弓的兩端往中間）
  parts.push(
    { joint: 'ex_stringT', parent: 'weaponL', offset: rig.top, meshes: [box(w, w, halfLen, color, [0, 0, -halfLen / 2])] },
    { joint: 'ex_stringB', parent: 'weaponL', offset: rig.bottom, meshes: [box(w, w, halfLen, color, [0, 0, halfLen / 2])] },
    { joint: 'ex_arrow', parent: 'weaponL', offset: [0, 0, 0], meshes: rig.arrow(nocks[0]!) },
  );
  windupOnly.push('ex_arrow');
  // 繞 X 轉多少，方向 (0, 0, dirZ) 會指向拉弦點（兩個符號試一下，取轉完最接近的）
  const angleTo = (from: V3, dirZ: 1 | -1, to: V3): number => {
    const d = sub(to, from);
    const L = Math.hypot(d[1], d[2]);
    const a = Math.atan2(Math.abs(d[1]), Math.abs(d[2]));
    const miss = (x: number) => {
      const r = apply(jointRotation([x, 0, 0]), [0, 0, dirZ]);
      return Math.hypot(r[1] - d[1] / L, r[2] - d[2] / L);
    };
    return miss(a) < miss(-a) ? a : -a;
  };
  const drawn = (pose: Pose, nock: V3, k = 1): Pose => ({
    ...pose,
    angles: { ...pose.angles, ex_stringT: [angleTo(rig.top, -1, nock) * k, 0, 0], ex_stringB: [angleTo(rig.bottom, 1, nock) * k, 0, 0] },
  });
  return {
    ...set,
    attackWindup: drawn(set.attackWindup, nocks[0]!),
    castWindup: drawn(set.castWindup, nocks[1]!),
    // 放箭：弦彈回來、往前多彈一點
    attackStrike: drawn(set.attackStrike, nocks[0]!, -0.12),
    castRelease: drawn(set.castRelease, nocks[1]!, -0.12),
  };
}

const transpose = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
/** 旋轉矩陣 → jointRotation 的角度（Ry · Rx · Rz） */
function eulerOf(m: M3): V3 {
  const x = Math.asin(Math.max(-1, Math.min(1, -m[5])));
  return [x, Math.atan2(m[2], m[8]), Math.atan2(m[3], m[4])];
}

/**
 * 腳板放平：舊版的站姿讓後腳腳尖往外轉、再依大腿與小腿的角度把腳往回壓，舊版的腳很短看不出來，
 * 生成的腳板長，腳尖就翹起來（骷髏的右腳）。這裡把兩腳的腳底轉成朝正下方（只轉最少的角度，腳尖的方向不變）
 */
/**
 * 蟲（虛空吞噬者、鑽地寄生蟲；設計者 2026-11-08）：嘴的一圈骨頭（monster_ai.py 的 ex_mouth?）快速一吐一吸，出招時張到最大再咬合；
 * 另外算出從地下垂直鑽出來的姿勢（身體豎直、頭朝上、尾巴埋在地裡約 1/4）
 */
export function wormLife(m: FigureModel, o: { amp: number; rate: number }): FigureModel {
  const bones = m.parts.filter((p) => p.joint.startsWith('ex_mouth')).length;
  const axes: V3[] = Array.from({ length: bones }, (_, i) => {
    const a = (2 * Math.PI * i) / bones;
    const d = 0.1;
    const r = alignTo([0, 0, 1], [Math.sin(d) * Math.cos(a), Math.sin(d) * Math.sin(a), Math.cos(d)]);
    return [Math.asin(Math.max(-1, Math.min(1, -r[5]))) / d, Math.atan2(r[2], r[8]) / d, Math.atan2(r[3], r[4]) / d];
  });
  const open = (p: Pose, k: number): Pose => {
    const angles = { ...p.angles } as Record<string, V3>;
    axes.forEach((v, i) => (angles[`ex_mouth${i}`] = [v[0] * k, v[1] * k, v[2] * k]));
    return { ...p, angles: angles as Pose['angles'] };
  };
  // 吐（張開）快、吸（縮回）稍慢，不像機械的正弦波
  const pulse = (x: number) => o.amp * Math.sin(x + 0.5 * Math.sin(x));
  const poses = m.poses;
  const up: Pose = open({ ...poses.ready(0), angles: { ...poses.ready(0).angles, root: [-1.25, 0, 0], torso: [0.3, 0, 0], neck: [0.3, 0, 0], head: [0.2, 0, 0] } }, o.amp * 1.6);
  const world = solveJoints(m.parts, m.hipHeight, { ...up, rootY: 0 });
  const ys = skinVerts(m.skin!, world).map((v) => v[1]);
  const [low, high] = [Math.min(...ys), Math.max(...ys)];
  return {
    ...m,
    poses: {
      ...poses,
      ready: (t) => open(poses.ready(t), pulse(t * o.rate)),
      run: (p) => open(poses.run(p), pulse(p * 1.3)),
      ...(poses.walk ? { walk: (p: number) => open(poses.walk!(p), pulse(p * 1.3)) } : {}),
      attackWindup: open(poses.attackWindup, o.amp * 2),
      attackStrike: open(poses.attackStrike, -o.amp * 0.6),
      castWindup: open(poses.castWindup, o.amp * 2),
      castRelease: open(poses.castRelease, -o.amp * 0.6),
      emerge: { ...up, rootY: -low - (high - low) * 0.25 },
    },
  };
}

/**
 * 四足獸的步態與咬合（骨刺獵獸；設計者 2026-11-09）。角度都是相對於生成模型的站姿（monsterAi 的 modeled）：
 * - 走路：四拍（左後 → 左前 → 右後 → 右前），每隻腳輪流抬起，脊椎左右輕擺。
 * - 跑步：狗的飛奔。e = cos(相位)：e = 1 伸展（腰往下凹、前腳往前伸直、後腳往後蹬直），e = -1 收縮（腰拱起、前後腳收到身體下方）；
 *   前腳往前收回的半圈手肘折起、後腳往前收回的半圈跗關節折起，伸展與收縮的瞬間身體離地。
 * - 咬合：前搖張大、出手時用力合上。
 */
export function houndLife(m: FigureModel): FigureModel {
  const PAWS: Joint[] = ['footL', 'footR', 'handL', 'handR'];
  const settle = (angles: Pose['angles']): Pose => grounded(m.parts, m.hipHeight, levelFeet(m.parts, m.hipHeight, { rootY: 0, angles }), PAWS);
  const withJaw = (p: Pose, a: number): Pose => ({ ...p, angles: { ...p.angles, jaw: [a, 0, 0] } });
  const P = m.poses;
  const walk = (p: number): Pose => {
    const a: Pose['angles'] = {
      root: [0, 0.05 * Math.sin(p), 0.02 * Math.sin(p)],
      torso: [0, -0.09 * Math.sin(p), -0.03 * Math.sin(p)],
      neck: [0.04 * Math.cos(p * 2), 0.06 * Math.sin(p), 0],
      head: [-0.03 * Math.cos(p * 2), 0, 0],
      ponytail: [-0.06, 0.28 * Math.sin(p - 1), 0],
      jaw: [0.12 + 0.05 * Math.sin(p * 2), 0, 0],
    };
    for (const [s, hind, fore] of [['L', p, p - Math.PI / 2], ['R', p + Math.PI, p + Math.PI / 2]] as const) {
      a[`thigh${s}`] = [-0.3 * Math.sin(hind), 0, 0];
      a[`shin${s}`] = [0.4 * Math.max(0, Math.cos(hind)), 0, 0];
      a[`upperArm${s}`] = [-0.3 * Math.sin(fore), 0, 0];
      a[`forearm${s}`] = [-0.55 * Math.max(0, Math.cos(fore)), 0, 0];
    }
    return settle(a);
  };
  const run = (p: number): Pose => {
    const e = Math.cos(p);
    const a: Pose['angles'] = {
      // 腰：伸展時屁股翹、胸口抬（腰往下凹），收縮時相反（拱背）
      root: [0.13 * e, 0.03 * Math.sin(p), 0],
      torso: [-0.3 * e, -0.05 * Math.sin(p), 0],
      // 頭維持看前方
      neck: [0.12 * e, 0, 0],
      head: [0.04 * e, 0, 0],
      ponytail: [-0.12 + 0.34 * Math.cos(p - 0.9), 0.12 * Math.sin(p), 0],
      jaw: [0.34 + 0.14 * Math.sin(p * 2), 0, 0],
    };
    // 兩側差一點相位（左腳領先）
    for (const [side, lead] of [['L', 0.28], ['R', 0]] as const) {
      const f = p + lead;
      const fe = Math.cos(f);
      const upper = -0.275 - 0.675 * fe;
      const fore = 0.54 + 0.24 * fe - 0.95 * Math.max(0, -Math.sin(f));
      a[`upperArm${side}`] = [upper, 0, 0];
      a[`forearm${side}`] = [fore, 0, 0];
      a[`hand${side}`] = [-(upper + fore) * 0.75, 0, 0];
      // 後腳：伸展時大腿往後、跗關節以下也往後甩；收縮時整條腿收到肚子下方
      const h = p + lead - 0.2;
      const he = Math.cos(h);
      const thigh = 0.75 * he;
      const shin = -0.375 - 0.375 * he + 0.45 * Math.max(0, Math.sin(h));
      a[`thigh${side}`] = [thigh, 0, 0];
      a[`shin${side}`] = [shin, 0, 0];
      a[`foot${side}`] = [0.325 + 0.525 * he - thigh - shin, 0, 0];
    }
    // 飛奔時腳掌跟著腿甩（不放平），伸展與收縮的瞬間離地
    const p0 = grounded(m.parts, m.hipHeight, { rootY: 0, angles: a }, PAWS);
    return { ...p0, rootY: p0.rootY + 1.8 * e * e };
  };
  return {
    ...m,
    // 平常的速度（3.6）用走路動作，跑步速度（EnemyDef.run）才用飛奔
    walkBelow: 4.2,
    poses: {
      ...P,
      ready: (t) => withJaw(P.ready(t), 0.12 + 0.08 * Math.sin(t * 2.4)),
      walk,
      run,
      attackWindup: withJaw(P.attackWindup, 0.85),
      attackStrike: withJaw(P.attackStrike, -0.35),
      castWindup: withJaw(P.castWindup, 0.8),
      castRelease: withJaw(P.castRelease, 0.95),
      hit: withJaw(P.hit, 0.5),
      dead: withJaw(P.dead, 0.65),
    },
  };
}

/** 角甲巨獸（設計者 2026-11-10）：衝鋒前壓低身體、低頭把犀角對準前方，衝出去時頭往上一挑 */
export function bruteLife(m: FigureModel): FigureModel {
  const P = m.poses;
  const add = (p: Pose, more: Pose['angles'], rootY = p.rootY): Pose => ({ ...p, rootY, angles: { ...p.angles, ...more } });
  const rest = P.ready(0);
  const lowered = add(rest, { root: [0.14, 0, 0], torso: [0.08, 0, 0], neck: [0.45, 0, 0], head: [0.3, 0, 0], ponytail: [0.3, 0, 0] }, -2.5);
  const gore = add(rest, { root: [0.05, 0, 0], torso: [-0.05, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0], ponytail: [-0.2, 0, 0] }, 1);
  return { ...m, poses: { ...P, attackVariants: { ...P.attackVariants, overhead: { windup: [lowered, lowered], strike: [gore], strikeTime: 0.3 } } } };
}

/**
 * 毒沫噴吐者（設計者 2026-11-10）：蟾蜍一跳一跳地移動（蹬直後腿、前腳往前伸，落地蹲回去）；
 * 吐毒前抬頭、喉囊往兩側鼓起，吐的時候頭往前甩、嘴張大
 */
export function toadLife(m: FigureModel): FigureModel {
  type Angles = Pose['angles'];
  const P = m.poses;
  const add = (p: Pose, more: Angles, rootY = p.rootY): Pose => ({ ...p, rootY, angles: { ...p.angles, ...more } });
  const rest = P.ready(0);
  const sac = (open: number, puff: number): Angles => ({ jaw: [open, 0, 0], ex_sacL: [0, 0, puff], ex_sacR: [0, 0, -puff] });
  const hop = (p: number): Pose => {
    const up = Math.max(0, Math.sin(p));
    const land = Math.max(0, -Math.sin(p));
    return add(rest, {
      root: [-0.22 * up + 0.08 * land, 0, 0],
      neck: [0.1 * up, 0, 0],
      thighL: [0.75 * up, 0, 0],
      thighR: [0.75 * up, 0, 0],
      shinL: [-0.45 * up, 0, 0],
      shinR: [-0.45 * up, 0, 0],
      footL: [0.45 * up, 0, 0],
      footR: [0.45 * up, 0, 0],
      upperArmL: [-0.55 * up, 0, 0],
      upperArmR: [-0.55 * up, 0, 0],
      ...sac(0.04 + 0.1 * up, 0.05 * land),
    }, 7 * up - 1.2 * land);
  };
  const breathe = (t: number) => sac(0.05, 0.12 + 0.1 * Math.sin(t * 2.2));
  const gulp = add(rest, { root: [-0.18, 0, 0], torso: [-0.14, 0, 0], neck: [-0.28, 0, 0], head: [-0.1, 0, 0], ...sac(0.18, 0.5) }, -1.5);
  const spit = add(rest, { root: [0.12, 0, 0], torso: [0.2, 0, 0], neck: [0.34, 0, 0], ...sac(0.72, 0.08) }, 1.5);
  return {
    ...m,
    poses: {
      ...P,
      ready: (t) => add(P.ready(t), breathe(t)),
      run: hop,
      walk: hop,
      castWindup: gulp,
      castRelease: spit,
      attackWindup: gulp,
      attackStrike: spit,
      hit: add(P.hit, sac(0.45, 0.2)),
      dead: add(P.dead, sac(0.6, 0.1)),
    },
  };
}

/**
 * 血鱗獵蜥（設計者 2026-11-10）：尾巴三節像鞭子一樣甩，張嘴咬合；骨球橫掃整個身體轉過去，尾巴掃過身後；
 * 重砸後腳蹬起、向前翻筋斗，尾巴砸在前方的地上，四腳朝天掙扎，2 秒後才翻回來
 */
export function lizardLife(m: FigureModel): FigureModel {
  type Angles = Pose['angles'];
  const P = m.poses;
  const add = (p: Pose, more: Angles): Pose => ({ ...p, angles: { ...p.angles, ...more } });
  const sway = (t: number, amp: number): Angles => ({ ponytail: [0, amp * Math.sin(t), 0], ex_tail1: [0, amp * 1.2 * Math.sin(t - 0.7), 0], ex_tail2: [0, amp * 1.4 * Math.sin(t - 1.4), 0] });
  const rest = P.ready(0);
  const tail = (a: number, b: number, c: number, yaw = 0): Angles => ({ ponytail: [a, yaw, 0], ex_tail1: [b, yaw * 0.6, 0], ex_tail2: [c, yaw * 0.35, 0] });
  const biteOpen = add(P.attackWindup, { jaw: [0.95, 0, 0], neck: [-0.34, 0, 0], head: [-0.16, 0, 0] });
  const biteShut = add(P.attackStrike, { jaw: [-0.3, 0, 0], neck: [0.36, 0, 0], head: [0.1, 0, 0] });
  const biteAgain = add(P.attackWindup, { jaw: [0.7, 0, 0], neck: [-0.12, 0, 0] });
  /** 整個身體繞著原地轉（body = 弧度），尾巴往反方向落後一點 */
  const swing = (body: number, lag: number) => add(rest, { ...tail(0, 0, 0, lag), root: [0, body, 0], torso: [0, body * 0.12, 0], neck: [0, -body * 0.12, 0], jaw: [0.3, 0, 0] });
  /** 翻筋斗的姿勢：pitch = 身體往前翻的角度（π = 四腳朝天）；y = 身體離地的高度 */
  const flip = (pitch: number, y: number, more: Angles = {}): Pose => ({ ...add(rest, { root: [pitch, 0, 0], jaw: [0.5, 0, 0], ...more }), rootY: y });
  /** 四腳朝天掙扎：四隻腳交替亂踢，身體左右搖 */
  const upsideDown = (k: 1 | -1): Pose =>
    flip(Math.PI, -3, { root: [Math.PI, 0, 0.09 * k], upperArmL: [0.45 * k, 0, 0], upperArmR: [-0.45 * k, 0, 0], thighL: [-0.45 * k, 0, 0], thighR: [0.45 * k, 0, 0], ...tail(-0.12 * k, 0, 0, 0.25 * k), jaw: [0.6, 0, 0] });
  return {
    ...m,
    poses: {
      ...P,
      ready: (t) => add(P.ready(t), { ...sway(t * 1.6, 0.12), jaw: [0.06 + 0.04 * Math.sin(t * 2), 0, 0] }),
      run: (p) => add(P.run(p), { ...sway(p, 0.3), jaw: [0.18, 0, 0] }),
      ...(P.walk ? { walk: (p: number) => add(P.walk!(p), { ...sway(p, 0.22), jaw: [0.1, 0, 0] }) } : {}),
      attackChain: { windup: [biteOpen], strike: [biteShut, biteAgain, biteShut], strikeTime: 0.4 },
      plainAttackIsChain: true,
      attackVariants: {
        // 先轉到一側（尾巴繞到前側方），再一口氣轉過 240°，尾巴掃過整個身後
        slash: { windup: [swing(-2.1, 0.35)], strike: [swing(2.1, -0.5)], strikeTime: 0.32 },
        overhead: {
          windup: [flip(-0.24, -2, { ...tail(-0.15, -0.1, 0), neck: [-0.2, 0, 0] })],
          // 每格 0.3 秒：蹬起 → 翻到半空 → 尾巴砸地（約第 0.95 秒）→ 掙扎 → 翻回來
          strike: [
            flip(0.95, 9, { ...tail(0.3, 0.3, 0.2), neck: [-0.3, 0, 0] }),
            flip(2, 20, tail(0.25, 0.3, 0.3)),
            flip(3, 9, tail(0.15, 0.1, 0.1)),
            flip(Math.PI, -3, tail(-0.15, -0.1, 0)),
            upsideDown(1),
            upsideDown(-1),
            upsideDown(1),
            flip(Math.PI + 0.9, 2),
            flip(Math.PI + 2.2, 5),
            flip(Math.PI * 2, 0),
          ],
          strikeTime: 3,
        },
      },
      hit: add(P.hit, { jaw: [0.5, 0, 0] }),
      dead: add(P.dead, { jaw: [0.7, 0, 0] }),
    },
  };
}

/** 單眼浮體的六條觸手：外側兩條（ex_tent）跟著舊版四條的動作，時間差開一點 */
export function sixTentacles(m: FigureModel): FigureModel {
  const add = (p: Pose, follow: Pose): Pose => {
    const angles: Pose['angles'] = { ...p.angles };
    for (const [s, source] of [['L', 'thighR'], ['R', 'upperArmL']] as const) {
      const side = source.startsWith('thigh') ? ['thigh', 'shin', 'foot'] : ['upperArm', 'forearm', 'hand'];
      side.forEach((part, i) => {
        const v = follow.angles[`${part}${source.slice(-1)}` as Joint];
        if (v) angles[`ex_tent${s}${i}`] = v;
      });
    }
    return { ...p, angles };
  };
  const edited = mapPoses(m.poses, (p) => add(p, p));
  return { ...m, poses: { ...edited, ready: (t) => add(m.poses.ready(t), m.poses.ready(t + 1.1)), run: (p) => add(m.poses.run(p), m.poses.run(p + 1.1)) } };
}

/**
 * 鐵輪劍獸（設計者 2026-11-09）：靠兩個輪子滾動（thigh 的關節在輪心，角度隨步伐連續增加），雙臂懸在身前。
 * 連刺先左後右大幅度揮臂（從身體側面掃到正前方，腰跟著扭）；劍氣左右手輪流往前捅；突刺往後縮、輪子空轉蓄力，雙臂伸直衝出去；迴旋雙臂張開、輪子反向，原地轉三圈。
 */
export function wheelBeastLife(m: FigureModel): FigureModel {
  type Angles = Pose['angles'];
  const pose = (angles: Angles): Pose => ({ rootY: 0, angles });
  const both = (a: Angles, part: 'upperArm' | 'forearm' | 'hand', v: readonly [number, number, number]) => {
    a[`${part}L`] = [v[0], v[1], v[2]];
    a[`${part}R`] = [v[0], -v[1], -v[2]];
  };
  const wheels = (a: Angles, l: number, r = l) => {
    a.thighL = [l, 0, 0];
    a.thighR = [r, 0, 0];
  };
  const ready = (t: number): Pose => {
    const b = Math.sin(t * 1.6);
    return pose({ root: [0.02 * b, 0, 0], torso: [0.03 * b, 0, 0], neck: [-0.03 * b, 0.05 * Math.sin(t * 0.7), 0], upperArmL: [-0.08 + 0.05 * Math.sin(t * 1.6 + 1), 0, 0], upperArmR: [-0.08 + 0.05 * Math.sin(t * 1.6 + 2.4), 0, 0] });
  };
  const run = (p: number): Pose => {
    const a: Angles = { root: [0.16 + 0.02 * Math.sin(p * 2), 0, 0.025 * Math.sin(p)], torso: [0.1, 0.05 * Math.sin(p), 0], neck: [-0.2, 0, 0], head: [-0.06, 0, 0] };
    both(a, 'upperArm', [-0.5, 0, 0]);
    both(a, 'forearm', [-0.15, 0, 0]);
    a.upperArmL![0] += 0.12 * Math.sin(p);
    a.upperArmR![0] -= 0.12 * Math.sin(p);
    wheels(a, p);
    return pose(a);
  };
  const cocked = (spin = 0): Pose => {
    const a: Angles = { root: [-0.12, 0, 0], torso: [-0.22, 0, 0], neck: [0.16, 0, 0] };
    both(a, 'upperArm', [0.45, 0, 0]);
    both(a, 'forearm', [-0.35, 0, 0]);
    wheels(a, spin);
    return pose(a);
  };
  /** 一隻手往前捅、另一隻手收回；side = 1 是左手 */
  const thrust = (side: 1 | -1): Pose => {
    const [hit, back] = side === 1 ? (['L', 'R'] as const) : (['R', 'L'] as const);
    const a: Angles = { root: [0.1, 0, 0], torso: [0.26, 0.38 * side, 0], neck: [-0.2, -0.3 * side, 0] };
    a[`upperArm${hit}`] = [-1.4, 0, 0];
    a[`forearm${hit}`] = [0.1, 0, 0];
    a[`hand${hit}`] = [-0.25, 0, 0];
    a[`upperArm${back}`] = [0.35, 0, 0];
    a[`forearm${back}`] = [-0.4, 0, 0];
    return pose(a);
  };
  /** 揮臂的起手：side 那隻手高舉到身體側面，腰往反方向扭開 */
  const raised = (side: 1 | -1): Pose => {
    const [swing, other] = side === 1 ? (['L', 'R'] as const) : (['R', 'L'] as const);
    const a: Angles = { root: [-0.06, 0, 0], torso: [-0.2, 0.62 * side, 0], neck: [0.1, -0.5 * side, 0] };
    a[`upperArm${swing}`] = [0.1, 0, 1.25 * side];
    a[`forearm${swing}`] = [-0.3, 0, 0];
    a[`upperArm${other}`] = [-0.55, 0, 0];
    a[`forearm${other}`] = [-0.25, 0, 0];
    return pose(a);
  };
  /** 揮完：side 那隻手掃到正前方偏內側，腰扭到另一邊，另一隻手收在後面 */
  const swept = (side: 1 | -1): Pose => {
    const [swing, other] = side === 1 ? (['L', 'R'] as const) : (['R', 'L'] as const);
    const a: Angles = { root: [0.12, 0, 0], torso: [0.26, -0.68 * side, 0], neck: [-0.22, 0.52 * side, 0] };
    a[`upperArm${swing}`] = [-1.55, 0, -0.38 * side];
    a[`forearm${swing}`] = [0.05, 0, 0];
    a[`hand${swing}`] = [-0.3, 0, 0];
    a[`upperArm${other}`] = [0.25, 0, 0.3 * (side === 1 ? -1 : 1)];
    a[`forearm${other}`] = [-0.35, 0, 0];
    return pose(a);
  };
  const coil = (spin: number): Pose => {
    const a: Angles = { root: [-0.36, 0, 0], torso: [-0.3, 0, 0], neck: [0.34, 0, 0], head: [0.1, 0, 0] };
    both(a, 'upperArm', [0.75, 0, 0]);
    both(a, 'forearm', [-0.25, 0, 0]);
    wheels(a, spin);
    return pose(a);
  };
  const extended = (spin: number): Pose => {
    const a: Angles = { root: [0.42, 0, 0], torso: [0.22, 0, 0], neck: [-0.5, 0, 0], head: [-0.15, 0, 0] };
    both(a, 'upperArm', [-1.55, 0, 0]);
    both(a, 'forearm', [0.08, 0, 0]);
    both(a, 'hand', [-0.12, 0, 0]);
    wheels(a, spin);
    return pose(a);
  };
  const spun = (yaw: number, wheel: number): Pose => {
    const a: Angles = { root: [0.04, yaw, 0], torso: [-0.08, 0, 0] };
    both(a, 'upperArm', [-0.1, 0, 0.75]);
    both(a, 'forearm', [0, 0, 0.3]);
    wheels(a, wheel, -wheel);
    return pose(a);
  };
  const hit = pose({ root: [-0.14, 0, 0], torso: [-0.22, 0, 0], neck: [0.2, 0, 0], upperArmL: [0.3, 0, 0], upperArmR: [0.3, 0, 0] });
  const dead = pose({ root: [0.5, 0, 0.12], torso: [0.65, 0, 0], neck: [0.35, 0, 0], head: [0.25, 0, 0], upperArmL: [0.5, 0, 0.3], upperArmR: [0.5, 0, -0.3], forearmL: [-0.4, 0, 0], forearmR: [-0.4, 0, 0] });
  return {
    ...m,
    poses: {
      ready,
      run,
      attackWindup: cocked(),
      attackStrike: swept(1),
      castWindup: cocked(),
      castRelease: thrust(1),
      hit,
      dead,
      attackChain: { windup: [raised(1)], strike: [swept(1), raised(-1), swept(-1)], strikeTime: 0.4 },
      plainAttackIsChain: true,
      attackVariants: {
        thrust: { windup: [cocked()], strike: [thrust(1), thrust(-1)] },
        overhead: { windup: [coil(-3), coil(-9)], strike: [extended(-4), extended(2 * Math.PI)], strikeTime: 0.3 },
        slash: { windup: [spun(-0.8, -2)], strike: [spun(Math.PI * 2, 6), spun(Math.PI * 4, 12), spun(Math.PI * 6, 18)], strikeTime: 1.05 },
      },
    },
  };
}

function levelFeet(parts: readonly PartDef[], hip: number, pose: Pose): Pose {
  const w = solveJoints(parts, hip, pose);
  const angles = { ...pose.angles };
  for (const foot of ['footL', 'footR'] as const) {
    const f = w.get(foot);
    const part = parts.find((p) => p.joint === foot);
    if (!f || !part?.parent) continue;
    const parent = w.get(part.parent)!.m;
    const level = mul(alignTo(apply(f.m, [0, 1, 0]), [0, 1, 0]), f.m);
    angles[foot] = eulerOf(mul(transpose(parent), level));
  }
  return { ...pose, angles };
}

/** 垂掛的關節（燈籠）轉成朝正下方（只轉最少的角度） */
function hangDown(parts: readonly PartDef[], hip: number, pose: Pose, joint: Joint | undefined): Pose {
  if (!joint) return pose;
  const part = parts.find((p) => p.joint === joint);
  if (!part?.parent) return pose;
  const w = solveJoints(parts, hip, { ...pose, angles: { ...pose.angles, [joint]: [0, 0, 0] } });
  const f = w.get(joint)!;
  const down = mul(alignTo(apply(f.m, [0, -1, 0]), [0, -1, 0]), f.m);
  return { ...pose, angles: { ...pose.angles, [joint]: eulerOf(mul(transpose(w.get(part.parent)!.m), down)) } };
}
