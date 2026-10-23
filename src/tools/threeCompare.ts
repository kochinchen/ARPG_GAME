/**
 * 開發用：Three.js 畫面試驗（http://localhost:5173/viewer-three.html?monster=skeleton）。
 * 左邊是遊戲現在的畫法（PolyFigure：CPU 投影後由 Pixi 畫 2D 多邊形），右邊把同一份模型交給 Three.js 在 GPU 上畫，
 * 加上即時光源（主光、背光、火把）與投射陰影。兩邊共用同一個 PolyFigure 的動作，只有畫法不同；遊戲本身不受影響。
 */
import { Application, Container, Graphics } from 'pixi.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { enemies } from '../data/enemies';
import { HEROINE } from '../render/figure/Heroine';
import { MONSTER_MODELS } from '../render/figure/Monsters';
import { figureScale, solveJoints, type AttackVariant, type FigureModel, type Joint, type Pose } from '../render/figure/FigureModel';
import { PolyFigure, yawFor } from '../render/figure/PolyFigure';
import { apply, normalize, rotY, type M3, type Mesh, type V3 } from '../render/figure/Poly3D';
import { HEAD_SCALE, scaleHead } from '../render/figure/heroine/HeroineBody';
import { heroineHairOnHead } from '../render/figure/heroine/HeroineHair';
import { faceTexture, smoothHeadGeometry } from './threeFace';

/** 與 PolyFigure 相同的畫面縮放與視線、主光方向 */
const SCALE = 0.95;
const VIEW = normalize([1, 0.82, 1]);
const LIGHT = normalize([0.15, 1.2, 1.1]);
/** PolyFigure 的高度投影係數 0.94 比正交鏡頭的 cos(仰角) 大一點：Three.js 這邊把模型拉高，兩邊輪廓才一樣 */
const Y_STRETCH = 0.94 / Math.cos(Math.asin(VIEW[1]));
/** 畫面左右方向（World） */
const SCREEN_RIGHT = new THREE.Vector3(1, 0, -1).normalize();
/** 鏡頭的上方（World）：畫面往上移動時沿這個方向 */
const SCREEN_UP = new THREE.Vector3(VIEW[0], VIEW[1], VIEW[2]).cross(SCREEN_RIGHT).normalize();
/** 地面（腳底）在畫面高度的位置 */
const GROUND_Y = 0.7;

const DIRECTIONS: { label: string; facing: Vec2 }[] = [
  { label: '下', facing: vec2(1, 1) },
  { label: '右下', facing: vec2(1, 0) },
  { label: '右', facing: vec2(1, -1) },
  { label: '右上', facing: vec2(0, -1) },
  { label: '上', facing: vec2(-1, -1) },
  { label: '左上', facing: vec2(-1, 0) },
  { label: '左', facing: vec2(-1, 1) },
  { label: '左下', facing: vec2(0, 1) },
];

type Mode = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'death';
const MODES: [Mode, string][] = [
  ['idle', '待機'],
  ['walk', '走路'],
  ['run', '跑步'],
  ['attack', '攻擊'],
  ['hit', '受傷'],
  ['death', '倒地'],
];

const state = { mode: 'idle' as Mode, dir: 0, spin: false, shadows: true, torch: true, orbit: false, newFace: true, closeUp: false };
type Toggle = 'spin' | 'shadows' | 'torch' | 'orbit' | 'newFace' | 'closeUp';

const params = new URLSearchParams(location.search);
const monsterId = MONSTER_MODELS[`enemy.${params.get('monster')}`] ? `enemy.${params.get('monster')}` : 'enemy.skeleton';
const nameOf = (id: string) => enemies.find((e) => e.id === id)?.name ?? id.replace('enemy.', '');

/** PolyFigure 每幀算好的姿勢與次級運動方向（private；試驗頁直接讀取，不改遊戲程式） */
type FigureInternals = { current: Pose; chain: Map<Joint, V3> };

interface Actor {
  model: FigureModel;
  figure: PolyFigure;
  scale: number;
  /** 沿畫面左右的位置（World 單位） */
  offset: number;
  /** Pixi 這邊固定影子的水平半徑（模型沒有 dynamicShadow 時） */
  shadowR: number;
  variant?: AttackVariant;
  pixi: Container;
  shadow: Graphics;
  three: THREE.Group;
  parts: Map<Joint, THREE.Group>;
}

function makeActor(model: FigureModel, radius: number, variant?: AttackVariant): Actor {
  const scale = figureScale(model, radius);
  const figure = new PolyFigure(model, scale);
  const pixi = new Container();
  const shadow = new Graphics();
  pixi.addChild(shadow, figure.graphics);
  const three = new THREE.Group();
  three.scale.set(scale, scale * Y_STRETCH, scale);
  const parts = new Map<Joint, THREE.Group>();
  const toon = model.lighting === 'toon' || model.lighting === 'flat';
  for (const part of model.parts) {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    for (const mesh of part.meshes) {
      const m = new THREE.Mesh(meshGeometry(mesh, toon), MATERIAL);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    three.add(g);
    parts.set(part.joint, g);
  }
  return { model, figure, scale, offset: 0, shadowR: 0, ...(variant ? { variant } : {}), pixi, shadow, three, parts };
}

const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });

/** 多面體 → 三角形（每個面一個顏色）；卡通光影的模型用材質原色，明暗交給光源 */
function meshGeometry(mesh: Mesh, toon: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const face of mesh.faces) {
    c.setHex(toon ? (face.base ?? face.color) : face.color, THREE.SRGBColorSpace);
    for (let i = 1; i < face.idx.length - 1; i++) {
      for (const j of [face.idx[0]!, face.idx[i]!, face.idx[i + 1]!]) {
        pos.push(...mesh.verts[j]!);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const transpose = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** 用 PolyFigure 這一幀的姿勢擺好 Three.js 的關節（次級運動的方向換算回角度，與 PolyFigure 的算法相同） */
function poseThree(actor: Actor, facing: Vec2): void {
  const f = actor.figure as unknown as FigureInternals;
  const model = actor.model;
  const adjust = model.secondary
    ? (joint: Joint, angles: V3, parentM: M3): V3 => {
        const d = f.chain.get(joint);
        if (!d) return angles;
        const l = apply(rotY(-angles[1]), apply(transpose(parentM), d));
        return [Math.atan2(-l[2], -l[1]), angles[1], Math.asin(Math.max(-1, Math.min(1, l[0])))];
      }
    : undefined;
  const world = solveJoints(model.parts, model.hipHeight, f.current, yawFor(facing), adjust);
  for (const [joint, g] of actor.parts) {
    const { m, p } = world.get(joint)!;
    g.matrix.set(m[0], m[1], m[2], p[0], m[3], m[4], m[5], p[1], m[6], m[7], m[8], p[2], 0, 0, 0, 1);
    g.matrixWorldNeedsUpdate = true;
  }
}

/** World → Pixi 畫面座標（與 PolyFigure 的投影相同，未乘縮放） */
const toPixi = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.707 * SCALE, ((x + z) * 0.354 - y * 0.94) * SCALE];

function groundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#2a241e';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#25201a';
  g.fillRect(64, 0, 64, 64);
  g.fillRect(0, 64, 64, 64);
  g.strokeStyle = '#1e1914';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  g.strokeRect(64, 64, 64, 64);
  g.strokeRect(64, 0, 64, 64);
  g.strokeRect(0, 64, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function toolbar(onChange: () => void): void {
  const bar = document.getElementById('bar')!;
  const title = document.createElement('b');
  title.textContent = 'Three.js 畫面比較';
  const select = document.createElement('select');
  for (const id of Object.keys(MONSTER_MODELS)) {
    const option = document.createElement('option');
    option.value = id.replace('enemy.', '');
    option.textContent = nameOf(id);
    option.selected = id === monsterId;
    select.appendChild(option);
  }
  select.onchange = () => (location.search = `?monster=${select.value}`);
  const group = <T>(items: [T, string][], get: () => T, set: (v: T) => void) => {
    const div = document.createElement('div');
    div.className = 'group';
    const buttons = items.map(([v, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => {
        set(v);
        refresh();
        onChange();
      };
      div.appendChild(b);
      return [v, b] as const;
    });
    const refresh = () => buttons.forEach(([v, b]) => b.classList.toggle('on', v === get()));
    refresh();
    refreshers.push(refresh);
    return div;
  };
  const refreshers: (() => void)[] = [];
  const check = (label: string, key: Toggle) => {
    const el = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state[key];
    input.onchange = () => {
      state[key] = input.checked;
      onChange();
    };
    el.append(input, label);
    return el;
  };
  const reset = document.createElement('button');
  reset.textContent = '鏡頭復原';
  reset.onclick = () => {
    resetCamera();
  };
  bar.append(
    title,
    select,
    group(MODES, () => state.mode, (v) => (state.mode = v)),
    group(DIRECTIONS.map((d, i): [number, string] => [i, d.label]), () => state.dir, (v) => (state.dir = v)),
    check('自動轉身', 'spin'),
    check('陰影', 'shadows'),
    check('火把', 'torch'),
    check('自由鏡頭（右邊拖曳）', 'orbit'),
    check('新臉（貼圖五官）', 'newFace'),
    check('臉部特寫', 'closeUp'),
    reset,
  );
  syncDirButtons = () => refreshers[1]!();
}
let syncDirButtons = () => {};
let resetCamera = () => {};

async function main(): Promise<void> {
  const def = enemies.find((e) => e.id === monsterId);
  const monsterModel = MONSTER_MODELS[monsterId]!;
  const hero = makeActor(HEROINE, 0.3, HEROINE.poses.attackVariants?.slash ? 'slash' : undefined);
  const monster = makeActor(monsterModel, (def?.radius ?? monsterModel.referenceRadius) * (def?.size ?? 1));
  const actors = [hero, monster];

  // 女主角的新臉：平滑的頭 + 貼圖五官（頭髮照舊）；與原本的頭放在同一個關節，用開關切換
  const headJoint = hero.parts.get('head')!;
  const oldHead = new THREE.Group();
  oldHead.add(...headJoint.children);
  const newHead = new THREE.Group();
  const face = new THREE.Mesh(smoothHeadGeometry(), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.55 }));
  for (const mesh of [face, ...scaleHead(heroineHairOnHead()).map((m) => new THREE.Mesh(meshGeometry(m, true), MATERIAL))]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    newHead.add(mesh);
  }
  headJoint.add(oldHead, newHead);

  // 量出兩隻角色的大小，左右並排
  const size = (a: Actor) => {
    a.figure.update(0, { facing: DIRECTIONS[0]!.facing, moving: false, alive: true });
    poseThree(a, DIRECTIONS[0]!.facing);
    a.three.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(a.three).getSize(new THREE.Vector3());
    return { w: Math.max(s.x, s.z), h: s.y };
  };
  const hs = size(hero);
  const ms = size(monster);
  const gap = Math.max(hs.w, ms.w) * 0.35;
  const total = hs.w + ms.w + gap;
  hero.offset = -total / 2 + hs.w / 2;
  monster.offset = total / 2 - ms.w / 2;
  hero.shadowR = hs.w * 0.35 * SCALE;
  monster.shadowR = ms.w * 0.35 * SCALE;
  const tallest = Math.max(hs.h, ms.h);
  const extent = total / 2 + tallest;
  /** 火把：兩隻角色之間的空隙、稍微靠近鏡頭 */
  const torchAt = SCREEN_RIGHT.clone()
    .multiplyScalar(-total / 2 + hs.w + gap / 2)
    .add(new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(gap * 0.6));
  // 高度在女主角頭頂上方：從低處照上來會把鼻子的影子拉長到臉頰
  const torchH = Math.max(hs.h * 1.15, tallest * 0.55);

  // ─────────── 左：PixiJS（遊戲現在的畫法） ───────────
  const pixiHost = document.getElementById('pixi')!;
  const app = new Application();
  await app.init({ resizeTo: pixiHost, background: 0x16130f, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  pixiHost.appendChild(app.canvas);
  const stage = new Container();
  app.stage.addChild(stage);
  const tile = Math.max(hs.w, ms.w) * 0.9;
  const ground = new Graphics();
  for (let i = -8; i < 8; i++) {
    for (let j = -8; j < 8; j++) {
      const pts = [toPixi(i * tile, 0, j * tile), toPixi((i + 1) * tile, 0, j * tile), toPixi((i + 1) * tile, 0, (j + 1) * tile), toPixi(i * tile, 0, (j + 1) * tile)].flat();
      ground.poly(pts).fill({ color: (i + j) & 1 ? 0x25201a : 0x2a241e }).stroke({ color: 0x1e1914, width: 0.4 });
    }
  }
  const [tx, ty] = toPixi(torchAt.x, 0, torchAt.z);
  const torchPixi = new Graphics()
    .rect(tx - tallest * 0.02, ty - torchH * 0.94 * SCALE, tallest * 0.04, torchH * 0.94 * SCALE)
    .fill({ color: 0x3a2a1c })
    .circle(tx, ty - torchH * 0.94 * SCALE, tallest * 0.035)
    .fill({ color: 0xffb060 });
  stage.addChild(ground);
  for (const a of actors) {
    const [x, y] = toPixi(SCREEN_RIGHT.x * a.offset, 0, SCREEN_RIGHT.z * a.offset);
    a.pixi.position.set(x, y);
    stage.addChild(a.pixi);
  }
  stage.addChild(torchPixi);

  // ─────────── 右：Three.js ───────────
  const threeHost = document.getElementById('three')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  threeHost.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16130f);

  const tex = groundTexture();
  tex.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tile * 16, tile * 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  for (const a of actors) {
    a.three.position.copy(SCREEN_RIGHT).multiplyScalar(a.offset);
    scene.add(a.three);
  }

  scene.add(new THREE.HemisphereLight(0xa8b4d8, 0x3a2c1e, 0.8));
  const key = new THREE.DirectionalLight(0xffe6c4, 2.2);
  key.position.set(LIGHT[0], LIGHT[1], LIGHT[2]).multiplyScalar(extent * 3);
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 6 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = tallest * 0.004;
  scene.add(key);
  // 背光（冷色）：勾出輪廓，相當於現在的暖色輪廓光
  const rim = new THREE.DirectionalLight(0x9fb4ff, 1.1);
  rim.position.set(-1, 0.7, -1).multiplyScalar(extent * 3);
  scene.add(rim);
  const torch = new THREE.PointLight(0xff8a3c, 0, tallest * 4, 2);
  torch.position.set(torchAt.x, torchH, torchAt.z);
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(tallest * 0.035, 1), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  flame.position.copy(torch.position);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(tallest * 0.015, tallest * 0.022, torchH, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9, flatShading: true }));
  post.position.set(torchAt.x, torchH / 2, torchAt.z);
  post.castShadow = true;
  scene.add(torch, flame, post);

  const camera = new THREE.OrthographicCamera();
  const controls = new OrbitControls(camera, renderer.domElement);
  const toView = new THREE.Vector3(VIEW[0], VIEW[1], VIEW[2]);

  // 兩邊同樣大小：1 World 單位 = zoom × SCALE px；特寫時兩邊都以臉為中心再放大 closeUp 倍
  let zoom = 1;
  const view = () => {
    const w = pixiHost.clientWidth;
    const h = pixiHost.clientHeight;
    const tw = threeHost.clientWidth;
    const th = threeHost.clientHeight;
    const target = new THREE.Vector3();
    let k = 1;
    if (state.closeUp) {
      // 臉的中心（head 關節座標 y ≈ 5）；臉高約 9 單位，佔畫面高度的 45%
      hero.three.updateMatrixWorld(true);
      headJoint.localToWorld(target.set(0, 5 * HEAD_SCALE, 3));
      k = (h * 0.45) / (9 * HEAD_SCALE * hero.scale * 0.94 * SCALE * zoom);
      const [x, y] = toPixi(target.x, target.y / Y_STRETCH, target.z);
      stage.scale.set(zoom * k);
      stage.position.set(w / 2 - x * zoom * k, h / 2 - y * zoom * k);
    } else {
      stage.scale.set(zoom);
      stage.position.set(w / 2, h * GROUND_Y);
      target.copy(SCREEN_UP).multiplyScalar(((GROUND_Y - 0.5) * th) / (zoom * SCALE));
    }
    camera.zoom = k;
    camera.position.copy(target).addScaledVector(toView, extent * 4);
    controls.target.copy(target);
    camera.updateProjectionMatrix();
    controls.update();
  };
  resetCamera = view;
  const layout = () => {
    zoom = Math.min((pixiHost.clientHeight * 0.6) / (tallest * 0.94 * SCALE), (pixiHost.clientWidth * 0.85) / (total * SCALE));
    const tw = threeHost.clientWidth;
    const th = threeHost.clientHeight;
    renderer.setSize(tw, th);
    const u = zoom * SCALE;
    Object.assign(camera, { left: -tw / 2 / u, right: tw / 2 / u, top: th / 2 / u, bottom: -th / 2 / u, near: 0.1, far: extent * 10 });
    view();
  };
  new ResizeObserver(layout).observe(threeHost);
  layout();

  let closeUp = state.closeUp;
  const apply3 = () => {
    if (closeUp !== state.closeUp) {
      closeUp = state.closeUp;
      view();
    }
    oldHead.visible = !state.newFace;
    newHead.visible = state.newFace;
    controls.enabled = state.orbit;
    key.castShadow = state.shadows;
    torch.castShadow = state.shadows;
    torch.visible = flame.visible = post.visible = torchPixi.visible = state.torch;
  };
  toolbar(apply3);
  apply3();

  const info = document.getElementById('three-info')!;
  let clock = 0;
  let lastDir = state.dir;
  let spinClock = 0;
  let frames = 0;
  let infoClock = 0;
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    const prev = clock;
    clock += dt;
    if (state.spin && (spinClock += dt) > 1.2) {
      spinClock = 0;
      state.dir = (state.dir + 1) % DIRECTIONS.length;
      syncDirButtons();
    }
    const facing = DIRECTIONS[state.dir]!.facing;
    // 攻擊 / 受傷每 1.6 秒一次；倒地 2.4 秒後站起來
    const tick = Math.floor(clock / 1.6) > Math.floor(prev / 1.6);
    const alive = state.mode !== 'death' || clock % 3.2 > 2.4;
    for (const a of actors) {
      if (tick && state.mode === 'attack') a.figure.act('attack', 0.35, a.variant);
      if (tick && state.mode === 'hit') a.figure.hit();
      a.figure.update(dt, { facing, moving: state.mode === 'walk' || state.mode === 'run', alive, speed: state.mode === 'walk' ? 2 : 4 });
      const s = a.figure.shadow;
      a.shadow.clear();
      if (s) a.shadow.ellipse(s.x, s.y, s.rx, s.rx / 2).fill({ color: 0x000000, alpha: 0.35 });
      else a.shadow.ellipse(0, 0, a.shadowR, a.shadowR / 2).fill({ color: 0x000000, alpha: 0.4 });
      poseThree(a, facing);
    }
    // 特寫時轉身：等這一幀擺好姿勢再重新對準臉
    if (state.closeUp && lastDir !== state.dir) view();
    lastDir = state.dir;
    torch.intensity = tallest * tallest * 6 * (0.85 + 0.1 * Math.sin(clock * 13) + 0.05 * Math.sin(clock * 31));
    renderer.render(scene, camera);
    frames++;
    if ((infoClock += dt) > 0.5) {
      info.textContent = `同一份模型與動作，即時光源 + 投射陰影 · 每幀 ${renderer.info.render.triangles} 個三角形（含陰影） · ${Math.round(frames / infoClock)} FPS`;
      frames = 0;
      infoClock = 0;
    }
  });
}

void main();
