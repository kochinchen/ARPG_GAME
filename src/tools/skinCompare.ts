import { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';
import type { FigureModel, Pose } from '../render/figure/FigureModel';
import { armorSpec, heroineOutfit } from '../render/figure/gear/ArmorLooks';
import { HEROINE } from '../render/figure/Heroine';
import { MONSTER_MODELS } from '../render/figure/Monsters';
import { PolyFigure } from '../render/figure/PolyFigure';
import { mountFor, tierLook } from '../render/figure/weapons/WeaponLooks';
import { ThreeWorld } from '../render/three/ThreeWorld';

/**
 * GPU 蒙皮比對（開發用，/skin-compare.html）：女主角與每一種怪物（魔王的每個階段），同樣的姿勢、裝備、方向，
 * 一次用 CPU 算頂點（舊做法），一次用 GPU 蒙皮（新做法），逐像素比較兩張畫面。
 * 每個像素的 RGB 差異 > TOLERANCE 才算不同。
 *
 * 對照組（浮點誤差的大小）：CPU 畫兩次，第二次把角色移動 NUDGE（肉眼看不出來的距離），
 * 兩張畫面的差異就是「同一個做法、只差浮點捨入」會有的差異；GPU 與 CPU 的差異不超過它，就是沒有差異。
 */
const W = 360;
const H = 480;
/** 角色在畫面上佔的高度比例（依模型大小自動縮放） */
const FILL = 0.7;
const TOLERANCE = 0;
const NUDGE = 1e-6;

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
const projection = new IsoProjection();
const world = new ThreeWorld(canvas, gl, projection);
// 一塊地板（接收影子，影子也一起比對）
const FLOOR = 0x4a4038;
world.setMap([], 1, [], { style: 'rubble', accent: 0, glow: 0 }, [0, 0, 20, 0, 20, 20, FLOOR, 0, 0, 20, 20, 0, 20, FLOOR]);
const at = vec2(10, 10);
let cpu = world.createFigure(false);
let gpu = world.createFigure(true);
let zoom = 1;

const posesOf = (m: FigureModel): [string, Pose][] => {
  const P = m.poses;
  return [
    ['待機', P.ready(0)],
    ['待機 1.3s', P.ready(1.3)],
    ['跑步 0.5', P.run(0.5)],
    ['跑步 2.1', P.run(2.1)],
    ...(P.walk ? ([['走路 1.0', P.walk(1)]] as [string, Pose][]) : []),
    ['攻擊前搖', P.attackWindup],
    ['攻擊揮下', P.attackStrike],
    ['施法前搖', P.castWindup],
    ['施法', P.castRelease],
    ['受傷', P.hit],
    ['倒地', P.dead],
  ];
};
const outfit = heroineOutfit({
  helmet: armorSpec('helmet', 3, 'rare', []),
  armor: armorSpec('armor', 3, 'rare', []),
  gloves: armorSpec('gloves', 3, 'rare', []),
  boots: armorSpec('boots', 3, 'rare', []),
});
interface Subject {
  name: string;
  model: FigureModel;
  outfit?: Parameters<PolyFigure['setOutfit']>[0];
  weapon?: Parameters<PolyFigure['setWeapon']>[0];
  phase?: number;
}
const subjects: Subject[] = [
  { name: '女主角', model: HEROINE, outfit: null, weapon: null },
  { name: '女主角（全套裝備＋劍）', model: HEROINE, outfit, weapon: mountFor(tierLook('sword', 3)) },
  { name: '女主角（斧）', model: HEROINE, outfit: null, weapon: mountFor(tierLook('axe', 4)) },
  ...Object.entries(MONSTER_MODELS).flatMap(([id, model]) =>
    (model.phaseHidden ?? [[]]).map((_, phase) => ({ name: (model.phaseHidden ? `${id}（階段 ${phase + 1}）` : id).replace('enemy.', ''), model, phase })),
  ),
];
/** ?only=名稱：只比對名稱含這段文字的角色；&pose=姿勢、&dir=方向：只比對這個姿勢 / 方向 */
const params = new URLSearchParams(location.search);
const only = params.get('only');
const onlyPose = params.get('pose');
const onlyDir = params.get('dir');
if (only) subjects.splice(0, subjects.length, ...subjects.filter((x) => x.name.includes(only)));
const facings: Vec2[] = Array.from({ length: 8 }, (_, i) => vec2(Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)));

function shot(show: 'cpu' | 'gpu' | 'nudge'): Uint8Array {
  cpu.place(show === 'nudge' ? vec2(at.x + NUDGE, at.y - NUDGE) : at, vec2(0, 0), 0, 0xffffff, 1, show !== 'gpu');
  gpu.place(at, vec2(0, 0), 0, 0xffffff, 1, show === 'gpu');
  world.renderFloor(vec2(at.x - 0.4, at.y - 0.4), W, H, zoom, at, 8, 0x0d0b09, 0);
  world.renderObjects();
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

/** 依模型的大小決定縮放：先用 1 倍畫待機的樣子，量出角色佔的高度 */
function frame(fig: PolyFigure, model: FigureModel): void {
  zoom = 1;
  fig.showPose(model.poses.ready(0), facings[1]!);
  const px = shot('cpu');
  // 與沒有角色的畫面比較，找出角色佔的範圍
  cpu.place(at, vec2(0, 0), 0, 0xffffff, 1, false);
  world.renderFloor(vec2(at.x - 0.4, at.y - 0.4), W, H, zoom, at, 8, 0x0d0b09, 0);
  world.renderObjects();
  const empty = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, empty);
  let top = H;
  let bottom = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(px[i]! - empty[i]!) + Math.abs(px[i + 1]! - empty[i + 1]!) + Math.abs(px[i + 2]! - empty[i + 2]!) > 24) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  zoom = Math.min(4, (H * FILL) / Math.max(20, bottom - top));
}

function toCanvas(px: Uint8Array, diff?: Uint8Array): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const img = c.getContext('2d')!.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4;
      const d = (y * W + x) * 4;
      if (diff) {
        const k = Math.max(Math.abs(px[s]! - diff[s]!), Math.abs(px[s + 1]! - diff[s + 1]!), Math.abs(px[s + 2]! - diff[s + 2]!));
        img.data.set(k > TOLERANCE ? [255, 40, 40, 255] : [px[s]! / 3, px[s + 1]! / 3, px[s + 2]! / 3, 255], d);
      } else img.data.set([px[s]!, px[s + 1]!, px[s + 2]!, 255], d);
    }
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

function compare(a: Uint8Array, b: Uint8Array): { pixels: number; max: number } {
  let pixels = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const k = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
    if (k > TOLERANCE) pixels++;
    max = Math.max(max, k);
  }
  return { pixels, max };
}

const rows: { gear: string; pose: string; dir: number; pixels: number; max: number; noisePixels: number; noiseMax: number }[] = [];
interface Worst {
  a: Uint8Array;
  b: Uint8Array;
  label: string;
  pixels: number;
}
const found: { worst: Worst | null } = { worst: null };
const summary = document.getElementById('summary')!;
// 每幀的 CPU 時間（只算 PolyFigure 交出資料，不含繪製）：主角跑步 300 幀（先跑一次暖機）
const timeOf = (fig: PolyFigure) => {
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) fig.update(1 / 60, { facing: facings[1]!, moving: true, alive: true });
  return (performance.now() - t0) / 300;
};
let timing = { cpu: 0, gpu: 0 };
for (const [n, subject] of subjects.entries()) {
  summary.textContent = `比對中… ${n + 1} / ${subjects.length}：${subject.name}`;
  await new Promise((r) => setTimeout(r, 0));
  const cpuFig = new PolyFigure(subject.model);
  const gpuFig = new PolyFigure(subject.model);
  cpu.dispose();
  gpu.dispose();
  cpu = world.createFigure(false);
  gpu = world.createFigure(true);
  cpuFig.sink = cpu;
  gpuFig.sink = gpu;
  for (const fig of [cpuFig, gpuFig]) {
    if (subject.outfit !== undefined) fig.setOutfit(subject.outfit);
    if (subject.weapon !== undefined) fig.setWeapon(subject.weapon);
    if (subject.phase !== undefined) fig.setPhase(subject.phase);
  }
  frame(cpuFig, subject.model);
  for (const [name, pose] of posesOf(subject.model).filter(([n]) => !onlyPose || n === onlyPose)) {
    facings.forEach((facing, dir) => {
      if (onlyDir !== null && dir !== Number(onlyDir)) return;
      cpuFig.showPose(pose, facing);
      gpuFig.showPose(pose, facing);
      const a = shot('cpu');
      const b = shot('gpu');
      const { pixels, max } = compare(a, b);
      const noise = compare(a, shot('nudge'));
      rows.push({ gear: subject.name, pose: name, dir, pixels, max, noisePixels: noise.pixels, noiseMax: noise.max });
      if (!found.worst || max > found.worst.pixels) found.worst = { a, b, label: `${subject.name} · ${name} · 方向 ${dir}`, pixels: max };
    });
  }
  if (subject.model === HEROINE && subject.outfit === null) {
    timing = { cpu: timeOf(cpuFig), gpu: timeOf(gpuFig) };
    timing = { cpu: timeOf(cpuFig), gpu: timeOf(gpuFig) };
  }
}
const { cpu: cpuMs, gpu: gpuMs } = timing;

const total = rows.length;
const worse = rows.filter((r) => r.pixels > r.noisePixels);
const same = rows.filter((r) => r.pixels === 0).length;
const maxPixels = Math.max(...rows.map((r) => r.pixels));
const maxDiff = Math.max(...rows.map((r) => r.max));
const noisePixels = Math.max(...rows.map((r) => r.noisePixels));
const noiseMax = Math.max(...rows.map((r) => r.noiseMax));
const noiseSame = rows.filter((r) => r.noisePixels === 0).length;
document.getElementById('summary')!.innerHTML =
  `GPU 與 CPU：<b>${same} / ${total}</b> 個畫面完全相同；最多 ${maxPixels} 個像素不同、最大色差 ${maxDiff}<br>` +
  `對照組（CPU 移動 ${NUDGE}）：<b>${noiseSame} / ${total}</b> 個畫面完全相同；最多 ${noisePixels} 個像素不同、最大色差 ${noiseMax}<br>` +
  `GPU 與 CPU 的差異超過對照組的畫面：<b>${worse.length}</b> 個（${subjects.length} 個角色 / 階段）<br>` +
  `每幀的 CPU 時間（主角跑步）：CPU 算頂點 ${cpuMs.toFixed(3)} ms → GPU 蒙皮 ${gpuMs.toFixed(3)} ms`;
(window as unknown as Record<string, unknown>).skinCompare = { cpuMs, gpuMs, worse: worse.length, subjects: subjects.length, total, same, maxPixels, maxDiff, noiseSame, noisePixels, noiseMax, rows };
const worst = found.worst;
if (worst) {
  const box = document.getElementById('worst')!;
  for (const [title, c] of [
    ['CPU（舊）', toCanvas(worst.a)],
    ['GPU 蒙皮（新）', toCanvas(worst.b)],
    [`差異（紅色）：${worst.label}`, toCanvas(worst.a, worst.b)],
  ] as const) {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = title;
    fig.append(c, cap);
    box.append(fig);
  }
}
const table = document.getElementById('table')!;
table.innerHTML =
  '<tr><th>角色</th><th>姿勢</th><th>方向</th><th>不同的像素</th><th>最大色差</th><th>對照組像素</th><th>對照組色差</th></tr>' +
  rows
    // 只列 GPU 的差異超過對照組、或色差超過 2 的畫面
    .filter((r) => r.pixels > r.noisePixels || r.max > 2)
    .map((r) => `<tr><td>${r.gear}</td><td>${r.pose}</td><td>${r.dir}</td><td>${r.pixels}</td><td>${r.max}</td><td>${r.noisePixels}</td><td>${r.noiseMax}</td></tr>`)
    .join('');
