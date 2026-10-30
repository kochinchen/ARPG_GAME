import * as THREE from 'three';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { V3 } from '../figure/Poly3D';
import type { SkinGeometry, TriangleSink } from '../figure/PolyFigure';
import type { WallCell } from '../views/TileMapView';
import { THREE_LIGHTING as L } from './ThreeLighting';
import { wallStones, type WallLook } from './WallStones';
import type { FxGlow } from '../views/EffectLayer';
import { ThreeFx } from './ThreeFx';
import { ThreeSkillFx } from './ThreeSkillFx';
import type { FxFlying } from '../views/EffectLayer';

/**
 * Three.js 畫法（試驗，開發版按 G 切換；正式版網址加 ?three）：
 * 地板、角色與牆改由 Three.js 在 GPU 上畫（即時光源、投射陰影、深度緩衝），特效、文字仍由 Pixi 畫。
 * 主角身上的燭光是真的點光源（亮區以外只剩微弱的環境光與火把）。
 * 與 Pixi 共用同一個 WebGL：Three.js 畫地板 → Pixi 疊上地上標記 → Three.js 畫角色與牆 → Pixi 再畫其他東西（Renderer.present）。
 *
 * 座標：Three.js 的 (X, Y, Z) = (World x, 高度, World y)。正交鏡頭從 (1, √(2/3), 1) 方向看，
 * 地面投影與 IsoProjection（2:1）完全重合，Pixi 與 Three.js 畫的東西在畫面上對得起來。
 */
/** 鏡頭的縮放：每單位幾 px（畫面左右方向 = 32√2，地面才是 64 × 32 的格子） */
const PX_PER_UNIT = 32 * Math.SQRT2;
/** 高度：每單位在畫面上幾 px（正等角投影的仰角） */
const PX_PER_HEIGHT = 16 * Math.sqrt(6);
/** PolyFigure 的模型（像素單位）→ Three.js：地面方向 0.707 px / 單位、高度 0.94 px / 單位 */
const FIGURE_SCALE = new THREE.Vector3(1 / PX_PER_UNIT, 0.94 / PX_PER_HEIGHT, 1 / PX_PER_UNIT);
const VIEW_DIR = new THREE.Vector3(1, Math.sqrt(2 / 3), 1).normalize();
const KEY_DIR = new THREE.Vector3(...L.key.direction).normalize();
/** 牆：擋住玩家的改為半透明（與 TileMapView 相同的判定） */
const FADE_ALPHA = 0.35;
const OCCLUDE_HALF_WIDTH = 72;
const OCCLUDE_BELOW = 72;
const CHUNK = 8;
/** 地板：每 FLOOR_CHUNK × FLOOR_CHUNK 格合成一個物件（畫面外的整塊略過） */
const FLOOR_CHUNK = 16;
/**
 * 地圖分區（World 單位）：牆與地板依位置放進分區，離鏡頭太遠的整區直接隱藏。
 * 一層樓有幾千塊牆，每次畫（畫面三次、每個投影子的光源六個方向）都要逐一檢查；整區跳過才省得下來。
 */
const REGION = 16;
/** 分區在鏡頭範圍外多遠以內仍要畫：分區本身的大小 + 牆高與影子 */
const REGION_MARGIN = REGION + 3;
/** 地板放在另一個圖層：先畫地板，Pixi 疊上地上標記，再畫牆與角色 */
const FLOOR_LAYER = 1;

const linear = new Map<number, THREE.Color>();
/** sRGB 色碼 → Three.js 的線性顏色（快取） */
function colorOf(hex: number): THREE.Color {
  let c = linear.get(hex);
  if (!c) linear.set(hex, (c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace)));
  return c;
}

function figureMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: L.roughness, metalness: 0, side: THREE.DoubleSide });
}

/**
 * GPU 蒙皮（骨架動畫交給顯示卡）：哪些角色使用。主角與所有怪物都已用 /skin-compare.html 確認
 * 與 CPU 計算的畫面相同（差異不超過浮點捨入；倒地貼著地板的面會有少量 z-fighting，CPU 做法也一樣）。
 */
export const GPU_SKINNING = { player: true, others: true };

/**
 * 一個角色的 Three.js 模型。兩種做法：
 * - CPU：PolyFigure 每幀交出三角形（TriangleSink），這裡寫進 GPU 的頂點緩衝。
 * - GPU 蒙皮（gpu = true）：外觀改變時才收到靜止網格（skin），之後每幀只更新骨頭矩陣，頂點由顯示卡計算。
 */
export class ThreeFigure implements TriangleSink {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = figureMaterial();
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);
  private count = 0;
  /** GPU 蒙皮：模型、骨頭（不放進場景，直接寫入 matrixWorld）、目前網格的外觀 key */
  private skinned: THREE.SkinnedMesh | null = null;
  private bones: THREE.Bone[] = [];
  private skinKey: readonly unknown[] | null = null;
  skin?: (key: readonly unknown[], build: () => SkinGeometry, bones: Float32Array) => void;

  constructor(
    private readonly projection: IsoProjection,
    gpu = false,
  ) {
    this.group.scale.copy(FIGURE_SCALE);
    if (gpu) {
      this.skin = (key, build, bones) => this.updateSkin(key, build, bones);
      return;
    }
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 畫面外的角色由 ActorView 隱藏；頂點每幀改變，不算包圍球
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.grow(2048);
  }

  begin(): void {
    this.count = 0;
  }

  private updateSkin(key: readonly unknown[], build: () => SkinGeometry, matrices: Float32Array): void {
    const count = matrices.length / 16;
    if (!this.skinned || this.bones.length !== count) {
      this.skinned?.removeFromParent();
      this.skinned?.geometry.dispose();
      this.skinned?.skeleton.dispose();
      this.bones = Array.from({ length: count }, () => new THREE.Bone());
      const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), this.material);
      // 骨頭矩陣已經是模型空間（含畫面縮放），不需要綁定姿勢
      mesh.bindMode = THREE.DetachedBindMode;
      mesh.bind(new THREE.Skeleton(this.bones), new THREE.Matrix4());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.skinned = mesh;
      this.skinKey = null;
    }
    if (!this.skinKey || key.length !== this.skinKey.length || key.some((k, i) => k !== this.skinKey![i])) {
      this.skinKey = [...key];
      const g = build();
      const n = g.colors.length;
      const rgb = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const c = colorOf(g.colors[i]!);
        rgb[i * 3] = c.r;
        rgb[i * 3 + 1] = c.g;
        rgb[i * 3 + 2] = c.b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(g.joints, 4));
      geometry.setAttribute('skinWeight', new THREE.BufferAttribute(g.weights, 4));
      this.skinned.geometry.dispose();
      this.skinned.geometry = geometry;
    }
    this.bones.forEach((bone, i) => bone.matrixWorld.fromArray(matrices, i * 16));
  }

  triangle(a: V3, b: V3, c: V3, color: number): void {
    if (this.count * 9 + 9 > this.positions.length) this.grow(this.count * 2);
    const rgb = colorOf(color);
    let o = this.count * 9;
    for (const v of [a, b, c]) {
      this.positions[o] = v[0];
      this.positions[o + 1] = v[1];
      this.positions[o + 2] = v[2];
      this.colors[o] = rgb.r;
      this.colors[o + 1] = rgb.g;
      this.colors[o + 2] = rgb.b;
      o += 3;
    }
    this.count++;
  }

  end(): void {
    if (this.skin) return;
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
    this.geometry.setDrawRange(0, this.count * 3);
  }

  /**
   * 放到腳底的位置。offset：前衝的畫面位移（px）；lift：浮空高度（px）；
   * tint：狀態顏色（冰凍、燃燒…）；alpha：倒地、滑鼠移上時的透明度。
   */
  place(position: Vec2, offset: Vec2, lift: number, tint: number, alpha: number, visible: boolean): void {
    this.group.visible = visible;
    if (!visible) return;
    const d = this.projection.toWorld(offset);
    this.group.position.set(position.x + d.x, lift / PX_PER_HEIGHT, position.y + d.y);
    this.material.color.copy(colorOf(tint));
    const transparent = alpha < 0.999;
    if (transparent !== this.material.transparent) {
      this.material.transparent = transparent;
      this.material.needsUpdate = true;
    }
    this.material.opacity = alpha;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.skinned?.geometry.dispose();
    this.skinned?.skeleton.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private grow(triangles: number): void {
    const positions = new Float32Array(triangles * 9);
    const colors = new Float32Array(triangles * 9);
    positions.set(this.positions.subarray(0, this.count * 9));
    colors.set(this.colors.subarray(0, this.count * 9));
    this.positions = positions;
    this.colors = colors;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
}

interface WallChunk {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** 中心的畫面座標（未加鏡頭位移）與深度 */
  screen: Vec2;
  depth: number;
}

/** Three.js 場景：鏡頭、光源、牆與所有角色 */
export class ThreeWorld {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  /** 只算影子用的鏡頭：在地板底下遠處、範圍極小，看不到任何物件（圖層 0：牆與角色照常投影子） */
  private readonly shadowCamera = new THREE.OrthographicCamera(-0.01, 0.01, 0.01, -0.01, 0.1, 0.2);
  private readonly key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
  private readonly torches: THREE.PointLight[] = [];
  /** 發光特效的點光源（火球、爆炸閃光…）與這一幀的特效 */
  private readonly fxLights: THREE.PointLight[] = [];
  private glows: readonly FxGlow[] = [];
  /** 技能特效的光暈、火花、地上的光環（ThreeFx） */
  private readonly fx = new ThreeFx(PX_PER_HEIGHT);
  /** 各招的專屬特效（EffectLayer.listener）：立體的岩塊、冰柱、隕石、刀光、雷柱、火焰… */
  readonly skillFx = new ThreeSkillFx(PX_PER_HEIGHT);
  private flying: readonly FxFlying[] = [];
  /** 燭光的補光（照亮主角正面，不投影子） */
  private readonly fill = new THREE.PointLight(L.fill.color, L.fill.intensity, L.fill.distance, L.fill.decay);
  /** 主角身上的燭光（真的光源：由內向外漸暗、投射影子） */
  private readonly candle = new THREE.PointLight(L.candle.color, L.candle.intensity, 0, L.candle.decay);
  private readonly floors: THREE.Mesh[] = [];
  /** 地圖分區（見 REGION）：中心的 World 座標 */
  private readonly regions = new Map<string, { group: THREE.Group; x: number; z: number }>();
  private readonly floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  private lightSpots: { position: Vec2; color: number; height: number }[] = [];
  private readonly walls: WallChunk[] = [];
  private time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    private readonly projection: IsoProjection,
  ) {
    // Pixi 會開著上傳貼圖時的翻轉 / 預乘設定，Three.js 建立 3D 貼圖時不允許
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
    context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.renderer = new THREE.WebGLRenderer({ canvas, context });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // 不做色調壓縮：與 Pixi 畫的地板、特效同一種顏色，受光面接近模型原色

    // 光源的數值在 ThreeLighting.ts
    this.scene.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity), new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity));
    this.key.castShadow = L.key.shadow;
    this.key.shadow.mapSize.set(L.key.shadowMap, L.key.shadowMap);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
    rim.position.set(...L.rim.direction);
    this.scene.add(rim);
    // 點光源的影子（六個方向的陰影圖）：照射距離以外的牆與角色不必畫
    const shadowed = (light: THREE.PointLight, on: boolean, size: number, strength = 1) => {
      light.castShadow = on;
      light.shadow.intensity = strength;
      light.shadow.mapSize.set(size, size);
      light.shadow.bias = -0.002;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = light.distance;
    };
    for (let i = 0; i < L.torch.count; i++) {
      const torch = new THREE.PointLight(0xff9a3a, 0, L.torch.range, 2);
      shadowed(torch, L.torch.shadow, L.torch.shadowMap, L.torch.shadowStrength);
      this.torches.push(torch);
      this.scene.add(torch);
    }
    for (let i = 0; i < L.fx.count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, L.fx.range, L.fx.decay);
      shadowed(light, L.fx.shadow, L.fx.shadowMap, L.fx.shadowStrength);
      this.fxLights.push(light);
      this.scene.add(light);
    }
    this.scene.add(this.fill, this.fx.group, this.skillFx.group);
    this.candle.castShadow = L.candle.shadow;
    this.candle.shadow.mapSize.set(L.candle.shadowMap, L.candle.shadowMap);
    this.candle.shadow.bias = -0.002;
    this.candle.shadow.camera.near = 0.2;
    this.scene.add(this.candle);
    // 光源兩個圖層都要照到（地板在 FLOOR_LAYER）
    this.scene.traverse((o) => {
      if (o instanceof THREE.Light) o.layers.enableAll();
    });
    // 影子在畫地板時算一次，畫牆與角色時沿用
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowCamera.position.set(0, -1000, 0);
    this.shadowCamera.lookAt(0, -2000, 0);
  }

  /** gpu：用 GPU 蒙皮（見 GPU_SKINNING） */
  createFigure(gpu = false): ThreeFigure {
    const figure = new ThreeFigure(this.projection, gpu);
    this.scene.add(figure.group);
    return figure;
  }

  /** 換樓層：重建牆（每 CHUNK 格合成一個物件，與 TileMapView 相同的分組；石塊樣式依區域）與光源位置 */
  setMap(cells: readonly WallCell[], cell: number, lightSpots: { position: Vec2; color: number; height: number }[], look: WallLook, floor: readonly number[]): void {
    this.buildFloor(floor, cell);
    // 換樓層：上一層還沒結束的特效（冰柱、火焰）不帶過來
    this.skillFx.clear();
    for (const wall of this.walls) {
      wall.mesh.removeFromParent();
      wall.mesh.geometry.dispose();
      wall.material.dispose();
    }
    this.walls.length = 0;
    // 地板、牆都移除後再清掉分區（buildFloor 已經放進新分區的地板留著）
    for (const [key, region] of this.regions) {
      if (region.group.children.length > 0) continue;
      region.group.removeFromParent();
      this.regions.delete(key);
    }
    this.lightSpots = lightSpots;
    const groups = new Map<string, WallCell[]>();
    for (const c of cells) {
      const key = `${c.x + c.y}:${Math.floor((c.x - c.y + 100000) / CHUNK)}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(c);
    }
    for (const list of groups.values()) {
      const pos: number[] = [];
      const col: number[] = [];
      const push = (a: V3, b: V3, c: V3, color: number) => {
        const rgb = colorOf(color);
        for (const v of [a, b, c]) {
          pos.push(...v);
          col.push(rgb.r, rgb.g, rgb.b);
        }
      };
      let sx = 0;
      let sy = 0;
      for (const w of list) {
        wallStones(w, cell, w.height / PX_PER_HEIGHT, look, push);
        sx += w.x;
        sy += w.y;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geometry.computeBoundingSphere();
      const material = figureMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const cx = sx / list.length;
      const cy = sy / list.length;
      this.region((cx + 0.5) * cell, (cy + 0.5) * cell).add(mesh);
      this.walls.push({ mesh, material, screen: this.projection.toScreen(vec2((cx + 0.5) * cell, (cy + 0.5) * cell)), depth: (cx + cy + 1) * cell });
    }
  }

  /**
   * 畫一幀的第一步：清除畫面、算影子、畫地板（之後 Pixi 疊上地上標記，再 renderObjects 畫牆與角色）。
   * center：畫面正中央的 World 座標；width / height：畫面大小（CSS px）；zoom：鏡頭放大倍率；
   * player：玩家位置（燭光、牆的半透明、火把）；candleRadius：燭光的半徑（World）；background：底色。
   */
  renderFloor(center: Vec2, width: number, height: number, zoom: number, player: Vec2, candleRadius: number, background: number, dt: number): void {
    this.time += dt;
    const target = new THREE.Vector3(center.x, 0, center.y);
    const cam = this.camera;
    const u = PX_PER_UNIT * zoom;
    Object.assign(cam, { left: -width / 2 / u, right: width / 2 / u, top: height / 2 / u, bottom: -height / 2 / u, near: 0.1, far: 400 });
    cam.position.copy(target).addScaledVector(VIEW_DIR, 100);
    cam.lookAt(target);
    cam.updateProjectionMatrix();

    // 主光的陰影範圍跟著鏡頭
    const extent = Math.max(width, height) / u / 2 + 2;
    this.key.position.copy(target).addScaledVector(KEY_DIR, 40);
    this.key.target.position.copy(target);
    Object.assign(this.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: 100 });
    this.key.shadow.camera.updateProjectionMatrix();

    // 燭光：幾乎在主角正上方（往鏡頭偏 tilt 度），影子落在腳下；照到 candleRadius 為止
    const c = L.candle;
    // 鏡頭方向 = World (+x, +z)
    const lean = (c.height * Math.tan((c.tilt * Math.PI) / 180)) / Math.SQRT2;
    this.candle.position.set(player.x + lean, c.height, player.y + lean);
    const f = L.fill;
    this.fill.position.set(player.x + f.toward / Math.SQRT2, f.height, player.y + f.toward / Math.SQRT2);
    this.candle.distance = candleRadius * c.reach;
    this.candle.shadow.camera.far = this.candle.distance;
    const t = this.time;
    this.candle.intensity = c.intensity * (1 + c.flicker * (Math.sin(t * 9) * 0.6 + Math.sin(t * 23) * 0.4));

    // 正等角鏡頭（仰角 30°）：畫面上下方向的地面距離是左右方向的 2 倍
    this.cullRegions(target, width / u / 2, height / u);
    this.updateWalls(player);
    this.updateTorches(player);
    this.updateFxLights(player);
    // 粒子的大小是畫面 px：跟著放大，也換算成 WebGL 畫布的像素（高解析度螢幕）
    const pxScale = zoom * (this.renderer.getContext().drawingBufferWidth / Math.max(1, width));
    this.fx.update(this.glows, dt, pxScale);
    this.skillFx.update(dt, pxScale, this.glows, this.flying);

    const gl = this.renderer.getContext();
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderer.setClearColor(background, 1);
    this.renderer.clear(true, true, true);
    // 影子：Three.js 只讓「目前鏡頭圖層看得到」的物件投影子，畫地板的圖層看不到牆與角色，
    // 所以先用一般圖層算影子（裁切成 0 × 0，畫面上什麼都不畫），之後畫地板、牆與角色都沿用。
    // 這一次用看不到任何東西的鏡頭（shadowCamera）：影子照常算，牆與角色不必準備畫到畫面上
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, 0, 0);
    this.renderer.render(this.scene, this.shadowCamera);
    this.renderer.setScissorTest(false);
    cam.layers.set(FLOOR_LAYER);
    this.renderer.render(this.scene, cam);
  }

  /** 畫一幀的第二步：牆與角色（接在 Pixi 畫完地上標記之後，不清除畫面；地板的深度保留） */
  renderObjects(): void {
    const gl = this.renderer.getContext();
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
  }

  /** 地板：TileMapView 記下的三角形（World x, y 與顏色），每 FLOOR_CHUNK 格一塊 */
  private buildFloor(triangles: readonly number[], cell: number): void {
    for (const mesh of this.floors) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.floors.length = 0;
    const chunks = new Map<string, { pos: number[]; col: number[] }>();
    const size = FLOOR_CHUNK * cell;
    for (let i = 0; i < triangles.length; i += 7) {
      const cx = (triangles[i]! + triangles[i + 2]! + triangles[i + 4]!) / 3;
      const cz = (triangles[i + 1]! + triangles[i + 3]! + triangles[i + 5]!) / 3;
      const key = `${Math.floor(cx / size)}:${Math.floor(cz / size)}`;
      let chunk = chunks.get(key);
      if (!chunk) chunks.set(key, (chunk = { pos: [], col: [] }));
      const rgb = colorOf(triangles[i + 6]!);
      for (let v = 0; v < 3; v++) {
        chunk.pos.push(triangles[i + v * 2]!, 0, triangles[i + v * 2 + 1]!);
        chunk.col.push(rgb.r, rgb.g, rgb.b);
      }
    }
    for (const { pos, col } of chunks.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.floorMaterial);
      mesh.receiveShadow = true;
      mesh.layers.set(FLOOR_LAYER);
      const center = geometry.boundingSphere!.center;
      this.region(center.x, center.z).add(mesh);
      this.floors.push(mesh);
    }
  }

  /** 這個位置所在的地圖分區（沒有就建立） */
  private region(x: number, z: number): THREE.Group {
    const i = Math.floor(x / REGION);
    const j = Math.floor(z / REGION);
    const key = `${i}:${j}`;
    let region = this.regions.get(key);
    if (!region) {
      region = { group: new THREE.Group(), x: (i + 0.5) * REGION, z: (j + 0.5) * REGION };
      this.regions.set(key, region);
      this.scene.add(region.group);
    }
    return region.group;
  }

  /** 只留鏡頭範圍附近的分區（halfWidth / halfDepth：畫面左右、前後看得到的地面半徑，World） */
  private cullRegions(target: THREE.Vector3, halfWidth: number, halfDepth: number): void {
    const reach = Math.hypot(halfWidth, halfDepth) + REGION_MARGIN;
    for (const r of this.regions.values()) r.group.visible = Math.hypot(r.x - target.x, r.z - target.z) < reach;
  }

  private updateWalls(player: Vec2): void {
    const playerDepth = this.projection.depth(player);
    const p = this.projection.toScreen(player);
    for (const wall of this.walls) {
      const dy = wall.screen.y - p.y;
      const occludes = wall.depth > playerDepth && Math.abs(wall.screen.x - p.x) < OCCLUDE_HALF_WIDTH && dy > 0 && dy < OCCLUDE_BELOW;
      const transparent = occludes;
      if (transparent !== wall.material.transparent) {
        wall.material.transparent = transparent;
        wall.material.opacity = occludes ? FADE_ALPHA : 1;
        // 半透明的牆不擋影子，免得玩家整個人被牆影蓋住
        wall.mesh.castShadow = !occludes;
        wall.material.needsUpdate = true;
      }
    }
  }

  /** 這一幀發光的特效（EffectLayer.glows）：離玩家最近的幾個放點光源 */
  setGlows(glows: readonly FxGlow[], flying: readonly FxFlying[] = []): void {
    this.glows = glows;
    this.flying = flying;
  }

  private updateFxLights(player: Vec2): void {
    const near = [...this.glows].sort((a, b) => Math.hypot(a.position.x - player.x, a.position.y - player.y) - Math.hypot(b.position.x - player.x, b.position.y - player.y));
    this.fxLights.forEach((light, i) => {
      const g = near[i];
      light.shadow.autoUpdate = !!g || light.shadow.map === null;
      if (!g) {
        light.intensity = 0;
        return;
      }
      light.color.copy(colorOf(g.color));
      light.position.set(g.position.x, g.height / PX_PER_HEIGHT, g.position.y);
      light.intensity = L.fx.intensity * g.strength;
    });
  }

  /** 離玩家最近的幾支火把亮起（閃爍） */
  private updateTorches(player: Vec2): void {
    const near = this.lightSpots
      .map((spot) => ({ spot, d: Math.hypot(spot.position.x - player.x, spot.position.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, L.torch.count);
    this.torches.forEach((torch, i) => {
      const n = near[i];
      const on = !!n && n.d <= L.torch.reach;
      // 熄掉的火把不算影子（光源數量不變，材質不必重新編譯）；陰影圖至少要先建立一次，否則材質取樣到空的貼圖、整個畫面畫不出來
      torch.shadow.autoUpdate = on || torch.shadow.map === null;
      if (!n || !on) {
        torch.intensity = 0;
        return;
      }
      torch.color.copy(colorOf(n.spot.color));
      torch.position.set(n.spot.position.x, n.spot.height / PX_PER_HEIGHT, n.spot.position.y);
      const t = this.time + i * 1.7;
      torch.intensity = L.torch.intensity * (0.85 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31));
    });
  }
}
