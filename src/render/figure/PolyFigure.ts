import { Graphics } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';
import { lerpPose, samplePoses, solveJoints, type AttackVariant, type FigureModel, type Joint, type JointFrames, type Pose } from './FigureModel';
import { apply, dot, faceNormal, jointRotation, normalize, rotY, type M3, type Mesh, type V3 } from './Poly3D';

/** 模型單位 → 畫面像素（45° 等角：地面 2:1，垂直略為縮短） */
const SCALE = 0.95;
/** 從畫面看向角色的方向（相機在 +X +Z 上方） */
const VIEW: V3 = normalize([1, 0.82, 1]);
/** 光線：畫面左上方偏前 */
const LIGHT: V3 = normalize([0.15, 1.2, 1.1]);
const AMBIENT = 0.5;
const DIFFUSE = 0.62;
/** 動作的揮下與收回時間（秒） */
const STRIKE_TIME = 0.14;
const RECOVER_TIME = 0.22;
const HIT_TIME = 0.28;
/** 多段攻擊：命中後「命中 → 收勢」的時間（秒） */
const CHAIN_STRIKE_TIME = 0.24;
/** 分段受傷反應、死亡過程的長度（秒） */
const HIT_KEYS_TIME = 0.42;
const DEATH_TIME = 1.25;
/** 移動速度（格 / 秒）低於此值時用走路動畫（模型有 walk 時） */
const WALK_BELOW = 2.6;
/** 細節層級：每個模型單位在畫面上的像素數 */
const LOD_MEDIUM = 0.7;
const LOD_HIGH = 1.6;
/** 暖色輪廓光 */
const RIM_COLOR = [255, 168, 110] as const;
/** 八個方向 */
const DIRECTION_STEP = Math.PI / 4;

export type ActionKind = 'attack' | 'cast';

/** 手上的武器（取代模型原本的武器）：掛在哪個關節、網格、尖端與光芒的軸線（關節座標） */
export interface WeaponMount {
  joint: Joint;
  meshes: Mesh[];
  tip: V3;
  axis: [V3, V3];
  focus?: V3;
}

type ScreenPoint = { x: number; y: number };

export interface FigureState {
  /** 角色面向（World 座標的地面向量） */
  facing: Vec2;
  moving: boolean;
  alive: boolean;
  /** 移動速度（World 格 / 秒；省略時視為跑步） */
  speed?: number;
}

interface Action {
  kind: ActionKind;
  elapsed: number;
  windup: number;
  variant?: AttackVariant;
}

/** 除錯疊圖（樣態預覽 ?debug=joints,bones,edges,pivot,facing,anchor） */
export interface FigureDebug {
  joints?: boolean;
  bones?: boolean;
  edges?: boolean;
  pivot?: boolean;
  facing?: boolean;
  anchor?: boolean;
}

/**
 * 多面體角色：依狀態選姿勢（待機 / 跑步 / 攻擊 / 施法 / 受傷 / 倒地），
 * 面向量化成八個方向，每幀投影成 45° 等角並以平面著色畫出（不畫邊線）。
 */
export class PolyFigure {
  /** 所有角色共用的除錯疊圖設定 */
  static debug: FigureDebug = {};
  readonly graphics = new Graphics();
  private time = 0;
  private runPhase = 0;
  private current: Pose;
  private action: Action | null = null;
  private hitTime = 0;
  /** 死亡過程：開始的姿勢與經過時間 */
  private death: { from: Pose; elapsed: number } | null = null;
  /** 次級運動：各關節目前的方向（模型空間） */
  private readonly chain = new Map<Joint, V3>();
  private stepDt = 0;
  /** 武器尖端的畫面座標（相對腳底，px；模型有 weaponTip 時才有） */
  weaponTip: { x: number; y: number } | null = null;
  /** 武器光芒的軸線與聚焦點（相對腳底，px）；front = 武器在身體前面（有 setWeapon 時才有） */
  weaponAxis: { a: ScreenPoint; b: ScreenPoint; mid: ScreenPoint; focus: ScreenPoint | null; front: boolean } | null = null;
  /** undefined = 模型原本的武器；null = 空手 */
  private mount: WeaponMount | null | undefined = undefined;
  /** 腳下影子（相對腳底，px；模型有 dynamicShadow 時才有）：中心與水平半徑 */
  shadow: { x: number; y: number; rx: number } | null = null;

  constructor(
    private readonly model: FigureModel,
    /** 整體縮放（角色半徑 ÷ 模型設計半徑） */
    private readonly scale = 1,
  ) {
    this.current = model.poses.ready(0);
  }

  /** 攻擊 / 施法：windup 秒後命中（前搖），之後揮下、收回；variant 為招式（模型有對應動作時使用） */
  act(kind: ActionKind, windup: number, variant?: AttackVariant): void {
    this.action = { kind, elapsed: 0, windup: Math.max(0.08, windup), ...(variant ? { variant } : {}) };
  }

  /** 換手上的武器（null = 空手） */
  setWeapon(mount: WeaponMount | null): void {
    this.mount = mount;
  }

  hit(): void {
    this.hitTime = this.model.poses.hitKeys ? HIT_KEYS_TIME : HIT_TIME;
  }

  /** 直接畫出某個姿勢（樣態預覽用；次級運動直接用目標方向） */
  showPose(pose: Pose, facing: Vec2): void {
    this.current = pose;
    this.chain.clear();
    this.stepDt = 0;
    this.draw(yawFor(facing), facing);
  }

  update(dt: number, state: FigureState): void {
    this.time += dt;
    this.stepDt = dt;
    const walking = state.moving && !!this.model.poses.walk && (state.speed ?? Infinity) < WALK_BELOW;
    if (state.moving) this.runPhase += dt * (walking ? 7.5 : 11);
    this.hitTime = Math.max(0, this.hitTime - dt);
    const target = this.targetPose(state, dt, walking);
    // 動作（攻擊 / 施法 / 死亡過程）直接用時間軸的姿勢，其他狀態平滑過渡
    const k = this.action || (this.death && this.model.poses.deathKeys) ? 1 : Math.min(1, dt * 14);
    this.current = lerpPose(this.current, target, k);
    this.draw(yawFor(state.facing), state.facing);
  }

  private targetPose(state: FigureState, dt: number, walking: boolean): Pose {
    const poses = this.model.poses;
    if (!state.alive) {
      this.action = null;
      if (!poses.deathKeys) return poses.dead;
      this.death ??= { from: this.current, elapsed: 0 };
      this.death.elapsed += dt;
      return samplePoses([this.death.from, ...poses.deathKeys], this.death.elapsed / DEATH_TIME);
    }
    this.death = null;
    const base = state.moving ? (walking ? poses.walk!(this.runPhase) : poses.run(this.runPhase)) : poses.ready(this.time);
    if (this.action) {
      const a = this.action;
      a.elapsed += dt;
      const chain = a.kind === 'attack' ? ((a.variant && poses.attackVariants?.[a.variant]) ?? poses.attackChain) : undefined;
      if (chain) {
        const strikeFrom = chain.windup[chain.windup.length - 1]!;
        const last = chain.strike[chain.strike.length - 1]!;
        if (a.elapsed < a.windup) return samplePoses([base, ...chain.windup], easeInOut(a.elapsed / a.windup));
        if (a.elapsed < a.windup + CHAIN_STRIKE_TIME) return samplePoses([strikeFrom, ...chain.strike], (a.elapsed - a.windup) / CHAIN_STRIKE_TIME);
        if (a.elapsed < a.windup + CHAIN_STRIKE_TIME + RECOVER_TIME) return lerpPose(last, base, easeInOut((a.elapsed - a.windup - CHAIN_STRIKE_TIME) / RECOVER_TIME));
        this.action = null;
        return base;
      }
      const [windupPose, strikePose] = a.kind === 'attack' ? [poses.attackWindup, poses.attackStrike] : [poses.castWindup, poses.castRelease];
      if (a.elapsed < a.windup) return lerpPose(base, windupPose, easeOut(a.elapsed / a.windup));
      if (a.elapsed < a.windup + STRIKE_TIME) return lerpPose(windupPose, strikePose, easeOut((a.elapsed - a.windup) / STRIKE_TIME));
      if (a.elapsed < a.windup + STRIKE_TIME + RECOVER_TIME) {
        return lerpPose(strikePose, base, (a.elapsed - a.windup - STRIKE_TIME) / RECOVER_TIME);
      }
      this.action = null;
    }
    if (this.hitTime > 0) {
      if (poses.hitKeys) return samplePoses([base, ...poses.hitKeys, base], 1 - this.hitTime / HIT_KEYS_TIME);
      return lerpPose(base, poses.hit, Math.sin((this.hitTime / HIT_TIME) * Math.PI));
    }
    return base;
  }

  /**
   * 次級運動：關節方向以 rate 延遲跟隨目標方向（身體轉動、甩頭時產生慣性），
   * 再換算回相對父關節的角度；clampTo 限制方向不穿過指定關節（馬尾不穿過頭）。
   */
  private readonly lag = (joint: Joint, angles: V3, parentM: M3, world: JointFrames): V3 => {
    const cfg = this.model.secondary?.[joint];
    if (!cfg) return angles;
    const t0 = apply(parentM, apply(jointRotation(angles), [0, -1, 0]));
    const g = cfg.gravity ?? 0;
    const target = g > 0 ? normalize([t0[0] * (1 - g), t0[1] * (1 - g) - g, t0[2] * (1 - g)]) : t0;
    const prev = this.chain.get(joint);
    let d = target;
    if (prev) {
      const k = 1 - Math.exp(-this.stepDt * cfg.rate);
      d = normalize([prev[0] + (target[0] - prev[0]) * k, prev[1] + (target[1] - prev[1]) * k, prev[2] + (target[2] - prev[2]) * k]);
    }
    const clamp = cfg.clampTo ? world.get(cfg.clampTo) : undefined;
    if (clamp && cfg.maxZ !== undefined) {
      const l = apply(transpose(clamp.m), d);
      if (l[2] > cfg.maxZ) {
        const xy = Math.hypot(l[0], l[1]) || 1;
        const r = Math.sqrt(Math.max(0, 1 - cfg.maxZ * cfg.maxZ)) / xy;
        d = apply(clamp.m, [l[0] * r, l[1] * r, cfg.maxZ]);
      }
    }
    this.chain.set(joint, d);
    // 方向 → 相對父關節的角度（保留原本的扭轉 y）
    const l = apply(rotY(-angles[1]), apply(transpose(parentM), d));
    return [Math.atan2(-l[2], -l[1]), angles[1], Math.asin(Math.max(-1, Math.min(1, l[0])))];
  };

  /** 組出每個關節的位置與旋轉，投影、背面剔除、由遠到近畫出每個面 */
  private draw(yaw: number, facing?: Vec2): void {
    const faces: { depth: number; color: number; points: number[] }[] = [];
    const k = SCALE * this.scale;
    const toScreen = (v: V3) => [(v[0] - v[2]) * 0.707 * k, ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * k] as const;
    const world = solveJoints(this.model.parts, this.model.hipHeight, this.current, yaw, this.model.secondary ? this.lag : undefined);
    // 細節層級：依角色在畫面上的大小，省略小細節
    const t = this.graphics.worldTransform;
    const px = k * (Math.hypot(t.a, t.b) || 1);
    const lod = px < LOD_MEDIUM ? 0 : px < LOD_HIGH ? 1 : 2;
    const rim = this.model.rimLight ?? 0;
    const weaponJoint = this.model.weaponJoint ?? 'handR';
    const mount = this.mount;
    const tipJoint = mount ? mount.joint : weaponJoint;
    const tipLocal = mount === undefined ? this.model.weaponTip : mount?.tip;
    this.weaponTip = null;
    this.weaponAxis = null;
    for (const part of this.model.parts) {
      const { m, p } = world.get(part.joint)!;
      const at = (v: V3): V3 => {
        const o = apply(m, v);
        return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
      };
      const screen = (v: V3): ScreenPoint => {
        const [x, y] = toScreen(at(v));
        return { x, y };
      };
      if (part.joint === tipJoint && tipLocal) this.weaponTip = screen(tipLocal);
      let meshes = part.meshes;
      if (mount !== undefined && (part.joint === weaponJoint || part.joint === mount?.joint)) meshes = mount?.joint === part.joint ? mount.meshes : [];
      if (mount && part.joint === mount.joint) {
        const [a, b] = mount.axis;
        const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const chest = world.get('chest')?.p ?? world.get('root')!.p;
        this.weaponAxis = { a: screen(a), b: screen(b), mid: screen(mid), focus: mount.focus ? screen(mount.focus) : null, front: dot(at(mid), VIEW) > dot(chest, VIEW) };
      }
      for (const mesh of meshes) {
        if ((mesh.lod ?? 0) > lod) continue;
        const verts = mesh.verts.map((v) => {
          const r = apply(m, v);
          return [p[0] + r[0], p[1] + r[1], p[2] + r[2]] as V3;
        });
        for (const face of mesh.faces) {
          const n = normalize(faceNormal(verts, face.idx));
          const facingView = dot(n, VIEW);
          if (facingView <= 0) continue;
          let depth = 0;
          const points: number[] = [];
          for (const i of face.idx) {
            const v = verts[i]!;
            depth += dot(v, VIEW);
            points.push(...toScreen(v));
          }
          const lit = Math.max(0, dot(n, LIGHT));
          let color = shade(face.color, AMBIENT + DIFFUSE * lit);
          // 輪廓光：接近輪廓（幾乎側對鏡頭）且背光的面，加一點暖色
          if (rim > 0) color = addRim(color, rim * Math.max(0, 1 - facingView * 2.2) * (1 - lit));
          faces.push({ depth: depth / face.idx.length, color, points });
        }
      }
    }
    if (this.model.dynamicShadow) this.shadow = footprint([world.get('footL')?.p, world.get('footR')?.p, world.get('head')?.p], world.get('root')!.p, toScreen, k);
    faces.sort((a, b) => a.depth - b.depth);
    const g = this.graphics.clear();
    for (const f of faces) g.poly(f.points).fill({ color: f.color });
    const dbg = PolyFigure.debug;
    if (dbg.edges) for (const f of faces) g.poly(f.points).stroke({ color: 0xffffff, width: 0.35, alpha: 0.45 });
    if (dbg.joints || dbg.bones || dbg.pivot || dbg.facing || dbg.anchor) this.drawDebug(g, world, toScreen, yaw, facing, weaponJoint);
  }

  /** 除錯疊圖：紅色關節、綠色骨頭、黃色武器握點、洋紅色面向、青色腳底錨點 */
  private drawDebug(g: Graphics, world: JointFrames, toScreen: (v: V3) => readonly [number, number], yaw: number, facing: Vec2 | undefined, weaponJoint: Joint): void {
    const dbg = PolyFigure.debug;
    for (const part of this.model.parts) {
      const [x, y] = toScreen(world.get(part.joint)!.p);
      if (dbg.bones && part.parent !== null) {
        const [px, py] = toScreen(world.get(part.parent)!.p);
        g.moveTo(px, py).lineTo(x, y).stroke({ color: 0x40ff60, width: 0.8 });
      }
      if (dbg.joints) g.circle(x, y, 1.1).fill({ color: 0xff3030 });
    }
    if (dbg.pivot && world.has(weaponJoint)) {
      const [x, y] = toScreen(world.get(weaponJoint)!.p);
      g.circle(x, y, 2).stroke({ color: 0xffe040, width: 0.8 });
    }
    if (dbg.facing) {
      const [x, y] = toScreen([Math.sin(yaw) * 16, 0, Math.cos(yaw) * 16]);
      g.moveTo(0, 0).lineTo(x, y).stroke({ color: 0xff40ff, width: 0.8 });
      if (facing) g.circle(x, y, 1.2).fill({ color: 0xff40ff });
    }
    if (dbg.anchor) {
      g.moveTo(-4, 0).lineTo(4, 0).moveTo(0, -2).lineTo(0, 2).stroke({ color: 0x40e0ff, width: 0.8 });
      if (this.shadow) g.ellipse(this.shadow.x, this.shadow.y, this.shadow.rx, this.shadow.rx / 2).stroke({ color: 0x40e0ff, width: 0.5, alpha: 0.7 });
    }
  }
}

/** 影子：以腳、頭與骨盆在地面上的投影為中心，寬度隨兩腳距離（或倒地時的身長）變化 */
function footprint(points: (V3 | undefined)[], root: V3, toScreen: (v: V3) => readonly [number, number], k: number): { x: number; y: number; rx: number } {
  const ground = (v: V3): V3 => [v[0], 0, v[2]];
  const hip = toScreen(ground(root));
  const pts = points.filter((v): v is V3 => !!v).map((v) => toScreen(ground(v)));
  if (pts.length === 0) return { x: hip[0], y: hip[1], rx: 10 * k };
  const xs = [...pts.map((q) => q[0]), hip[0]];
  const ys = [...pts.map((q) => q[1]), hip[1]];
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const spread = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * 2);
  return { x: cx, y: cy, rx: 9 * k + spread * 0.5 };
}

/** 面向 → 模型的轉身角度，量化成八個方向 */
export function yawFor(facing: Vec2): number {
  const yaw = Math.atan2(facing.x, facing.y);
  return Math.round(yaw / DIRECTION_STEP) * DIRECTION_STEP;
}

function transpose(m: M3): M3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function addRim(color: number, k: number): number {
  if (k <= 0) return color;
  const c = (shift: number, add: number) => Math.min(255, ((color >> shift) & 0xff) + Math.round(add * k));
  return (c(16, RIM_COLOR[0]) << 16) | (c(8, RIM_COLOR[1]) << 8) | c(0, RIM_COLOR[2]);
}

function shade(color: number, k: number): number {
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));

