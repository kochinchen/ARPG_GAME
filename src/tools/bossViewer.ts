import { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { enemies } from '../data/enemies';
import { BOSS_MODELS } from '../render/figure/Bosses';
import { figureScale, type AttackVariant, type FigureModel } from '../render/figure/FigureModel';
import { PolyFigure, type FigureState } from '../render/figure/PolyFigure';
import { ThreeWorld, type ThreeFigure } from '../render/three/ThreeWorld';

/**
 * 開發用：魔王動作預覽（http://localhost:5173/boss-viewer.html，?model=abyss_sovereign 換魔王）。
 * 用遊戲的 Three.js 畫法（燭光、影子）畫一隻魔王，可以切換待機 / 走路 / 跑步、每一種攻擊招式、低吼、受傷、倒地，
 * 以及魔王的階段（phasePoses 每個階段的持武器方式、phaseHidden 藏起的武器、phaseDrops 掉在地上的盾與劍，和遊戲一樣留在場上）。
 * 滑鼠滾輪縮放、方向鍵或按鈕轉身、可放慢速度。
 */

const params = new URLSearchParams(location.search);
const ids = Object.keys(BOSS_MODELS).filter((id) => enemies.some((e) => e.id === id && e.boss));
const modelId = ids.includes(`enemy.${params.get('model')}`) ? `enemy.${params.get('model')}` : 'enemy.abyss_sovereign';
const baseModel: FigureModel = BOSS_MODELS[modelId]!;
/** ?bones=1：蒙皮網格每個面依權重最大的骨頭上色（手臂 = 黃 / 橘 / 紅、鎖骨 = 白，其他依名稱），檢查分區 */
const BONE_COLORS: Record<string, number> = { upperArm: 0xffe040, forearm: 0xff8a20, hand: 0xff3030, ex_fingers: 0xff40c0, ex_clav: 0xffffff };
const model: FigureModel =
  params.get('bones') && baseModel.skin
    ? {
        ...baseModel,
        skin: {
          ...baseModel.skin,
          faces: baseModel.skin.faces.map((f) => {
            const bone = baseModel.skin!.infl[f.idx[0]]!.reduce((a, b) => (a.w > b.w ? a : b)).joint;
            const key = Object.keys(BONE_COLORS).find((k) => bone.startsWith(k));
            let h = 0;
            for (const ch of bone) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
            return { ...f, color: key ? BONE_COLORS[key]! : 0x303848 + (h % 0x404040) };
          }),
        },
      }
    : baseModel;
const def = enemies.find((e) => e.id === modelId)!;
/** 遊戲裡的大小：碰撞半徑 × 體型倍率 */
const scale = figureScale(model, (def.radius ?? 0.5) * (def.size ?? 1));

const canvas = document.getElementById('view') as HTMLCanvasElement;
// preserveDrawingBuffer：可以直接從畫布存截圖（檢查用）
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
const projection = new IsoProjection();
const world = new ThreeWorld(canvas, gl, projection);
const FLOOR = 0x4a4038;
const SIZE = 40;
world.setMap([], 1, [], { style: 'rubble', accent: 0, glow: 0 }, [0, 0, SIZE, 0, SIZE, SIZE, FLOOR, 0, 0, SIZE, SIZE, 0, SIZE, FLOOR]);
const at = vec2(SIZE / 2, SIZE / 2);

const boss = new PolyFigure(model, scale);
const sink = world.createFigure(true);
boss.sink = sink;

// ── 狀態 ──
type Move = 'idle' | 'walk' | 'run';
const DIRS: { label: string; facing: Vec2 }[] = [
  { label: '下', facing: vec2(1, 1) },
  { label: '右下', facing: vec2(1, 0) },
  { label: '右', facing: vec2(1, -1) },
  { label: '右上', facing: vec2(0, -1) },
  { label: '上', facing: vec2(-1, -1) },
  { label: '左上', facing: vec2(-1, 0) },
  { label: '左', facing: vec2(-1, 1) },
  { label: '左下', facing: vec2(0, 1) },
];
const state = { tpose: 0 as 0 | 1 | 2, move: 'idle' as Move, alive: true, dir: 0, spin: false, speed: 1, loop: null as (() => void) | null, phase: 0, zoom: 2.2 };
let loopTimer = 0;
let spinAngle = 0;
/** 掉在地上的東西（階段變化） */
const drops: { sink: ThreeFigure; position: Vec2 }[] = [];

const facing = (): Vec2 => {
  if (!state.spin) return DIRS[state.dir]!.facing;
  return vec2(Math.cos(spinAngle), Math.sin(spinAngle));
};

/** 階段：藏起武器，並把這個階段（含之前）掉下來的東西放在地上 */
function setPhase(phase: number): void {
  state.phase = phase;
  boss.setPhase(phase);
  for (const d of drops.splice(0)) d.sink.dispose();
  for (let p = 1; p <= phase; p++) {
    const drop = model.phaseDrops?.[p];
    if (!drop) continue;
    // 和遊戲一樣：掉落當下的面向、不會動（畫一次就好）
    const figure = new PolyFigure(drop.model, scale);
    const s = world.createFigure(false);
    figure.sink = s;
    figure.showPose(drop.model.poses.ready(0), facing());
    drops.push({ sink: s, position: vec2(at.x + drop.offset[0], at.y + drop.offset[1]) });
  }
  refresh();
}

// ── 動作 ──
const WINDUP = 0.9;
const actions: { label: string; run: () => void }[] = [
  { label: '一般攻擊', run: () => boss.act('attack', WINDUP) },
  ...(Object.keys(model.poses.attackVariants ?? {}) as AttackVariant[]).map((v) => ({
    label: ({ slash: '橫斬', thrust: '突刺', overhead: '上劈', shoot: '射擊', staff: '舉杖' } as const)[v],
    run: () => boss.act('attack', WINDUP, v),
  })),
  { label: '施法 / 低吼', run: () => boss.act('cast', WINDUP) },
  { label: '受傷', run: () => boss.hit() },
];

/** 檢查手臂的網格與骨架：待機姿勢、鎖骨不轉，雙臂往兩側水平伸直、手掌微開；bend = 前臂往前彎 90°（看手肘的位置） */
function tPose(bend: boolean) {
  const p = model.poses.ready(0);
  const side = (s: 'L' | 'R', k: 1 | -1) => ({
    [`ex_clav${s}`]: [0, 0, 0],
    [`upperArm${s}`]: [0, 0, (k * Math.PI) / 2],
    [`forearm${s}`]: [bend ? -Math.PI / 2 : 0, 0, 0],
    [`hand${s}`]: [0, 0, 0],
    [`ex_fingers${s}`]: [0.25, 0, 0],
  });
  return { ...p, angles: { ...p.angles, ...side('L', 1), ...side('R', -1), weapon: [0, 0, 0] as [number, number, number], weaponL: [0, 0, 0] as [number, number, number] } };
}

// ── 介面 ──
const bar = document.getElementById('bar')!;
const group = (title: string) => {
  const g = document.createElement('div');
  g.className = 'group';
  const t = document.createElement('span');
  t.textContent = title;
  g.append(t);
  bar.append(g);
  return g;
};
const button = (g: HTMLElement, label: string, onClick: () => void, isOn?: () => boolean) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    onClick();
    refresh();
  };
  if (isOn) toggles.push(() => b.classList.toggle('on', isOn()));
  g.append(b);
  return b;
};
const toggles: (() => void)[] = [];
const refresh = () => {
  for (const t of toggles) t();
  status.textContent = `${def.name}　階段 ${state.phase + 1}　${state.alive ? { idle: '待機', walk: '走路', run: '跑步' }[state.move] : '倒地'}　速度 ×${state.speed}　（滑鼠滾輪縮放、← → 轉身）`;
};
const status = document.getElementById('status')!;

const title = document.createElement('b');
title.textContent = '魔王動作預覽';
bar.append(title);
const select = document.createElement('select');
for (const id of ids) {
  const opt = document.createElement('option');
  opt.value = id.replace('enemy.', '');
  opt.textContent = enemies.find((e) => e.id === id)!.name;
  opt.selected = id === modelId;
  select.append(opt);
}
select.onchange = () => (location.search = `?model=${select.value}`);
bar.append(select);

const gMove = group('移動');
for (const [m, label] of [['idle', '待機'], ['walk', '走路'], ['run', '跑步']] as [Move, string][]) {
  button(gMove, label, () => ((state.move = m), (state.alive = true)), () => state.alive && state.move === m);
}
const gAct = group('招式');
for (const a of actions) button(gAct, a.label, () => ((state.alive = true), (state.loop = null), a.run()));
const gLoop = group('連續');
const loopSel = document.createElement('select');
for (const [value, label] of [['', '不重複'], ...actions.map((a, i) => [String(i), a.label]), ['all', '全部輪流']]) {
  const opt = document.createElement('option');
  opt.value = value!;
  opt.textContent = label!;
  loopSel.append(opt);
}
loopSel.onchange = () => {
  let i = 0;
  state.loop = loopSel.value === '' ? null : loopSel.value === 'all' ? () => actions[i++ % actions.length]!.run() : actions[Number(loopSel.value)]!.run;
  loopTimer = 0;
};
gLoop.append(loopSel);
const gDeath = group('生死');
button(gDeath, '倒地', () => ((state.alive = false), (state.loop = null), (loopSel.value = '')), () => !state.alive);
button(gDeath, '復活', () => (state.alive = true));
const gPhase = group('階段');
const phases = model.phaseHidden?.length ?? 1;
const PHASE_LABELS = ['持劍與盾', '盾牌落地', '巨劍落地'];
for (let p = 0; p < phases; p++) button(gPhase, `${p + 1}${modelId === 'enemy.abyss_sovereign' ? ` ${PHASE_LABELS[p]}` : ''}`, () => setPhase(p), () => state.phase === p);
const gCheck = group('檢查');
button(gCheck, 'T 字（手臂往兩側伸直）', () => (state.tpose = state.tpose === 1 ? 0 : 1), () => state.tpose === 1);
button(gCheck, 'T 字＋前臂往前彎 90°', () => (state.tpose = state.tpose === 2 ? 0 : 2), () => state.tpose === 2);
const gDir = group('方向');
DIRS.forEach((d, i) => button(gDir, d.label, () => ((state.dir = i), (state.spin = false)), () => !state.spin && state.dir === i));
button(gDir, '自動轉身', () => (state.spin = !state.spin), () => state.spin);
const gSpeed = group('速度');
for (const s of [0.25, 0.5, 1]) button(gSpeed, `×${s}`, () => (state.speed = s), () => state.speed === s);

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') state.dir = (state.dir + 7) % 8;
  else if (e.key === 'ArrowRight') state.dir = (state.dir + 1) % 8;
  else return;
  state.spin = false;
  refresh();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.zoom = Math.min(6, Math.max(0.5, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
}, { passive: false });

// ── 畫面 ──
function resize(): void {
  const top = bar.getBoundingClientRect().height;
  canvas.style.top = `${top}px`;
  const w = innerWidth;
  const h = innerHeight - top;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * devicePixelRatio);
  canvas.height = Math.round(h * devicePixelRatio);
}
addEventListener('resize', resize);
resize();
refresh();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * state.speed;
  last = now;
  if (state.spin) spinAngle += dt * 0.6;
  if (state.loop && state.alive) {
    loopTimer -= dt;
    if (loopTimer <= 0) {
      state.loop();
      loopTimer = 3;
    }
  }
  const s: FigureState = { facing: facing(), moving: state.alive && state.move !== 'idle', alive: state.alive, speed: state.move === 'walk' ? 2 : 6 };
  if (state.tpose) boss.showPose(tPose(state.tpose === 2), s.facing);
  else boss.update(dt, s);
  sink.place(at, vec2(0, 0), 0, 0xffffff, 1, true);
  for (const d of drops) d.sink.place(d.position, vec2(0, 0), 0, 0xffffff, 1, true);
  // 影子中心在魔王前方一點、燭光跟著魔王
  world.renderFloor(at, canvas.width, canvas.height, state.zoom * devicePixelRatio, vec2(at.x + 2, at.y + 2), 14, 0x0d0b09, dt);
  world.renderObjects();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
