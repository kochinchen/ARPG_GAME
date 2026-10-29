import { subdivide } from '../figure/Facets';
import type { Mesh, V3 } from '../figure/Poly3D';
import type { WallStyle } from '../themes';
import type { WallCell } from '../views/TileMapView';

/**
 * Three.js 畫法的牆：每一格牆拆成一塊塊鑿過的石頭（加密、頂點起伏、各三角面輕微色差），
 * 樣式依區域（WallStyle）。石塊只建看得到的三個面（朝上、+X、+Z），裡面一個暗色的實心芯擋光、投影子，
 * 石塊之間的縫隙露出這個芯（灰縫）。
 *
 * 單位：World（1 格 = cell）；高度 h 已換算成 World 單位。
 */
export interface WallLook {
  style: WallStyle;
  /** 苔蘚 / 水晶等點綴色 */
  accent: number;
  /** 水晶的光色 */
  glow: number;
}

/** 各樣式的參數：石層數、灰縫寬、表面起伏、每塊亮度差 */
const STYLES: Record<WallStyle, { courses: number; gap: number; rough: number; vary: number }> = {
  // 遺棄地窖：大小不一的亂石
  rubble: { courses: 3, gap: 0.035, rough: 0.09, vary: 0.16 },
  // 古老墓穴：兩層大石板，偶爾長苔
  slab: { courses: 2, gap: 0.03, rough: 0.05, vary: 0.1 },
  // 聖堂 / 要塞 / 神殿：整齊的切石，交錯砌
  ashlar: { courses: 3, gap: 0.028, rough: 0.035, vary: 0.08 },
  // 熔岩礦坑：一根根高低不同的玄武岩柱
  basalt: { courses: 1, gap: 0.03, rough: 0.06, vary: 0.12 },
  // 深淵通道：尖銳的岩塊，偶爾冒出水晶
  jagged: { courses: 2, gap: 0.03, rough: 0.16, vary: 0.14 },
};

/** 以格子座標產生的固定亂數（0～1） */
function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: number, b: number, t: number, k = 1): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round((((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export type PushTriangle = (a: V3, b: V3, c: V3, color: number) => void;

/** 石塊看得到的三個面（頂、+X、+Z），各面一個底色 */
function shell(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, top: number, side: number): Mesh {
  const verts: V3[] = [
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
  ];
  return {
    verts,
    faces: [
      { idx: [0, 3, 2, 1], color: top },
      { idx: [1, 2, 5, 4], color: side },
      { idx: [3, 6, 5, 2], color: side },
    ],
  };
}

/** 六角柱（玄武岩柱）的頂面與朝鏡頭的側面 */
function column(cx: number, cz: number, r: number, h: number, top: number, side: number, phase: number): Mesh {
  const verts: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = phase + (i / 6) * Math.PI * 2;
    verts.push([cx + Math.cos(a) * r, h, cz + Math.sin(a) * r], [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
  }
  const faces: Mesh['faces'] = [{ idx: [0, 2, 4, 6, 8, 10], color: top }];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // 只留朝 +X / +Z（鏡頭）那一半的側面
    const a = phase + ((i + 0.5) / 6) * Math.PI * 2;
    if (Math.cos(a) + Math.sin(a) > -0.3) faces.push({ idx: [i * 2, j * 2, j * 2 + 1, i * 2 + 1], color: side });
  }
  return { verts, faces };
}

/** 加密、起伏之後，逐個三角面輸出（每面往暗色混一點、亮度 ±3%） */
function emit(mesh: Mesh, rough: number, seed: number, push: PushTriangle): void {
  const fine = subdivide(mesh, 1, rough, seed);
  fine.faces.forEach((f, i) => {
    const [a, b, c] = f.idx.map((k) => fine.verts[k]!) as [V3, V3, V3];
    push(a, b, c, mix(f.color, 0x000000, hash(i, seed, 3) * 0.12, 0.97 + hash(i, seed, 5) * 0.06));
  });
}

/** 實心芯（封閉的方塊，擋光與投影子）：灰縫的顏色 */
function core(x0: number, x1: number, h: number, z0: number, z1: number, color: number, push: PushTriangle): void {
  const p = (x: number, y: number, z: number): V3 => [x, y, z];
  const quad = (a: V3, b: V3, c: V3, d: V3) => {
    push(a, b, c, color);
    push(a, c, d, color);
  };
  quad(p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1));
  quad(p(x0, 0, z1), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z1));
  quad(p(x1, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x1, h, z0));
  quad(p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0));
  quad(p(x0, 0, z0), p(x0, 0, z1), p(x0, h, z1), p(x0, h, z0));
}

/** 一格牆的所有三角面 */
export function wallStones(w: WallCell, cell: number, h: number, look: WallLook, push: PushTriangle): void {
  const s = STYLES[look.style];
  const [x0, x1, z0, z1] = [w.x * cell, (w.x + 1) * cell, w.y * cell, (w.y + 1) * cell];
  const g = s.gap * cell;
  const seed = (w.x * 7919 + w.y * 104729) % 100000;
  const r = (k: number) => hash(w.x, w.y, k);
  core(x0 + g, x1 - g, h - g * 2, z0 + g, z1 - g, mix(w.right, 0x000000, 0.45), push);
  // 每塊石頭的顏色：底色 ± vary（亮暗交錯），頂面用頂面色
  const tint = (k: number, color: number) => mix(color, r(k) > 0.5 ? 0xffffff : 0x000000, r(k + 1) * s.vary);

  if (look.style === 'basalt') {
    // 2 × 2 根玄武岩柱，高度不一
    const rr = cell * 0.27;
    for (let i = 0; i < 4; i++) {
      const cx = x0 + cell * (i % 2 ? 0.73 : 0.27);
      const cz = z0 + cell * (i < 2 ? 0.27 : 0.73);
      const hh = h * (0.82 + r(10 + i) * 0.3);
      emit(column(cx, cz, rr, hh, tint(20 + i * 2, w.top), tint(20 + i * 2, w.left), r(30 + i)), s.rough, seed + i, push);
    }
    return;
  }

  // 一層層的石頭：奇數層沿 X 切、偶數層沿 Z 切（交錯砌），切點隨機
  let y = 0;
  for (let k = 0; k < s.courses; k++) {
    const last = k === s.courses - 1;
    const ch = last ? h - y : (h / s.courses) * (0.85 + r(40 + k) * 0.3);
    const y1 = y + ch;
    const split = 0.32 + r(50 + k) * 0.36;
    const alongX = (k + w.x + w.y) % 2 === 0;
    for (let part = 0; part < 2; part++) {
      const lo = part === 0 ? 0 : split;
      const hi = part === 0 ? split : 1;
      const [bx0, bx1, bz0, bz1] = alongX ? [x0 + lo * cell, x0 + hi * cell, z0, z1] : [x0, x1, z0 + lo * cell, z0 + hi * cell];
      // 最上層的石頭高低不齊
      const top = last ? y1 + (r(60 + part) - 0.5) * ch * 0.25 : y1;
      const id = k * 2 + part;
      let topColor = tint(70 + id * 2, w.top);
      const side = tint(70 + id * 2, w.left);
      // 古老墓穴的石板頂上偶爾長苔
      if (look.style === 'slab' && r(90 + id) < 0.25) topColor = mix(topColor, look.accent, 0.55);
      emit(shell(bx0 + g, bx1 - g, y + g, top - g, bz0 + g, bz1 - g, topColor, side), s.rough, seed + id, push);
    }
    y = y1;
  }

  // 深淵通道：偶爾在牆頂冒出一根水晶
  if (look.style === 'jagged' && r(95) < 0.18) {
    const cx = x0 + cell * (0.3 + r(96) * 0.4);
    const cz = z0 + cell * (0.3 + r(97) * 0.4);
    const tip: V3 = [cx + (r(98) - 0.5) * 0.1 * cell, h + cell * (0.3 + r(99) * 0.25), cz];
    const base = Array.from({ length: 4 }, (_, i): V3 => {
      const a = (i / 4) * Math.PI * 2 + r(100);
      return [cx + Math.cos(a) * 0.09 * cell, h - 0.02, cz + Math.sin(a) * 0.09 * cell];
    });
    base.forEach((p, i) => push(p, base[(i + 1) % 4]!, tip, mix(look.glow, look.accent, (i % 2) * 0.4)));
  }
}
