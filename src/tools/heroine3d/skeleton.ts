/**
 * 女主角骨架：所有 joint 的靜止姿勢 World 位置（公尺，Y 朝上，面向 +Z，角色的左邊 = +X）。
 * 構面體積（volumes.ts）只從這些 joint 位置推導，不另外寫死各方向的座標；動畫只轉動 joint。
 * 右手握劍，所以右臂的姿勢跟左臂不對稱，其餘左右鏡像。
 * 依設定稿（女主角設計圖/低多邊形女戰士角色轉面圖.png）：約 8 頭身（頭部整體縮成 HEAD_SCALE）、穿粗跟靴（整隻抬高 LIFT）。
 * 這裡的座標都是「抬高前」的；JOINTS 與 volumes 的輸出會一起加上 LIFT。
 */
import { add, type V3 } from './facets';

export interface Joint {
  name: string;
  parent: string | null;
  pos: V3;
}

const J: Joint[] = [];
const joint = (name: string, parent: string | null, pos: V3): V3 => {
  J.push({ name, parent, pos });
  return pos;
};

// ── 軀幹 ──
export const PELVIS = joint('pelvis', null, [0, 0.96, 0]);
export const WAIST = joint('waist', 'pelvis', [0, 1.09, 0]);
export const CHEST = joint('chest', 'waist', [0, 1.22, 0]);
export const NECK = joint('neck', 'chest', [0, 1.415, -0.018]);
export const HEAD = joint('head', 'neck', [0, 1.5, -0.005]);
/** 頭（含頭髮、馬尾）以 HEAD 為中心整體縮放：設定稿約 8 頭身 */
export const HEAD_SCALE = 0.9;
export const headSpace = (p: V3): V3 => [HEAD[0] + (p[0] - HEAD[0]) * HEAD_SCALE, HEAD[1] + (p[1] - HEAD[1]) * HEAD_SCALE, HEAD[2] + (p[2] - HEAD[2]) * HEAD_SCALE];
/** 粗跟靴：腳尖下壓 TOE_DOWN，整隻抬高 LIFT 讓腳尖剛好著地 */
export const TOE_DOWN = (9 * Math.PI) / 180;
export const LIFT = 0.028;

// ── 四肢：side = 1 左、-1 右 ──
export interface Limb {
  side: 1 | -1;
  clav: V3;
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  hip: V3;
  knee: V3;
  ankle: V3;
}
const limb = (side: 1 | -1, arm: { elbow: V3; wrist: V3 }): Limb => {
  const s = side === 1 ? 'L' : 'R';
  const x = (p: V3): V3 => [p[0] * side, p[1], p[2]];
  const clav = joint(`clav${s}`, 'chest', x([0.025, 1.395, -0.012]));
  const shoulder = joint(`shoulder${s}`, `clav${s}`, x([0.168, 1.382, -0.018]));
  const elbow = joint(`elbow${s}`, `shoulder${s}`, x(arm.elbow));
  const wrist = joint(`wrist${s}`, `elbow${s}`, x(arm.wrist));
  const hip = joint(`hip${s}`, 'pelvis', x([0.088, 0.93, 0]));
  const knee = joint(`knee${s}`, `hip${s}`, x([0.112, 0.515, 0.022]));
  const ankle = joint(`ankle${s}`, `knee${s}`, x([0.125, 0.088, -0.022]));
  return { side, clav, shoulder, elbow, wrist, hip, knee, ankle };
};
export const LIMB_L = limb(1, { elbow: [0.222, 1.122, -0.045], wrist: [0.262, 0.895, -0.005] });
export const LIMB_R = limb(-1, { elbow: [0.228, 1.125, -0.03], wrist: [0.272, 0.905, 0.045] });

// ── 劍：右手握著，劍尖朝下、略往外與往前 ──
export const SWORD_DIR: V3 = (() => {
  const d: V3 = [-0.32, -1, 0.3];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
})();
/** 握把中心（拳頭裡） */
export const GRIP = joint('sword', 'wristR', add(LIMB_R.wrist, [-0.012, -0.06, 0.012]));

// ── 馬尾：高馬尾，髮圈綁在頭頂偏後；先往上翹、往後散開，再垂到上背。每一節都是一根骨頭 ──
/** 頭部縮放前的座標（頭髮在 volumes 裡也用這組畫，最後整體縮放） */
export const PONY: V3[] = [
  [0, 1.742, -0.06],
  [0, 1.79, -0.13],
  [0, 1.68, -0.235],
  [0, 1.48, -0.265],
  [0, 1.25, -0.225],
];
PONY.slice(0, -1).forEach((p, i) => joint(`pony${i}`, i === 0 ? 'head' : `pony${i - 1}`, headSpace(p)));

// ── 腰布：每一條布片 root → middle → tip 三根骨頭，可以各自擺動 ──
export interface Flap {
  id: string;
  /** 繞身體的角度（度，0 = 正前方，+90 = 角色左側） */
  ang: number;
  /** 布片半寬、長度 */
  w: number;
  len: number;
  /** root / middle / tip / 尖端 四個點 */
  pts: V3[];
}
/** 設定稿：正前方與正後方各一片長的紅布（垂到膝上），兩側較短的破布片；底下是深藍短裙 */
const FLAP_SPECS: { ang: number; w: number; len: number }[] = [
  { ang: 0, w: 0.07, len: 0.5 },
  { ang: 180, w: 0.072, len: 0.48 },
  { ang: 72, w: 0.04, len: 0.26 },
  { ang: -72, w: 0.04, len: 0.24 },
  { ang: 138, w: 0.048, len: 0.36 },
  { ang: -138, w: 0.048, len: 0.34 },
];
/** 布片掛在腰帶下緣這個橢圓上 */
const FLAP_RX = 0.168;
const FLAP_RZ = 0.12;
const FLAP_Y = 1.025;
export const FLAPS: Flap[] = FLAP_SPECS.map((f, i) => {
  const a = (f.ang * Math.PI) / 180;
  const out: V3 = [Math.sin(a), 0, Math.cos(a)];
  const root: V3 = [Math.sin(a) * FLAP_RX, FLAP_Y, Math.cos(a) * FLAP_RZ];
  // 往下時順著骨盆外擴，越下面越貼近垂直
  const step = (p: V3, down: number, outK: number): V3 => [p[0] + out[0] * outK, p[1] - down, p[2] + out[2] * outK];
  // 要蓋在外擴的短裙外面
  const L = f.len;
  const mid = step(root, L * 0.34, 0.06);
  const tip = step(mid, L * 0.34, 0.016);
  const end = step(tip, L * 0.32, 0.006);
  const id = `flap${i}`;
  joint(`${id}a`, 'pelvis', root);
  joint(`${id}b`, `${id}a`, mid);
  joint(`${id}c`, `${id}b`, tip);
  return { id, ang: f.ang, w: f.w, len: f.len, pts: [root, mid, tip, end] };
});

/** 輸出用的骨架（已抬高 LIFT） */
export const JOINTS: readonly Joint[] = J.map((j) => ({ ...j, pos: [j.pos[0], j.pos[1] + LIFT, j.pos[2]] }));
