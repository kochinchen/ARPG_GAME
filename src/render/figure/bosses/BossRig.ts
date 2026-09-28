import type { FigureModel, Joint, PartDef } from '../FigureModel';
import type { Mesh, V3 } from '../Poly3D';

/**
 * 樓層魔王的人形骨架（約 41 個關節）：
 * 骨盆 → 腰 → 胸 → 頸 → 頭（下顎、頭頂裝飾）；胸 → 鎖骨 → 肩甲 / 上臂 → 前臂 → 手 → 手指、拇指；
 * 右手 → 武器、左手 → 副手（盾 / 法杖）；骨盆 → 大腿 → 小腿 → 腳 → 腳趾；骨盆兩側的腿甲片；
 * 前後腰布、背後三列兩段的披風（或岩片、翼膜…，由次級運動延遲擺動）。
 * 每個部位由各魔王提供網格；沒有提供的關節仍然存在（讓動作一致），只是不畫東西。
 * 尺寸與女主角相同（骨盆高 29），遊戲中依 EnemyDef.size 放大。
 */

export type Side = 1 | -1;
export type PerSide = (side: Side) => Mesh[];

export interface BossRigOptions {
  /** 肩關節離中心的距離 */
  shoulderX: number;
  root: Mesh[];
  waist: Mesh[];
  chest: Mesh[];
  neck: Mesh[];
  head: Mesh[];
  jaw?: Mesh[];
  crest?: Mesh[];
  clavicle?: PerSide;
  pad?: PerSide;
  upperArm: PerSide;
  forearm: PerSide;
  hand: PerSide;
  fingers?: PerSide;
  thumb?: PerSide;
  weapon?: Mesh[];
  weaponL?: Mesh[];
  tasset?: PerSide;
  thigh: PerSide;
  shin: PerSide;
  foot: PerSide;
  toe?: PerSide;
  cloth?: Mesh[];
  clothBack?: Mesh[];
  /** 披風三列（左、中、右），每列上下兩段；沒有時不建立這些關節 */
  cape?: { upper: (col: -1 | 0 | 1) => Mesh[]; lower: (col: -1 | 0 | 1) => Mesh[] };
  /** 其他關節（翅膀、尾巴…），父關節需已存在 */
  extra?: PartDef[];
  /** 腿長（大腿、小腿） */
  thighLen?: number;
  shinLen?: number;
  /** 髖關節離中心的距離（腿粗的魔王要大一點） */
  hipX?: number;
  /** 手臂長（上臂、前臂） */
  upperArmLen?: number;
  forearmLen?: number;
}

export const BOSS_HIP = 29;

export function bossRig(o: BossRigOptions): PartDef[] {
  const thigh = o.thighLen ?? 13;
  const shin = o.shinLen ?? 12.5;
  const upper = o.upperArmLen ?? 10;
  const fore = o.forearmLen ?? 9;
  const sides: Side[] = [1, -1];
  const s = (side: Side) => (side === 1 ? 'L' : 'R');
  const parts: PartDef[] = [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: o.root },
    { joint: 'torso', parent: 'root', offset: [0, 2.5, 0], meshes: o.waist },
    { joint: 'chest', parent: 'torso', offset: [0, 7, 0], meshes: o.chest },
    { joint: 'neck', parent: 'chest', offset: [0, 9.5, -0.8], meshes: o.neck },
    { joint: 'head', parent: 'neck', offset: [0, 2.8, 0.6], meshes: o.head },
    { joint: 'jaw', parent: 'head', offset: [0, 2.4, 0.8], meshes: o.jaw ?? [] },
    { joint: 'ex_crest', parent: 'head', offset: [0, 10, -1], meshes: o.crest ?? [] },
  ];
  for (const side of sides) {
    const S = s(side);
    parts.push(
      { joint: `ex_clav${S}`, parent: 'chest', offset: [2.2 * side, 8.6, -0.3], meshes: o.clavicle?.(side) ?? [] },
      { joint: `ex_pad${S}`, parent: `ex_clav${S}`, offset: [(o.shoulderX - 2.2) * side, 0.6, 0], meshes: o.pad?.(side) ?? [] },
      { joint: `upperArm${S}`, parent: `ex_clav${S}`, offset: [(o.shoulderX - 2.2) * side, -0.2, 0], meshes: o.upperArm(side) },
      { joint: `forearm${S}`, parent: `upperArm${S}`, offset: [0, -upper, 0], meshes: o.forearm(side) },
      { joint: `hand${S}`, parent: `forearm${S}`, offset: [0, -fore, 0], meshes: o.hand(side) },
      { joint: `ex_fingers${S}`, parent: `hand${S}`, offset: [0, -2.6, 0.6], meshes: o.fingers?.(side) ?? [] },
      { joint: `ex_thumb${S}`, parent: `hand${S}`, offset: [1.4 * side, -1, 1], meshes: o.thumb?.(side) ?? [] },
    );
  }
  parts.push(
    { joint: 'weapon', parent: 'handR', offset: [0, -1.6, 0], meshes: o.weapon ?? [] },
    { joint: 'weaponL', parent: 'handL', offset: [0, -1.6, 0], meshes: o.weaponL ?? [] },
  );
  for (const side of sides) {
    const S = s(side);
    parts.push(
      { joint: `thigh${S}`, parent: 'root', offset: [(o.hipX ?? 3.4) * side, -1, 0], meshes: o.thigh(side) },
      { joint: `shin${S}`, parent: `thigh${S}`, offset: [0, -thigh, 0], meshes: o.shin(side) },
      { joint: `foot${S}`, parent: `shin${S}`, offset: [0, -shin, 0], meshes: o.foot(side) },
      { joint: `ex_toe${S}`, parent: `foot${S}`, offset: [0, -1.6, 3.2], meshes: o.toe?.(side) ?? [] },
      { joint: `ex_tasset${S}`, parent: 'root', offset: [5.6 * side, 1.4, 0.6], meshes: o.tasset?.(side) ?? [] },
    );
  }
  parts.push(
    { joint: 'cloth', parent: 'root', offset: [0, 2, 5.4], meshes: o.cloth ?? [] },
    { joint: 'clothBack', parent: 'root', offset: [0, 2, -5.4], meshes: o.clothBack ?? [] },
  );
  if (o.cape) {
    for (const col of [-1, 0, 1] as const) {
      const name = col === 1 ? 'L' : col === -1 ? 'R' : 'C';
      parts.push(
        { joint: `ex_cape${name}1`, parent: 'chest', offset: [col * 4.6, 9, -5.6], meshes: o.cape.upper(col) },
        { joint: `ex_cape${name}2`, parent: `ex_cape${name}1`, offset: [0, -11, 0], meshes: o.cape.lower(col) },
      );
    }
  }
  parts.push(...(o.extra ?? []));
  return parts;
}

/** 披風、腰布、腿甲片、頭頂裝飾的次級運動（延遲擺動） */
export function bossSecondary(parts: readonly PartDef[], extra: NonNullable<FigureModel['secondary']> = {}): NonNullable<FigureModel['secondary']> {
  const has = (j: Joint) => parts.some((p) => p.joint === j && p.meshes.length > 0);
  const out: NonNullable<FigureModel['secondary']> = {};
  const add = (j: Joint, cfg: NonNullable<FigureModel['secondary']>[Joint]) => {
    if (has(j) && cfg) out[j] = cfg;
  };
  add('cloth', { rate: 9, gravity: 0.5 });
  add('clothBack', { rate: 8, gravity: 0.5 });
  add('ex_tassetL', { rate: 16, gravity: 0.3 });
  add('ex_tassetR', { rate: 16, gravity: 0.3 });
  add('ex_crest', { rate: 12, gravity: 0.2 });
  for (const name of ['L', 'C', 'R']) {
    add(`ex_cape${name}1`, { rate: 7, gravity: 0.55, clampTo: 'chest', maxZ: -0.15 });
    add(`ex_cape${name}2`, { rate: 5, gravity: 0.6, clampTo: 'chest', maxZ: 0 });
  }
  return { ...out, ...extra };
}

export const mirrorX = (v: V3, side: Side): V3 => [v[0] * side, v[1], v[2]];
