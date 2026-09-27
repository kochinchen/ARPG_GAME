import { Graphics } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';
import { lerpPose, type FigureModel, type Joint, type Pose } from './FigureModel';
import { apply, dot, faceNormal, jointRotation, mul, normalize, rotY, type M3, type V3 } from './Poly3D';

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
/** 八個方向 */
const DIRECTION_STEP = Math.PI / 4;

export type ActionKind = 'attack' | 'cast';

export interface FigureState {
  /** 角色面向（World 座標的地面向量） */
  facing: Vec2;
  moving: boolean;
  alive: boolean;
}

interface Action {
  kind: ActionKind;
  elapsed: number;
  windup: number;
}

/**
 * 多面體角色：依狀態選姿勢（待機 / 跑步 / 攻擊 / 施法 / 受傷 / 倒地），
 * 面向量化成八個方向，每幀投影成 45° 等角並以平面著色畫出（不畫邊線）。
 */
export class PolyFigure {
  readonly graphics = new Graphics();
  private time = 0;
  private runPhase = 0;
  private current: Pose;
  private action: Action | null = null;
  private hitTime = 0;
  /** 武器尖端的畫面座標（相對腳底，px；模型有 weaponTip 時才有） */
  weaponTip: { x: number; y: number } | null = null;

  constructor(
    private readonly model: FigureModel,
    /** 整體縮放（角色半徑 ÷ 模型設計半徑） */
    private readonly scale = 1,
  ) {
    this.current = model.poses.ready(0);
  }

  /** 攻擊 / 施法：windup 秒後命中（前搖），之後揮下、收回 */
  act(kind: ActionKind, windup: number): void {
    this.action = { kind, elapsed: 0, windup: Math.max(0.08, windup) };
  }

  hit(): void {
    this.hitTime = HIT_TIME;
  }

  /** 直接畫出某個姿勢（樣態預覽用） */
  showPose(pose: Pose, facing: Vec2): void {
    this.current = pose;
    this.draw(yawFor(facing));
  }

  update(dt: number, state: FigureState): void {
    this.time += dt;
    if (state.moving) this.runPhase += dt * 11;
    this.hitTime = Math.max(0, this.hitTime - dt);
    const target = this.targetPose(state, dt);
    // 動作（攻擊 / 施法）直接用時間軸的姿勢，其他狀態平滑過渡
    const k = this.action ? 1 : Math.min(1, dt * 14);
    this.current = lerpPose(this.current, target, k);
    this.draw(yawFor(state.facing));
  }

  private targetPose(state: FigureState, dt: number): Pose {
    const poses = this.model.poses;
    if (!state.alive) {
      this.action = null;
      return poses.dead;
    }
    const base = state.moving ? poses.run(this.runPhase) : poses.ready(this.time);
    if (this.action) {
      const a = this.action;
      a.elapsed += dt;
      const [windupPose, strikePose] = a.kind === 'attack' ? [poses.attackWindup, poses.attackStrike] : [poses.castWindup, poses.castRelease];
      if (a.elapsed < a.windup) return lerpPose(base, windupPose, easeOut(a.elapsed / a.windup));
      if (a.elapsed < a.windup + STRIKE_TIME) return lerpPose(windupPose, strikePose, easeOut((a.elapsed - a.windup) / STRIKE_TIME));
      if (a.elapsed < a.windup + STRIKE_TIME + RECOVER_TIME) {
        return lerpPose(strikePose, base, (a.elapsed - a.windup - STRIKE_TIME) / RECOVER_TIME);
      }
      this.action = null;
    }
    if (this.hitTime > 0) return lerpPose(base, poses.hit, Math.sin((this.hitTime / HIT_TIME) * Math.PI));
    return base;
  }

  /** 組出每個關節的位置與旋轉，投影、背面剔除、由遠到近畫出每個面 */
  private draw(yaw: number): void {
    const world = new Map<Joint, { m: M3; p: V3 }>();
    const faces: { depth: number; color: number; points: number[] }[] = [];
    const pose = this.current;
    for (const part of this.model.parts) {
      const local = jointRotation(pose.angles[part.joint] ?? [0, 0, 0]);
      let m: M3;
      let p: V3;
      if (part.parent === null) {
        m = mul(rotY(yaw), local);
        p = [0, this.model.hipHeight + pose.rootY, 0];
      } else {
        const parent = world.get(part.parent)!;
        const o = apply(parent.m, part.offset);
        m = mul(parent.m, local);
        p = [parent.p[0] + o[0], parent.p[1] + o[1], parent.p[2] + o[2]];
      }
      world.set(part.joint, { m, p });
      if (part.joint === 'handR' && this.model.weaponTip) {
        const o = apply(m, this.model.weaponTip);
        const v: V3 = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
        const k = SCALE * this.scale;
        this.weaponTip = { x: (v[0] - v[2]) * 0.707 * k, y: ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * k };
      }
      for (const mesh of part.meshes) {
        const verts = mesh.verts.map((v) => {
          const r = apply(m, v);
          return [p[0] + r[0], p[1] + r[1], p[2] + r[2]] as V3;
        });
        for (const face of mesh.faces) {
          const n = normalize(faceNormal(verts, face.idx));
          if (dot(n, VIEW) <= 0) continue;
          let depth = 0;
          const points: number[] = [];
          for (const i of face.idx) {
            const v = verts[i]!;
            depth += dot(v, VIEW);
            const k = SCALE * this.scale;
            points.push((v[0] - v[2]) * 0.707 * k, ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * k);
          }
          const light = AMBIENT + DIFFUSE * Math.max(0, dot(n, LIGHT));
          faces.push({ depth: depth / face.idx.length, color: shade(face.color, light), points });
        }
      }
    }
    faces.sort((a, b) => a.depth - b.depth);
    const g = this.graphics.clear();
    for (const f of faces) g.poly(f.points).fill({ color: f.color });
  }
}

/** 面向 → 模型的轉身角度，量化成八個方向 */
export function yawFor(facing: Vec2): number {
  const yaw = Math.atan2(facing.x, facing.y);
  return Math.round(yaw / DIRECTION_STEP) * DIRECTION_STEP;
}

function shade(color: number, k: number): number {
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

