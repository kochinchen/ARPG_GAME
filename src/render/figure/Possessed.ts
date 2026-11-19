import type { FigureModel, Joint } from './FigureModel';
import type { Mesh, V3 } from './Poly3D';
import { fromHsl, toHsl } from './Variants';
import SOUL_FLOWER from './monsters/soulFlowerAI.json';

/**
 * 被奪魂寄生花附體的怪（設計者 2026-11-19，設計稿 art/monsters/soul_flower/possess/設計稿-1.png）：
 * 同一個模型，全身（含武器）染成植物汁液浸透的深綠、保留原本的明暗，再長出一顆奪魂寄生花的花苞（取自 soulFlowerAI.json 的 head，顏色照原樣）：
 * - 有脖子、雙手雙腳的人形（骷髏、食屍鬼、法師…）：原本的頭被吃掉，花苞長在脖子上當頭，大小約原本的頭 1.3 倍
 * - 其他（蜘蛛、蟲、浮體…）：花苞從身體最高的地方長出來，高度約整隻的 0.4 倍
 */

/** 算「頭」的關節：頭、下顎、頭上的角與眼 */
const HEAD = /^(head|jaw|ex_jaw|ex_horn|ex_eye)/;

const green = (c: number): number => {
  const { l } = toHsl(c);
  return fromHsl({ h: 92, s: 0.48, l: 0.14 + l * 0.34 });
};

type Json = { verts: number[][]; weights: [string, number][][]; faces: number[][] };
/** 寄生花的花苞：head 權重最大的面；原點在花苞底部中央、高度 1 */
const BUD: Mesh = (() => {
  const d = SOUL_FLOWER as unknown as Json;
  const isHead = (i: number) => {
    const w = d.weights[i]!;
    return w.reduce((a, b) => (b[1] > a[1] ? b : a))[0] === 'head';
  };
  const faces = d.faces.filter((f) => isHead(f[0]!) && isHead(f[1]!) && isHead(f[2]!));
  const used = [...new Set(faces.flatMap((f) => [f[0]!, f[1]!, f[2]!]))];
  const ys = used.map((i) => d.verts[i]![1]!);
  const lo = Math.min(...ys);
  const k = 1 / (Math.max(...ys) - lo);
  const cx = used.reduce((a, i) => a + d.verts[i]![0]!, 0) / used.length;
  const cz = used.reduce((a, i) => a + d.verts[i]![2]!, 0) / used.length;
  const index = new Map(used.map((v, n) => [v, n]));
  return {
    verts: used.map((i): V3 => [(d.verts[i]![0]! - cx) * k, (d.verts[i]![1]! - lo) * k, (d.verts[i]![2]! - cz) * k]),
    faces: faces.map((f) => ({ idx: [index.get(f[0]!)!, index.get(f[1]!)!, index.get(f[2]!)!] as V3, color: f[3]! })),
  };
})();
/** 花苞放大到 size 高，底部往下埋 sink（相對高度） */
const bud = (size: number, at: V3, sink = 0.15): Mesh => ({
  ...BUD,
  verts: BUD.verts.map((v): V3 => [at[0] + v[0] * size, at[1] + (v[1] - sink) * size, at[2] + v[2] * size]),
});

const looks = new WeakMap<FigureModel, FigureModel>();

export function possessedLook(model: FigureModel): FigureModel {
  let look = looks.get(model);
  if (look) return look;
  const paint = (meshes: readonly Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, faces: m.faces.map((f) => ({ ...f, color: green(f.color) })) }));
  const skin = model.skin;
  const extra = new Map<Joint, Mesh>();
  let faces = skin?.faces;
  if (skin) {
    /** 每個面最主要跟哪根骨頭（三個頂點的權重加總） */
    const owner = (idx: readonly number[]): string => {
      const sum = new Map<string, number>();
      for (const i of idx) for (const { joint, w } of skin.infl[i]!) sum.set(joint, (sum.get(joint) ?? 0) + w);
      let top = '';
      let best = -1;
      for (const [joint, w] of sum) if (w > best) [top, best] = [joint, w];
      return top;
    };
    const isHead = skin.faces.map((f) => HEAD.test(owner(f.idx)));
    const headCount = isHead.filter(Boolean).length;
    const rest = skin.rest;
    const humanoid = !!(rest.neck && rest.head && rest.upperArmL && rest.footL) && headCount > 0 && headCount < skin.faces.length * 0.25;
    if (humanoid) {
      // 頭被吃掉：拿掉頭的面，花苞長在頭的關節上，大小約原本的頭 1.3 倍
      const at = rest.head!;
      const headVerts = skin.faces.flatMap((f, n) => (isHead[n] ? f.idx.map((i) => skin.verts[i]!) : []));
      const height = Math.max(...headVerts.map((v) => v[1])) - at[1];
      extra.set('head', bud(Math.max(height, 1) * 1.3, [0, 0, 0], 0.1));
      faces = skin.faces.filter((_, n) => !isHead[n]);
    } else {
      // 從身體最高的地方長出來（跟著那裡的骨頭動）
      let top = 0;
      skin.verts.forEach((v, i) => {
        if (v[1] > skin.verts[top]![1]) top = i;
      });
      const joint = skin.infl[top]!.reduce((a, b) => (b.w > a.w ? b : a)).joint;
      const v = skin.verts[top]!;
      const at = rest[joint] ?? [0, 0, 0];
      const height = v[1] - Math.min(...skin.verts.map((p) => p[1]));
      extra.set(joint, bud(height * 0.4, [v[0] - at[0], v[1] - at[1], v[2] - at[2]], 0.25));
    }
  }
  look = {
    ...model,
    parts: model.parts.map((p) => {
      const add = extra.get(p.joint);
      return { ...p, meshes: [...paint(p.meshes), ...(add ? [add] : [])] };
    }),
    ...(skin && faces ? { skin: { ...skin, faces: faces.map((f) => ({ ...f, color: green(f.color) })) } } : {}),
  };
  looks.set(model, look);
  return look;
}
