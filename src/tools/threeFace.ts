/**
 * 開發用：Three.js 試驗頁的女主角新臉。
 * 頭改成一個平滑著色的整體（頭骨 + 蛋形下顎 + 鼻樑隆起），五官不再用小方塊拼，而是畫在一張貼圖上，
 * 由正面平面投影貼到臉上。座標與 heroineHead 相同（head 關節，原點在頸部上端；Y 向上、Z 向前、+X 為角色左手邊）。
 */
import * as THREE from 'three';
import { HEAD_SCALE } from '../render/figure/heroine/HeroineBody';
import { EYE, EYE_WHITE, HAIR, IRIS, IRIS_DEEP, LIP, LIP_LOWER, PUPIL, SKIN, SKIN_SHADOW } from '../render/figure/heroine/HeroinePalette';

/** 貼圖涵蓋的臉部範圍（正方形，避免五官變形）：x −4.4～4.4、y 0.6～9.4 */
const FACE_X = 4.4;
const FACE_Y0 = 0.6;
const FACE_SPAN = 8.8;
const TEX = 1024;

/** 頭骨（與 heroineHead 的 lowSphere 相同：半徑 4.2、中心 [0, 5, −0.2]、縮放 [0.88, 1.05, 1]） */
const SKULL = { cy: 5, cz: -0.2, rx: 4.2 * 0.88, ry: 4.2 * 1.05, rz: 4.2 };
/** 下顎（與 heroineHead 的 loft 相同），最後一列是下巴尖 */
const JAW = [
  { y: 4.4, rx: 3.4, rz: 3.2, cz: 0.3 },
  { y: 2.8, rx: 2.8, rz: 2.9, cz: 0.75 },
  { y: 1.4, rx: 1.6, rz: 2, cz: 1.45 },
  { y: 0.6, rx: 0.8, rz: 1, cz: 2.1 },
  { y: 0.3, rx: 0, rz: 0, cz: 2.4 },
];

type Ring = { y: number; rx: number; front: number; back: number };

/** 某個高度的截面：頭骨與下顎取聯集 */
function ringAt(y: number): Ring {
  const dy = (y - SKULL.cy) / SKULL.ry;
  const s = Math.abs(dy) < 1 ? Math.sqrt(1 - dy * dy) : 0;
  let rx = SKULL.rx * s;
  let front = SKULL.cz + SKULL.rz * s;
  let back = SKULL.cz - SKULL.rz * s;
  for (let i = 0; i < JAW.length - 1; i++) {
    const a = JAW[i]!;
    const b = JAW[i + 1]!;
    if (y > a.y || y < b.y) continue;
    const t = (a.y - y) / (a.y - b.y);
    const jrx = a.rx + (b.rx - a.rx) * t;
    const jrz = a.rz + (b.rz - a.rz) * t;
    const jcz = a.cz + (b.cz - a.cz) * t;
    if (s === 0 && rx === 0) [front, back] = [jcz, jcz];
    rx = Math.max(rx, jrx);
    front = Math.max(front, jcz + jrz);
    back = Math.min(back, jcz - jrz);
  }
  return { y, rx, front, back };
}

/** 鼻樑：眉心下方往前隆起，鼻尖最高，鼻下收回 */
function noseBump(x: number, y: number): number {
  const along = y > 4.35 ? Math.max(0, 1 - (y - 4.35) / 1.15) : Math.max(0, 1 - (4.35 - y) / 0.4);
  const width = 0.32 + 0.12 * (1 - along);
  return 0.48 * along * along * Math.exp(-((x / width) ** 2));
}

/** 平滑的頭（含正面貼圖座標）；背面的貼圖座標指到貼圖角落的純膚色 */
export function smoothHeadGeometry(): THREE.BufferGeometry {
  const SEG = 96;
  const ys: number[] = [];
  // 上半：沿頭骨的角度取樣（頂部曲率大）；下半：均勻往下到下巴尖
  for (let i = 0; i <= 24; i++) ys.push(SKULL.cy + SKULL.ry * Math.cos((i / 24) * (Math.PI / 2)));
  for (let i = 1; i <= 40; i++) ys.push(SKULL.cy - ((SKULL.cy - JAW[JAW.length - 1]!.y) * i) / 40);
  let rings = ys.map(ringAt);
  // 截面輪廓平滑兩次，頭骨與下顎的接縫才不會有折角
  for (let pass = 0; pass < 2; pass++) {
    rings = rings.map((r, i) => {
      if (i === 0 || i === rings.length - 1) return r;
      const a = rings[i - 1]!;
      const b = rings[i + 1]!;
      return { y: r.y, rx: (a.rx + 2 * r.rx + b.rx) / 4, front: (a.front + 2 * r.front + b.front) / 4, back: (a.back + 2 * r.back + b.back) / 4 };
    });
  }
  const pos: number[] = [];
  const uv: number[] = [];
  for (const r of rings) {
    const cz = (r.front + r.back) / 2;
    const rz = (r.front - r.back) / 2;
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const x = r.rx * Math.sin(a);
      const c = Math.cos(a);
      const z = cz + rz * c + (c > 0 ? noseBump(x, r.y) * c ** 4 : 0);
      pos.push(x * HEAD_SCALE, r.y * HEAD_SCALE, z * HEAD_SCALE);
      if (c > 0.05) uv.push((x + FACE_X) / FACE_SPAN, (r.y - FACE_Y0) / FACE_SPAN);
      else uv.push(0.01, 0.99);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const hex = (c: number, alpha = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;

/** 臉部貼圖：膚色底、腮紅、鼻影、杏仁大眼、細弧眉、上下唇 */
export function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const g = canvas.getContext('2d')!;
  /** 臉部座標 → 貼圖像素 */
  const px = (x: number) => ((x + FACE_X) / FACE_SPAN) * TEX;
  const py = (y: number) => (1 - (y - FACE_Y0) / FACE_SPAN) * TEX;
  const u = TEX / FACE_SPAN;

  g.fillStyle = hex(SKIN[0]);
  g.fillRect(0, 0, TEX, TEX);

  const soft = (x: number, y: number, rx: number, ry: number, color: number, alpha: number) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, hex(color, alpha));
    grad.addColorStop(1, hex(color, 0));
    g.save();
    g.translate(px(x), py(y));
    g.scale(rx * u, ry * u);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  // 腮紅、下巴與眼窩的淡陰影
  for (const s of [1, -1]) soft(1.95 * s, 3.85, 1.05, 0.6, 0xe88a80, 0.32);
  for (const s of [1, -1]) soft(1.4 * s, 5.85, 1.1, 0.45, SKIN_SHADOW[0], 0.16);
  soft(0, 1.6, 1.1, 0.5, SKIN_SHADOW[0], 0.12);

  // 鼻：右側（畫面左下光源的背光面）一道淡影、鼻尖下方的小陰影
  g.strokeStyle = hex(SKIN_SHADOW[0], 0.35);
  g.lineCap = 'round';
  g.lineWidth = 0.09 * u;
  g.beginPath();
  g.moveTo(px(-0.22), py(5.2));
  g.quadraticCurveTo(px(-0.3), py(4.6), px(-0.24), py(4.15));
  g.stroke();
  soft(0, 3.92, 0.42, 0.12, SKIN_SHADOW[1], 0.45);

  // 眼睛
  for (const s of [1, -1] as const) eye(g, px, py, u, s);

  // 細弧眉：眉頭粗、眉尾收細
  for (const s of [1, -1]) {
    g.fillStyle = hex(HAIR[0]);
    g.beginPath();
    g.moveTo(px(0.68 * s), py(6.22));
    g.quadraticCurveTo(px(1.55 * s), py(6.68), px(2.5 * s), py(6.35));
    g.quadraticCurveTo(px(1.55 * s), py(6.5), px(0.72 * s), py(6.06));
    g.closePath();
    g.fill();
  }

  // 嘴：上唇（弓形）、下唇（較飽滿、亮面）、唇線
  const lipW = 0.68;
  g.fillStyle = hex(LIP);
  g.beginPath();
  g.moveTo(px(-lipW), py(2.78));
  g.quadraticCurveTo(px(-0.3), py(3.02), px(-0.1), py(2.98));
  g.lineTo(px(0), py(2.94));
  g.lineTo(px(0.1), py(2.98));
  g.quadraticCurveTo(px(0.3), py(3.02), px(lipW), py(2.78));
  g.quadraticCurveTo(px(0), py(2.72), px(-lipW), py(2.78));
  g.fill();
  g.fillStyle = hex(LIP_LOWER);
  g.beginPath();
  g.moveTo(px(-lipW * 0.9), py(2.76));
  g.quadraticCurveTo(px(0), py(2.72), px(lipW * 0.9), py(2.76));
  g.quadraticCurveTo(px(0), py(2.34), px(-lipW * 0.9), py(2.76));
  g.fill();
  soft(0.15, 2.58, 0.25, 0.07, 0xffffff, 0.35);
  g.strokeStyle = hex(0x6a2e2c, 0.85);
  g.lineWidth = 0.05 * u;
  g.beginPath();
  g.moveTo(px(-lipW), py(2.78));
  g.quadraticCurveTo(px(0), py(2.7), px(lipW), py(2.78));
  g.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 杏仁形大眼：眼白、虹膜（上深下淺）、瞳孔、兩個高光、上揚的上眼線、細下眼線與眼皮摺線；s = 1 為角色左眼（+X） */
function eye(g: CanvasRenderingContext2D, px: (x: number) => number, py: (y: number) => number, u: number, s: 1 | -1): void {
  const inner = 0.68 * s;
  const outer = 2.12 * s;
  const cx = 1.36 * s;
  const top = 5.78;
  const bottom = 4.9;
  const almond = () => {
    g.beginPath();
    g.moveTo(px(inner), py(5.3));
    g.bezierCurveTo(px(0.95 * s), py(top), px(1.85 * s), py(top + 0.02), px(outer), py(5.5));
    g.bezierCurveTo(px(1.9 * s), py(5.0), px(1.0 * s), py(bottom), px(inner), py(5.3));
    g.closePath();
  };
  g.save();
  almond();
  g.fillStyle = hex(EYE_WHITE);
  g.fill();
  g.clip();
  // 上眼皮在眼白上的陰影
  const shade = g.createLinearGradient(0, py(top), 0, py(5.3));
  shade.addColorStop(0, hex(SKIN_SHADOW[0], 0.55));
  shade.addColorStop(1, hex(SKIN_SHADOW[0], 0));
  g.fillStyle = shade;
  g.fillRect(px(Math.min(inner, outer)), py(top), Math.abs(px(outer) - px(inner)), py(5.3) - py(top));
  // 虹膜
  const ix = px(cx);
  const iy = py(5.3);
  const ir = 0.43 * u;
  const iris = g.createLinearGradient(0, iy - ir, 0, iy + ir);
  iris.addColorStop(0, hex(IRIS_DEEP));
  iris.addColorStop(0.45, hex(IRIS_DEEP));
  iris.addColorStop(1, hex(IRIS));
  g.fillStyle = iris;
  g.beginPath();
  g.ellipse(ix, iy, ir * 0.92, ir, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = hex(PUPIL, 0.8);
  g.lineWidth = 0.05 * u;
  g.stroke();
  g.fillStyle = hex(PUPIL);
  g.beginPath();
  g.ellipse(ix, iy - ir * 0.05, ir * 0.38, ir * 0.48, 0, 0, Math.PI * 2);
  g.fill();
  // 高光：大的在左上、小的在右下（光源在畫面左上）
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(ix - ir * 0.36, iy - ir * 0.36, ir * 0.24, ir * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.arc(ix + ir * 0.32, iy + ir * 0.4, ir * 0.1, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 上眼線：內眼角細、往外變粗，外眼角上揚收尖
  g.fillStyle = hex(EYE);
  g.beginPath();
  g.moveTo(px(inner), py(5.3));
  g.bezierCurveTo(px(0.95 * s), py(top), px(1.85 * s), py(top + 0.02), px(outer), py(5.5));
  g.lineTo(px(2.5 * s), py(5.86));
  g.bezierCurveTo(px(2.1 * s), py(5.74), px(1.9 * s), py(top + 0.2), px(1.35 * s), py(top + 0.16));
  g.bezierCurveTo(px(0.95 * s), py(top + 0.12), px(0.75 * s), py(5.6), px(inner), py(5.3));
  g.fill();
  // 下眼線（只畫外側一半，淡一點）
  g.strokeStyle = hex(EYE, 0.55);
  g.lineWidth = 0.05 * u;
  g.beginPath();
  g.moveTo(px(1.3 * s), py(4.93));
  g.quadraticCurveTo(px(1.85 * s), py(5.0), px(outer), py(5.46));
  g.stroke();
  // 雙眼皮摺線
  g.strokeStyle = hex(SKIN_SHADOW[0], 0.6);
  g.lineWidth = 0.045 * u;
  g.beginPath();
  g.moveTo(px(0.9 * s), py(5.82));
  g.quadraticCurveTo(px(1.5 * s), py(6.04), px(2.2 * s), py(5.84));
  g.stroke();
}
