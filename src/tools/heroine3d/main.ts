/**
 * 開發用：女主角 3D 構面模型（http://localhost:5173/heroine-3d.html）。
 * 骨架（skeleton.ts）→ 構面體積（volumes.ts）→ Three.js 場景；可自由轉動視角、切換構面線 / 骨架 / 素模 / 動畫。
 * 主光固定在畫面左上（跟著鏡頭轉），所以每個體積都是左上面亮、正面中亮、右下面暗。
 * Blender 版：`npm run art:heroine` 匯出 art/heroine/heroine.blend，在 Blender 修改後匯出成 art/heroine/heroine.glb，
 * 這個頁面會載入它，用同一組動作帶動（骨頭名稱 = joint 名稱），可以和程式版並排比較。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FLAPS, JOINTS } from './skeleton';
import { PALETTE } from './palette';
import { buildVolumes } from './volumes';

// ── 場景 ──
const host = document.getElementById('view')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#17130f');
scene.fog = new THREE.Fog('#17130f', 6, 14);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
camera.position.set(1.6, 1.55, 3.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
controls.minDistance = 0.6;
controls.maxDistance = 9;
controls.update();

// 主光（畫面左上）、補光、背後微弱的輪廓光
const key = new THREE.DirectionalLight('#fff1dc', 3.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -1.4;
key.shadow.camera.right = key.shadow.camera.top = 1.4;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 14;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.intensity = 0.55;
scene.add(key, key.target);
const hemi = new THREE.HemisphereLight('#d4c4ac', '#3a2a20', 1.0);
scene.add(hemi);
const rim = new THREE.DirectionalLight('#9fb4d8', 0.5);
scene.add(rim, rim.target);
/** 鏡頭座標中的光線方向：左上、略朝向觀眾 */
const KEY_DIR_CAM = new THREE.Vector3(-1, 1.25, 0.85).normalize();
const RIM_DIR_CAM = new THREE.Vector3(0.9, 0.4, -1).normalize();
let lightFollowsCamera = true;
const fixedKeyDir = new THREE.Vector3(-0.8, 1.3, 1).normalize();

// 地面
const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshLambertMaterial({ color: '#2b231b' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(8, 32, '#3d3227', '#3d3227');
grid.rotation.y = Math.PI / 4;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.position.y = 0.001;
scene.add(grid);

// ── 骨架 → joint 群組 ──
const groups = new Map<string, THREE.Group>();
const rest = new Map<string, THREE.Vector3>();
const root = new THREE.Group();
scene.add(root);
for (const j of JOINTS) {
  const g = new THREE.Group();
  g.name = j.name;
  const parent = j.parent ? JOINTS.find((q) => q.name === j.parent)!.pos : ([0, 0, 0] as const);
  g.position.set(j.pos[0] - parent[0], j.pos[1] - parent[1], j.pos[2] - parent[2]);
  rest.set(j.name, g.position.clone());
  groups.set(j.name, g);
  (j.parent ? groups.get(j.parent)! : root).add(g);
}

// ── 構面體積 → Mesh（非索引幾何 + 平面法線 = 每個三角形一個平面） ──
const materials = new Map<string, THREE.MeshPhongMaterial>();
const mat = (k: string): THREE.MeshPhongMaterial => {
  let m = materials.get(k);
  if (!m) {
    const p = PALETTE[k] ?? { color: '#ff00ff' };
    m = new THREE.MeshPhongMaterial({ color: p.color, flatShading: true, shininess: p.shininess ?? 4, specular: p.specular ?? '#141010' });
    materials.set(k, m);
  }
  return m;
};
const clay = new THREE.MeshPhongMaterial({ color: '#cfc6b8', flatShading: true, shininess: 4, specular: '#111' });
const edgeMat = new THREE.LineBasicMaterial({ color: '#1a120c', transparent: true, opacity: 0.6 });
const meshes: THREE.Mesh[] = [];
const edges: THREE.LineSegments[] = [];
let triCount = 0;
let planeCount = 0;

for (const [jointName, tris] of buildVolumes()) {
  const g = groups.get(jointName)!;
  const jp = JOINTS.find((q) => q.name === jointName)!.pos;
  for (const [k, arr] of tris.byMat) {
    const pos = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i += 3) {
      pos[i] = arr[i]! - jp[0];
      pos[i + 1] = arr[i + 1]! - jp[1];
      pos[i + 2] = arr[i + 2]! - jp[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat(k));
    mesh.castShadow = true;
    // 臉不接收陰影：瀏海的投影會把整張臉壓暗，構面的明暗交給面的方向
    mesh.receiveShadow = jointName !== 'head';
    mesh.userData.mat = k;
    g.add(mesh);
    meshes.push(mesh);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 6), edgeMat);
    e.visible = false;
    mesh.add(e);
    edges.push(e);
    triCount += arr.length / 9;
    planeCount += countPlanes(pos);
  }
}

/** 估計可見的「平面」數：法線與距離相同（幾乎共面）的三角形算同一個面 */
function countPlanes(p: Float32Array): number {
  const keys = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    keys.add(`${Math.round(n.x * 12)},${Math.round(n.y * 12)},${Math.round(n.z * 12)},${Math.round(n.dot(a) * 150)}`);
  }
  return keys.size;
}

// ── 骨架顯示 ──
const boneMat = new THREE.LineBasicMaterial({ color: '#7fd4ff', depthTest: false, transparent: true });
const jointMat = new THREE.MeshBasicMaterial({ color: '#ffd36a', depthTest: false, transparent: true });
const jointGeo = new THREE.OctahedronGeometry(0.012);
const skeletonParts: THREE.Object3D[] = [];
for (const j of JOINTS) {
  const g = groups.get(j.name)!;
  const dot = new THREE.Mesh(jointGeo, jointMat);
  dot.renderOrder = 10;
  g.add(dot);
  skeletonParts.push(dot);
  if (j.parent) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), g.position.clone()]), boneMat);
    line.renderOrder = 9;
    groups.get(j.parent)!.add(line);
    skeletonParts.push(line);
  }
}
const setSkeleton = (on: boolean) => skeletonParts.forEach((o) => (o.visible = on));
setSkeleton(false);

// ── 動畫 ──
type Mode = 'idle' | 'walk' | 'still' | 'tpose';
let mode: Mode = 'idle';
const G = (n: string) => groups.get(n)!;
const flapAxis = FLAPS.map((f) => {
  const a = (f.ang * Math.PI) / 180;
  return { tan: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), out: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) };
});
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

function animate(t: number): void {
  for (const [n, g] of groups) {
    g.rotation.set(0, 0, 0);
    g.position.copy(rest.get(n)!);
  }
  G('sword').visible = mode !== 'tpose';
  if (mode === 'still') return;
  if (mode === 'tpose') {
    // 和設定稿（轉面圖）同一個姿勢：手臂水平張開、雙腳略開
    for (const [s, k] of [['L', 1], ['R', -1]] as const) {
      const P = (n: string) => JOINTS.find((j) => j.name === n)!.pos;
      const sh = P(`shoulder${s}`), el = P(`elbow${s}`), wr = P(`wrist${s}`);
      const upper = Math.atan2(Math.abs(el[0] - sh[0]), sh[1] - el[1]);
      const fore = Math.atan2(Math.abs(wr[0] - el[0]), el[1] - wr[1]);
      G(`shoulder${s}`).rotation.z = k * (Math.PI / 2 - upper);
      G(`elbow${s}`).rotation.z = k * (upper - fore);
      G(`hip${s}`).rotation.z = k * 0.13;
      G(`ankle${s}`).rotation.z = -k * 0.13;
    }
    return;
  }
  const walk = mode === 'walk';
  const p = t * 5.4;
  const breathe = Math.sin(t * 1.7);

  if (walk) {
    G('pelvis').position.y += 0.012 * Math.cos(2 * p) - 0.008;
    G('pelvis').rotation.y = 0.07 * Math.sin(p);
    G('pelvis').rotation.z = 0.03 * Math.cos(p);
    G('chest').rotation.y = -0.11 * Math.sin(p);
    G('chest').rotation.x = 0.05;
    G('head').rotation.y = 0.05 * Math.sin(p);
    for (const [s, side] of [['L', 0], ['R', Math.PI]] as const) {
      const ph = p + side;
      G(`hip${s}`).rotation.x = -0.45 * Math.sin(ph);
      G(`knee${s}`).rotation.x = 0.08 + 0.85 * Math.pow(Math.max(0, Math.cos(ph)), 1.6);
      G(`ankle${s}`).rotation.x = -0.15 * Math.sin(ph) - 0.12 * Math.max(0, Math.cos(ph));
      const armAmp = s === 'R' ? 0.16 : 0.34;
      G(`shoulder${s}`).rotation.x = armAmp * Math.sin(ph);
      G(`elbow${s}`).rotation.x = -0.25 - 0.18 * Math.max(0, -Math.sin(ph));
    }
  } else {
    G('pelvis').position.y += 0.002 * breathe;
    G('chest').rotation.x = -0.012 * breathe;
    G('head').rotation.y = 0.07 * Math.sin(t * 0.45);
    G('head').rotation.x = 0.02 * Math.sin(t * 0.7);
    G('shoulderL').rotation.z = 0.03 + 0.02 * breathe;
    G('shoulderR').rotation.z = -0.03 - 0.02 * breathe;
    G('elbowL').rotation.x = -0.08;
    G('wristR').rotation.x = 0.04 * Math.sin(t * 0.9);
  }

  // 馬尾：一節一節延遲擺動
  for (let i = 0; i < 4; i++) {
    const g = G(`pony${i}`);
    const k = walk ? 2.2 : 1;
    g.rotation.x = 0.05 * k * Math.sin((walk ? 2 * p : t * 1.8) - i * 0.85) + (walk ? 0.06 * i : 0);
    g.rotation.z = 0.045 * k * Math.sin((walk ? p : t * 1.15) - i * 0.7);
  }
  // 腰布：每一片 root / middle / tip 各自擺動
  FLAPS.forEach((f, i) => {
    const ax = flapAxis[i]!;
    const ph = f.ang * 0.05;
    ['a', 'b', 'c'].forEach((b, k) => {
      const lift = walk ? 0.12 * Math.sin(p + (f.ang > 0 ? 0 : Math.PI) + Math.PI / 2 - k * 0.6) * Math.abs(Math.cos((f.ang * Math.PI) / 180)) : 0;
      const sway = (walk ? 0.08 : 0.035) * Math.sin(t * (walk ? 5.4 : 1.6) + ph - k * 0.9);
      q.setFromAxisAngle(ax.tan, -(sway + lift) * (k === 0 ? 0.5 : 1));
      q2.setFromAxisAngle(ax.out, 0.03 * Math.sin(t * 1.3 + ph * 2 - k));
      G(`${f.id}${b}`).quaternion.copy(q).multiply(q2);
    });
  });
}

// ── Blender 版（art/heroine/heroine.glb） ──
const GLB_URL = '/art/heroine/heroine.glb';
interface BoneLink {
  bone: THREE.Object3D;
  group: THREE.Group;
  parent: string | null;
  /** 靜止姿勢時骨頭的 World 旋轉（相對於模型根） */
  restWorld: THREE.Quaternion;
  restPos: THREE.Vector3;
}
const blender = { model: null as THREE.Object3D | null, links: [] as BoneLink[], meshes: [] as THREE.Mesh[], edges: [] as THREE.Object3D[], status: '尚未載入' };
/** 蒙皮網格的構面線：用同一副骨架的線框網格（一般的邊線不會跟著骨頭動） */
const wireMat = new THREE.MeshBasicMaterial({ color: '#1a120c', wireframe: true, transparent: true, opacity: 0.45 });
const loader = new GLTFLoader();

function loadBlender(): void {
  blender.status = '載入中…';
  updateInfo();
  loader.load(`${GLB_URL}?t=${Date.now()}`, (gltf) => {
    if (blender.model) scene.remove(blender.model);
    const model = gltf.scene;
    blender.meshes = [];
    blender.edges = [];
    // 先收集再處理：處理時會加入構面線網格，不能邊走訪邊加
    const found: THREE.Mesh[] = [];
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) found.push(o);
    });
    found.forEach((o) => {
      // 依材質名稱換回調色盤（Blender 會加上 .001 之類的後綴）
      const name = String((o.material as THREE.Material).name ?? '').replace(/\.\d+$/, '');
      o.userData.mat = name;
      o.material = PALETTE[name] ? mat(name) : new THREE.MeshPhongMaterial({ color: (o.material as THREE.MeshStandardMaterial).color, flatShading: true });
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      blender.meshes.push(o);
      let e: THREE.Object3D;
      if (o instanceof THREE.SkinnedMesh) {
        const w = new THREE.SkinnedMesh(o.geometry, wireMat);
        w.bind(o.skeleton, o.bindMatrix);
        w.frustumCulled = false;
        o.parent!.add(w);
        e = w;
      } else {
        e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 6), edgeMat);
        o.add(e);
      }
      e.visible = edgesOn;
      blender.edges.push(e);
      if (clayOn) o.material = clay;
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    blender.links = [];
    for (const j of JOINTS) {
      const bone = model.getObjectByName(j.name);
      if (!bone) continue;
      blender.links.push({ bone, group: groups.get(j.name)!, parent: j.parent, restWorld: bone.getWorldQuaternion(new THREE.Quaternion()), restPos: bone.position.clone() });
    }
    blender.model = model;
    blender.status = `已載入（骨頭 ${blender.links.length} / ${JOINTS.length}）`;
    applyCompare();
    updateInfo();
  }, undefined, () => {
    blender.status = '找不到 art/heroine/heroine.glb（先執行 npm run art:heroine，或從 Blender 匯出到這個位置）';
    updateInfo();
  });
}

/** 把程式版 joint 的動作套到 Blender 骨頭：骨頭 World 旋轉 = joint 的 World 旋轉 × 骨頭靜止時的 World 旋轉 */
const worldQ = new Map<string, THREE.Quaternion>();
const gq = new THREE.Quaternion();
const pq = new THREE.Quaternion();
const restRoot = new THREE.Vector3(...JOINTS[0]!.pos);
function driveBlender(): void {
  const model = blender.model;
  if (!model || !model.visible) return;
  root.updateMatrixWorld(true);
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const modelQ = model.getWorldQuaternion(new THREE.Quaternion());
  for (const l of blender.links) {
    l.group.getWorldQuaternion(gq).premultiply(rootQ);
    const target = gq.clone().multiply(l.restWorld);
    const pw = l.parent && worldQ.get(l.parent);
    if (pw) pq.copy(pw);
    else l.bone.parent!.getWorldQuaternion(pq).premultiply(modelQ.clone().invert());
    l.bone.quaternion.copy(pq.clone().invert().multiply(target));
    worldQ.set(l.bone.name, target);
    if (!l.parent) {
      const d = l.group.position.clone().sub(restRoot).applyQuaternion(pq.clone().invert());
      l.bone.position.copy(l.restPos).add(d);
    }
  }
}

type Compare = 'code' | 'blender' | 'both';
let compare: Compare = 'code';
function applyCompare(): void {
  root.visible = compare !== 'blender';
  root.position.x = compare === 'both' ? -0.42 : 0;
  if (blender.model) {
    blender.model.visible = compare !== 'code';
    blender.model.position.x = compare === 'both' ? 0.42 : 0;
  }
  if (compare !== 'code' && !blender.model) loadBlender();
}

// ── UI ──
const bar = document.getElementById('bar')!;
const info = document.getElementById('info')!;
const button = (label: string, onClick: (b: HTMLButtonElement) => void, parent: HTMLElement = bar): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => onClick(b);
  parent.appendChild(b);
  return b;
};
const group = (title: string): HTMLElement => {
  const g = document.createElement('div');
  g.className = 'group';
  const s = document.createElement('span');
  s.textContent = title;
  g.appendChild(s);
  bar.appendChild(g);
  return g;
};

/** 八方向：角色面向 +Z；「下」= 從正前方看 */
const VIEWS: [string, number][] = [['下', 0], ['右下', -45], ['右', -90], ['右上', -135], ['上', 180], ['左上', 135], ['左', 90], ['左下', 45]];
let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null = null;
const goView = (azDeg: number, elevDeg = 18, dist = 3.9, target = new THREE.Vector3(0, 0.95, 0)) => {
  const az = (azDeg * Math.PI) / 180, el = (elevDeg * Math.PI) / 180;
  const to = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(target);
  tween = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: target, t: 0 };
};
const views = group('視角');
for (const [label, az] of VIEWS) button(label, () => goView(az, 30, 3.9), views);
button('正面', () => goView(0, 6), views);
button('頭部特寫', () => goView(-25, 8, 0.85, new THREE.Vector3(0, 1.6, 0)), views);

const show = group('顯示');
const toggle = (label: string, init: boolean, apply: (on: boolean) => void, parent: HTMLElement) => {
  let on = init;
  const b = button(label, () => {
    on = !on;
    b.classList.toggle('on', on);
    apply(on);
  }, parent);
  b.classList.toggle('on', on);
  apply(on);
};
let edgesOn = false;
let clayOn = false;
toggle('構面線', false, (on) => {
  edgesOn = on;
  [...edges, ...blender.edges].forEach((e) => (e.visible = on));
}, show);
toggle('素模', false, (on) => {
  clayOn = on;
  [...meshes, ...blender.meshes].forEach((m) => (m.material = on ? clay : mat(m.userData.mat as string)));
}, show);
toggle('骨架', false, setSkeleton, show);
toggle('光源跟著鏡頭', true, (on) => (lightFollowsCamera = on), show);
toggle('自動旋轉', false, (on) => (controls.autoRotate = on), show);

const anim = group('動作');
const modeButtons: HTMLButtonElement[] = [];
for (const [label, m] of [['待機', 'idle'], ['走路', 'walk'], ['靜止', 'still'], ['T 字（對照設定稿）', 'tpose']] as const) {
  const b = button(label, () => {
    mode = m;
    modeButtons.forEach((x) => x.classList.toggle('on', x === b));
  }, anim);
  b.classList.toggle('on', m === mode);
  modeButtons.push(b);
}
const cmp = group('比較');
const cmpButtons: HTMLButtonElement[] = [];
for (const [label, c] of [['程式版', 'code'], ['Blender 版', 'blender'], ['並排', 'both']] as const) {
  const b = button(label, () => {
    compare = c;
    cmpButtons.forEach((x) => x.classList.toggle('on', x === b));
    applyCompare();
  }, cmp);
  b.classList.toggle('on', c === compare);
  cmpButtons.push(b);
}
button('重新載入 .glb', () => loadBlender(), cmp);

function updateInfo(): void {
  info.textContent = `程式版：構面 ≈ ${planeCount}（含背面與內側）· 三角形 ${triCount} · joint ${JOINTS.length}　｜　Blender 版：${blender.status}`;
}
updateInfo();

// ── 迴圈 ──
const resize = () => {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (tween) {
    tween.t = Math.min(1, tween.t + dt * 2.2);
    const e = 1 - Math.pow(1 - tween.t, 3);
    camera.position.lerpVectors(tween.from, tween.to, e);
    controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  animate(clock.elapsedTime);
  driveBlender();

  const dir = lightFollowsCamera ? tmp.copy(KEY_DIR_CAM).applyQuaternion(camera.quaternion) : tmp.copy(fixedKeyDir);
  key.target.position.copy(controls.target);
  key.position.copy(controls.target).addScaledVector(dir, 6);
  rim.target.position.copy(controls.target);
  rim.position.copy(controls.target).addScaledVector(RIM_DIR_CAM.clone().applyQuaternion(camera.quaternion), 6);
  renderer.render(scene, camera);
});
