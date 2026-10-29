import * as THREE from 'three';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { V3 } from '../figure/Poly3D';
import type { TriangleSink } from '../figure/PolyFigure';
import type { WallCell } from '../views/TileMapView';
import { THREE_LIGHTING as L } from './ThreeLighting';

/**
 * Three.js 畫法（試驗，開發版按 G 切換；正式版網址加 ?three）：
 * 角色與牆改由 Three.js 在 GPU 上畫（即時光源、投射陰影、深度緩衝），地板、特效、文字仍由 Pixi 畫。
 * 與 Pixi 共用同一個 WebGL：Pixi 先畫地板 → Three.js 畫角色與牆 → Pixi 再畫其他東西（Renderer.present）。
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

/** 一個角色的 Three.js 模型：PolyFigure 每幀交出三角形（TriangleSink），這裡寫進 GPU 的頂點緩衝 */
export class ThreeFigure implements TriangleSink {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = figureMaterial();
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);
  private count = 0;

  constructor(private readonly projection: IsoProjection) {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 畫面外的角色由 ActorView 隱藏；頂點每幀改變，不算包圍球
    mesh.frustumCulled = false;
    this.group.scale.copy(FIGURE_SCALE);
    this.group.add(mesh);
    this.grow(2048);
  }

  begin(): void {
    this.count = 0;
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
  private readonly key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
  /** 只畫影子的地面（地板本身由 Pixi 畫） */
  private readonly shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: L.shadowOpacity }));
  private readonly torches: THREE.PointLight[] = [];
  private lightSpots: { position: Vec2; color: number }[] = [];
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
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(L.key.shadowMap, L.key.shadowMap);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
    rim.position.set(...L.rim.direction);
    this.scene.add(rim);
    for (let i = 0; i < L.torch.count; i++) {
      const torch = new THREE.PointLight(0xff9a3a, 0, L.torch.range, 2);
      this.torches.push(torch);
      this.scene.add(torch);
    }
    this.shadowGround.rotation.x = -Math.PI / 2;
    this.shadowGround.receiveShadow = true;
    this.scene.add(this.shadowGround);
  }

  createFigure(): ThreeFigure {
    const figure = new ThreeFigure(this.projection);
    this.scene.add(figure.group);
    return figure;
  }

  /** 換樓層：重建牆（每 CHUNK 格合成一個物件，與 TileMapView 相同的分組）與光源位置 */
  setMap(cells: readonly WallCell[], cell: number, lightSpots: { position: Vec2; color: number }[]): void {
    for (const wall of this.walls) {
      wall.mesh.removeFromParent();
      wall.mesh.geometry.dispose();
      wall.material.dispose();
    }
    this.walls.length = 0;
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
      const quad = (a: V3, b: V3, c: V3, d: V3, color: number) => {
        const rgb = colorOf(color);
        for (const v of [a, b, c, a, c, d]) {
          pos.push(...v);
          col.push(rgb.r, rgb.g, rgb.b);
        }
      };
      let sx = 0;
      let sy = 0;
      for (const w of list) {
        const [x0, x1, z0, z1] = [w.x * cell, (w.x + 1) * cell, w.y * cell, (w.y + 1) * cell];
        const h = w.height / PX_PER_HEIGHT;
        quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], w.top);
        // 看得到的兩面（朝 +Z = Pixi 的左面、朝 +X = 右面）；背面只用來擋光、投影子
        quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], w.left);
        quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], w.right);
        quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], w.right);
        quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], w.left);
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
      this.scene.add(mesh);
      const cx = sx / list.length;
      const cy = sy / list.length;
      this.walls.push({ mesh, material, screen: this.projection.toScreen(vec2((cx + 0.5) * cell, (cy + 0.5) * cell)), depth: (cx + cy + 1) * cell });
    }
  }

  /**
   * 畫一幀（接在 Pixi 畫完地板之後，不清除畫面）。
   * center：畫面正中央的 World 座標；width / height：畫面大小（CSS px）；player：玩家位置（牆的半透明、火把）。
   */
  render(center: Vec2, width: number, height: number, player: Vec2, dt: number): void {
    this.time += dt;
    const target = new THREE.Vector3(center.x, 0, center.y);
    const cam = this.camera;
    Object.assign(cam, { left: -width / 2 / PX_PER_UNIT, right: width / 2 / PX_PER_UNIT, top: height / 2 / PX_PER_UNIT, bottom: -height / 2 / PX_PER_UNIT, near: 0.1, far: 400 });
    cam.position.copy(target).addScaledVector(VIEW_DIR, 100);
    cam.lookAt(target);
    cam.updateProjectionMatrix();

    // 主光的陰影範圍跟著鏡頭
    const extent = Math.max(width, height) / PX_PER_UNIT / 2 + 2;
    this.key.position.copy(target).addScaledVector(KEY_DIR, 40);
    this.key.target.position.copy(target);
    Object.assign(this.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: 100 });
    this.key.shadow.camera.updateProjectionMatrix();
    this.shadowGround.position.set(center.x, 0, center.y);

    this.updateWalls(player);
    this.updateTorches(player);

    const gl = this.renderer.getContext();
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, cam);
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

  /** 離玩家最近的幾支火把亮起（閃爍） */
  private updateTorches(player: Vec2): void {
    const near = this.lightSpots
      .map((spot) => ({ spot, d: Math.hypot(spot.position.x - player.x, spot.position.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, L.torch.count);
    this.torches.forEach((torch, i) => {
      const n = near[i];
      if (!n || n.d > L.torch.reach) {
        torch.intensity = 0;
        return;
      }
      torch.color.copy(colorOf(n.spot.color));
      torch.position.set(n.spot.position.x, L.torch.height, n.spot.position.y);
      const t = this.time + i * 1.7;
      torch.intensity = L.torch.intensity * (0.85 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31));
    });
  }
}
