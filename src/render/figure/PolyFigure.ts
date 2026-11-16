import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';
import { IDLE_ROAR_OFFSET, lerpPose, samplePoses, skinVerts, solveJoints, type AttackVariant, type FigureModel, type Joint, type JointFrames, type Pose } from './FigureModel';
import { FacetMesh } from './FacetMesh';
import { apply, dot, faceNormal, jointRotation, normalize, rotY, type M3, type Mesh, type V3 } from './Poly3D';
import { restPose } from './WeaponRest';

/** 模型單位 → 畫面像素（45° 等角：地面 2:1，垂直略為縮短） */
/** 從地下鑽出來：竄出、停住、倒下的秒數；一開始埋在地下多深（站立高度的倍數） */
const EMERGE_RISE = 0.16;
const EMERGE_HOLD = 0.16;
const EMERGE_FALL = 0.4;
const EMERGE_SINK = 1.1;
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

/** 轉了好幾圈的關節換算回 ±π：收勢時不會倒轉回去（鐵輪迴旋、輪子） */
function unwound(pose: Pose): Pose {
  const wrap = (x: number) => (Math.abs(x) > Math.PI ? x - 2 * Math.PI * Math.round(x / (2 * Math.PI)) : x);
  const angles: Pose['angles'] = {};
  for (const [joint, v] of Object.entries(pose.angles)) if (v) angles[joint as Joint] = [wrap(v[0]), wrap(v[1]), wrap(v[2])];
  return { ...pose, angles };
}
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
  /** 不攻擊時（待機、走路、受傷）武器關節額外轉的角度：斧頭橫拿、弓直立在身前；攻擊時漸漸轉回 */
  rest?: V3;
  /** 不攻擊時手臂的角度（取代動作原本的角度）：法杖要手肘彎成直角、前臂往前 */
  restArm?: Partial<Record<Joint, V3>>;
  /** 不攻擊時武器沿 axis（尾 → 頭）直立朝上：依目前的手臂算武器關節的角度 */
  upright?: boolean;
  /**
   * 弓弦（設計者 2026-11-15：拉弓時弦要跟著動）：兩端在弓上（關節座標），粗細與顏色；meshes = 網格裡靜止的弦，不畫。
   * 弦分上下兩段接到中間的搭箭點：平常在兩端的正中間，射箭的前搖中右手拳心拉到弦後面時，搭箭點跟著拳心往後。
   */
  string?: { top: V3; bottom: V3; width: number; colors: readonly number[]; meshes: ReadonlySet<Mesh> };
}

const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 一段弦（a → b）的截面兩軸（長度 = 半寬） */
function rodAxes(a: V3, b: V3, w: number): [V3, V3] {
  const d = normalize(vsub(b, a));
  const e1 = normalize(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));
  const e2 = cross(d, e1);
  return [e1.map((x) => x * w) as V3, e2.map((x) => x * w) as V3];
}
/** 單位弦段（z：0 → 1、截面 ±1）的四面；GPU 蒙皮用骨頭矩陣拉到 a → b */
const ROD_CORNERS: V3[] = [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0], [1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]];
const ROD_FACES: number[][] = [0, 1, 2, 3].map((i) => [i, (i + 1) % 4, 4 + ((i + 1) % 4), 4 + i]);

/**
 * 搭在弦上的箭（設計者 2026-11-16）：箭的座標 x、y 是截面、z 沿箭身（0 = 箭尾搭在弦上 → length = 箭頭尖）。
 * 長度與粗細依弓的大小（拉滿時箭頭剛好露出握把前方一點）；尾羽用弓弦的顏色。
 */
/** 射箭前搖的這個比例時右手到弓把搭箭：之後才顯示箭、開始拉弦 */
const NOCK_AT = 0.4;
type ArrowMesh = { verts: V3[]; faces: { idx: number[]; color: number }[] };
const ARROWS = new WeakMap<object, ArrowMesh>();
function arrowMesh(s: NonNullable<WeaponMount['string']>): ArrowMesh {
  const hit = ARROWS.get(s);
  if (hit) return hit;
  const half = Math.hypot(...vsub(s.bottom, s.top)) / 2;
  const back = Math.hypot((s.top[0] + s.bottom[0]) / 2, (s.top[1] + s.bottom[1]) / 2, (s.top[2] + s.bottom[2]) / 2);
  const L = back + half * 1.25;
  const r = Math.max(s.width * 0.6, half * 0.012);
  const verts: V3[] = [];
  const faces: ArrowMesh['faces'] = [];
  const add = (pts: V3[], list: number[][], color: (i: number) => number, both = false) => {
    const o = verts.length;
    verts.push(...pts);
    list.forEach((f, i) => {
      faces.push({ idx: f.map((v) => v + o), color: color(i) });
      if (both) faces.push({ idx: f.map((v) => v + o).reverse(), color: color(i) });
    });
  };
  // 箭身：四面木桿
  const wood = [0x7a5532, 0x5e3f24];
  add(ROD_CORNERS.map(([x, y, z]) => [x * r, y * r, z * L * 0.86] as V3), ROD_FACES, (i) => wood[i % 2]!);
  // 箭頭：菱形底的鋼尖
  const hr = r * 3.2;
  add([[hr, 0, L * 0.84], [0, hr, L * 0.84], [-hr, 0, L * 0.84], [0, -hr, L * 0.84], [0, 0, L], [0, 0, L * 0.8]], [0, 1, 2, 3].flatMap((i) => [[i, (i + 1) % 4, 4], [(i + 1) % 4, i, 5]]), (i) => (i % 4 < 2 ? 0xd4d8de : 0x8f959e));
  // 尾羽：十字四片
  const h = r * 3.5;
  const fl = [s.colors[0] ?? 0xe8e0d0, s.colors[1] ?? s.colors[0] ?? 0xc8c0b0];
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    add([[0, 0, L * 0.02], [x * h, y * h, L * 0.05], [x * h * 0.8, y * h * 0.8, L * 0.17], [0, 0, L * 0.22]], [[0, 1, 2, 3]], () => fl[x + y > 0 ? 0 : 1]!, true);
  // 箭尾的凹槽（扣在弦上）
  add(ROD_CORNERS.map(([x, y, z]) => [x * r * 1.4, y * r * 1.4, (z - 1) * L * 0.025] as V3), ROD_FACES, () => 0x2c2620);
  const mesh = { verts, faces };
  ARROWS.set(s, mesh);
  return mesh;
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

/**
 * Three.js 畫法（試驗）：draw() 不投影、不畫 Pixi，把這一幀的每個三角形交給 sink。
 * 頂點是乘上畫面縮放後的模型座標（像素單位，腳底為原點）；顏色是未打光的原色，明暗交給 Three.js 的光源。
 */
export type TriangleSink = {
  begin(): void;
  triangle(a: V3, b: V3, c: V3, color: number): void;
  end(): void;
  /**
   * GPU 蒙皮（有這個時改用它，不再逐幀交出三角形）：外觀改變（key 不同）時才呼叫 build 交出靜止網格，
   * 之後每幀只交出關節矩陣（bones），頂點位置由顯示卡計算。
   */
  /**
   * share：同一個模型、沒換裝也沒換武器時，所有分身共用同一份網格（owner + id 相同就是同一份）；
   * 怪物同時很多隻，每隻各建一次網格（CPU 約 3.5 ms、上傳 GPU 更久）會在走進畫面時卡一下
   */
  skin?: (key: readonly unknown[], build: () => SkinGeometry, bones: Float32Array, share?: { owner: object; id: string }) => void;
};

/**
 * GPU 蒙皮的靜止網格（每個三角形 3 個頂點、不共用）：
 * position 是關節的區域座標（零件網格）或模型的靜止座標（蒙皮網格）；每個頂點最多 4 根骨頭（joints / weights）。
 * 骨頭 i（i < 零件數）= 第 i 個零件的關節；骨頭 零件數 + i = 同一個關節、但先扣掉蒙皮網格的靜止位置。
 */
export interface SkinGeometry {
  positions: Float32Array;
  colors: Uint32Array;
  joints: Uint16Array;
  weights: Float32Array;
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
/**
 * 拿盾時的左臂（設計者 2026-11-14：手握盾牌背面的把手往前伸，盾牌與地板約 100 度，手不要伸太直）：
 * 上臂往前抬 SHIELD_UPPER、往外張 SHIELD_OUT，手肘彎 SHIELD_ELBOW（手肘內角約 120 度）；兩者加起來手臂比水平高約 10 度，
 * 盾面朝手臂方向，所以盾牌上緣往自己這邊傾約 10 度。原本姿勢的手臂擺動保留 SHIELD_SWAY 的比例。
 */
const SHIELD_UPPER = -0.7;
const SHIELD_OUT = 0.3;
const SHIELD_ELBOW = -1.05;
const SHIELD_SWAY = 0.25;

export class PolyFigure {
  /** 所有角色共用的除錯疊圖設定 */
  static debug: FigureDebug = {};
  /** 所有角色共用的光影（viewer 的 ?light= 試驗用）；null = 照各模型的 lighting */
  static lighting: FigureModel['lighting'] | null = null;
  /** 角色的顯示物件（放進場景、設定位置 / 縮放 / tint 都用它）：裡面是多面體網格與除錯疊圖 */
  readonly graphics = new Container();
  private readonly facets = this.graphics.addChild(new FacetMesh());
  private debugLayer: Graphics | null = null;
  /** 設定後改用 Three.js 畫（見 TriangleSink）；null = Pixi 多邊形 */
  sink: TriangleSink | null = null;
  private time = 0;
  private runPhase = 0;

  /** 沒指定招式的攻擊是否一律播 attackChain */
  get plainAttackIsChain(): boolean {
    return this.model.poses.plainAttackIsChain === true;
  }
  private current: Pose;
  private action: Action | null = null;
  private hitTime = 0;
  /** 這一幀開始待機怒吼（播放吼聲用；讀取後清除） */
  private roarStarted = false;
  /** 死亡過程：開始的姿勢與經過時間 */
  private death: { from: Pose; elapsed: number } | null = null;
  /** 次級運動：各關節目前的方向（模型空間） */
  private readonly chain = new Map<Joint, V3>();
  private stepDt = 0;
  /** GPU 蒙皮：每根骨頭的矩陣（4 × 4，行優先；見 SkinGeometry） */
  private bones: Float32Array | null = null;
  /** 武器尖端的畫面座標（相對腳底，px；模型有 weaponTip 時才有） */
  weaponTip: { x: number; y: number } | null = null;
  /** 武器光芒的軸線與聚焦點（相對腳底，px）；front = 武器在身體前面（有 setWeapon 時才有） */
  weaponAxis: { a: ScreenPoint; b: ScreenPoint; mid: ScreenPoint; focus: ScreenPoint | null; front: boolean } | null = null;
  /** undefined = 模型原本的武器；null = 空手 */
  private mount: WeaponMount | null | undefined = undefined;
  /** 換掉的關節網格（主角穿上的頭盔、盔甲、靴子）；沒有列出的關節用模型原本的網格。hideSkin：蒙皮網格中被裝備蓋住、不畫的部位 */
  private outfit: (ReadonlyMap<Joint, Mesh[]> & { hideSkin?: ReadonlySet<string>; skinColors?: ReadonlyMap<number, number> }) | null = null;
  /** 不畫的關節（魔王階段變化：盾牌碎裂、巨劍落地） */
  private hidden: ReadonlySet<Joint> = new Set();
  /** 階段藏起的關節；hidden = 這個 + 目前不在前搖後半段時的 windupOnly（兩組預先算好，切換時不重建） */
  private phaseHidden: ReadonlySet<Joint> = new Set();
  private phaseHiddenIdle: ReadonlySet<Joint> = new Set();
  /** 切換階段後還要慢慢過渡幾秒（模型的 phaseBlendTime） */
  private phaseBlend = 0;
  /** 目前階段的動作（魔王的 phasePoses；沒有時是模型的 poses） */
  private poses: FigureModel['poses'];
  /** 腳下影子（相對腳底，px；模型有 dynamicShadow 時才有）：中心與水平半徑 */
  shadow: { x: number; y: number; rx: number } | null = null;

  constructor(
    private readonly model: FigureModel,
    /** 整體縮放（角色半徑 ÷ 模型設計半徑） */
    private readonly scale = 1,
  ) {
    this.current = model.poses.ready(0);
    // 一開始是第 1 階段（魔王第 1 階段要藏起的關節，例如第 3 階段才出現的元素球）
    this.setHidden(model.phaseHidden?.[0] ?? []);
    this.poses = model.phasePoses?.[0] ?? model.poses;
  }

  private setHidden(phase: readonly Joint[]): void {
    this.phaseHidden = new Set(phase);
    this.phaseHiddenIdle = new Set([...phase, ...(this.model.windupOnly ?? [])]);
    this.hidden = this.phaseHiddenIdle;
  }

  /** 攻擊 / 施法：windup 秒後命中（前搖），之後揮下、收回；variant 為招式（模型有對應動作時使用） */
  act(kind: ActionKind, windup: number, variant?: AttackVariant): void {
    this.action = { kind, elapsed: 0, windup: Math.max(0.08, windup), ...(variant ? { variant } : {}) };
  }

  /** 從地下鑽出來（模型有 emerge 姿勢才有動作） */
  erupt(): void {
    this.action = null;
    this.emergeTime = 0;
  }

  /** 鑽出來後剛倒回地上（讀取後清除） */
  consumeLanded(): boolean {
    const l = this.landed;
    this.landed = false;
    return l;
  }

  private emergeTime: number | null = null;
  private landed = false;

  /** 武器丟出去了（飛斧重甲的迴旋斧飛在空中）：手上的武器不畫 */
  setThrown(on: boolean): void {
    this.thrown = on;
  }

  private thrown = false;
  private readonly noWeapon = new Map<ReadonlySet<Joint>, ReadonlySet<Joint>>();
  private withoutWeapon(base: ReadonlySet<Joint>): ReadonlySet<Joint> {
    let set = this.noWeapon.get(base);
    if (!set) this.noWeapon.set(base, (set = new Set([...base, 'weapon'])));
    return set;
  }

  /** 換手上的武器（null = 空手） */
  setWeapon(mount: WeaponMount | null): void {
    this.mount = mount;
  }

  /** 換裝：關節 → 取代的網格（null = 模型原本的外觀） */
  setOutfit(parts: (ReadonlyMap<Joint, Mesh[]> & { hideSkin?: ReadonlySet<string>; skinColors?: ReadonlyMap<number, number> }) | null): void {
    this.outfit = parts;
  }

  /** 魔王的階段：依模型的 phaseHidden 隱藏關節 */
  setPhase(phase: number): void {
    this.setHidden(this.model.phaseHidden?.[phase] ?? []);
    this.poses = this.model.phasePoses?.[phase] ?? this.model.poses;
    this.phaseBlend = this.model.phaseBlendTime ?? 0;
  }

  /** 是否剛開始待機怒吼（讀取後清除） */
  consumeRoar(): boolean {
    const r = this.roarStarted;
    this.roarStarted = false;
    return r;
  }

  hit(): void {
    this.hitTime = this.poses.hitKeys ? HIT_KEYS_TIME : HIT_TIME;
  }

  /** 直接畫出某個姿勢（樣態預覽用；次級運動直接用目標方向） */
  showPose(pose: Pose, facing: Vec2): void {
    this.current = pose;
    this.chain.clear();
    this.stepDt = 0;
    this.draw(yawFor(facing), facing);
  }

  update(dt: number, state: FigureState): void {
    const roar = this.model.idleRoar;
    if (roar && state.alive && !state.moving && !this.action) {
      const cycle = (t: number) => Math.floor((t - IDLE_ROAR_OFFSET) / roar.period);
      if (this.time + dt >= IDLE_ROAR_OFFSET && cycle(this.time + dt) > cycle(this.time)) this.roarStarted = true;
    }
    this.time += dt;
    this.stepDt = dt;
    const walking = state.moving && !!this.poses.walk && (state.speed ?? Infinity) < (this.model.walkBelow ?? WALK_BELOW);
    if (state.moving) this.runPhase += dt * (walking ? 7.5 : 11) * (this.model.gaitRate ?? 1);
    this.hitTime = Math.max(0, this.hitTime - dt);
    const target = this.shieldArm(this.targetPose(state, dt, walking));
    // 動作（攻擊 / 施法 / 死亡過程）直接用時間軸的姿勢，其他狀態平滑過渡
    this.phaseBlend = Math.max(0, this.phaseBlend - dt);
    const k = this.action || this.emergeTime !== null || (this.death && this.poses.deathKeys) ? 1 : Math.min(1, dt * (this.phaseBlend > 0 ? 3 : 14));
    this.current = lerpPose(this.current, target, k);
    const a = this.action;
    const base = this.model.windupOnly && a && a.elapsed > a.windup * 0.45 && a.elapsed < a.windup ? this.phaseHidden : this.phaseHiddenIdle;
    this.hidden = this.thrown ? this.withoutWeapon(base) : base;
    this.draw(yawFor(state.facing), state.facing);
  }

  private targetPose(state: FigureState, dt: number, walking: boolean): Pose {
    const poses = this.poses;
    if (!state.alive) {
      this.action = null;
      if (!poses.deathKeys) return poses.dead;
      this.death ??= { from: this.current, elapsed: 0 };
      this.death.elapsed += dt;
      return samplePoses([this.death.from, ...poses.deathKeys], this.death.elapsed / DEATH_TIME);
    }
    this.death = null;
    const base = this.withRest(state.moving ? (walking ? poses.walk!(this.runPhase) : poses.run(this.runPhase)) : poses.ready(this.time));
    // 從地下鑽出來：豎直竄出、停一下，再加速倒回平常的姿勢（掉在地上）
    if (this.emergeTime !== null && poses.emerge) {
      const t = (this.emergeTime += dt);
      const up = poses.emerge;
      if (t < EMERGE_RISE) return lerpPose({ ...up, rootY: up.rootY - EMERGE_SINK * Math.abs(up.rootY) }, up, easeOut(t / EMERGE_RISE));
      if (t < EMERGE_RISE + EMERGE_HOLD) return up;
      const f = (t - EMERGE_RISE - EMERGE_HOLD) / EMERGE_FALL;
      if (f < 1) return lerpPose(up, base, f * f);
      this.emergeTime = null;
      this.landed = true;
    }
    if (this.action) {
      const a = this.action;
      a.elapsed += dt;
      const variant = a.kind === 'attack' && a.variant ? poses.attackVariants?.[a.variant] : undefined;
      const chain = a.kind === 'attack' ? (variant ?? poses.attackChain) : undefined;
      if (chain) {
        const strikeFrom = chain.windup[chain.windup.length - 1]!;
        const last = unwound(chain.strike[chain.strike.length - 1]!);
        const strikeTime = chain.strikeTime ?? CHAIN_STRIKE_TIME;
        if (a.elapsed < a.windup) return samplePoses([base, ...chain.windup], easeInOut(a.elapsed / a.windup));
        if (a.elapsed < a.windup + strikeTime) return samplePoses([strikeFrom, ...chain.strike], (a.elapsed - a.windup) / strikeTime);
        if (a.elapsed < a.windup + strikeTime + RECOVER_TIME) return lerpPose(last, base, easeInOut((a.elapsed - a.windup - strikeTime) / RECOVER_TIME));
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
   * 拿盾時左臂握著盾牌往前伸（設計者 2026-11-14：原本盾牌壓在臉上）。
   * 只在換裝有盾牌（outfit 的 weaponL）時調整；空手、拿弓（弓在 mount、不在 outfit）不受影響。
   */
  private shieldArm(pose: Pose): Pose {
    if (!this.outfit?.get('weaponL')?.length || !pose.angles) return pose;
    const u = pose.angles.upperArmL ?? [0, 0, 0];
    return {
      ...pose,
      angles: { ...pose.angles, upperArmL: [SHIELD_UPPER + (u[0] + 0.25) * SHIELD_SWAY, u[1] * SHIELD_SWAY, SHIELD_OUT], forearmL: [SHIELD_ELBOW, 0, 0], handL: [0, 0, 0] },
    };
  }

  /** 平常拿武器的角度（WeaponMount.rest）疊加到武器關節 */
  private withRest(pose: Pose): Pose {
    return this.mount ? restPose(this.model, pose, this.mount) : pose;
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
    const facets = this.facets;
    facets.begin();
    const k = SCALE * this.scale;
    const toScreen = (v: V3) => [(v[0] - v[2]) * 0.707 * k, ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * k] as const;
    const world = solveJoints(this.model.parts, this.model.hipHeight, this.current, yaw, this.model.secondary ? this.lag : undefined);
    // 細節層級：依角色在畫面上的大小，省略小細節
    const t = this.graphics.worldTransform;
    const px = k * (Math.hypot(t.a, t.b) || 1);
    const lod = px < LOD_MEDIUM ? 0 : px < LOD_HIGH ? 1 : 2;
    const rim = this.model.rimLight ?? 0;
    const soft = this.model.softLight ?? false;
    const weaponJoint = this.model.weaponJoint ?? 'handR';
    const mount = this.mount;
    const tipJoint = mount ? mount.joint : weaponJoint;
    const tipLocal = mount === undefined ? this.model.weaponTip : mount?.tip;
    this.weaponTip = null;
    this.weaponAxis = null;
    const mode = PolyFigure.lighting ?? this.model.lighting ?? 'normal';
    const sink = this.sink;
    const scaled = (v: V3): V3 => [v[0] * k, v[1] * k, v[2] * k];
    sink?.begin();
    /** 一個面：背面剔除、依光線上色、記下深度（之後由遠到近畫） */
    const emit = (verts: readonly V3[], idx: readonly number[], faceColor: number, base?: number) => {
      if (sink) {
        // 不做背面剔除（背面也要投射陰影）
        const color = mode === 'normal' ? faceColor : (base ?? faceColor);
        const a = scaled(verts[idx[0]!]!);
        for (let i = 1; i < idx.length - 1; i++) sink.triangle(a, scaled(verts[idx[i]!]!), scaled(verts[idx[i + 1]!]!), color);
        return;
      }
      const n = normalize(faceNormal(verts, idx));
      const facingView = dot(n, VIEW);
      if (facingView <= 0) return;
      let depth = 0;
      facets.open();
      for (const i of idx) {
        const v = verts[i]!;
        depth += dot(v, VIEW);
        facets.point((v[0] - v[2]) * 0.707 * k, ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * k);
      }
      const d = dot(n, LIGHT);
      const lit = soft ? Math.max(0, (d + 0.45) / 1.45) : Math.max(0, d);
      let color: number;
      if (mode === 'flat') color = base ?? faceColor;
      else if (mode === 'toon') color = shade(base ?? faceColor, lit > 0.55 ? 1.02 : lit > 0.25 ? 0.86 : 0.7);
      else {
        color = shade(faceColor, AMBIENT + DIFFUSE * lit);
        // 輪廓光：接近輪廓（幾乎側對鏡頭）且背光的面，加一點暖色
        if (rim > 0) color = addRim(color, rim * Math.max(0, 1 - facingView * 2.2) * (1 - lit));
      }
      facets.close(depth / idx.length, color);
    };
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
      const meshes = this.meshesOf(part, weaponJoint, lod);
      if (mount && part.joint === mount.joint) {
        const [a, b] = mount.axis;
        const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const chest = world.get('chest')?.p ?? world.get('root')!.p;
        this.weaponAxis = { a: screen(a), b: screen(b), mid: screen(mid), focus: mount.focus ? screen(mount.focus) : null, front: dot(at(mid), VIEW) > dot(chest, VIEW) };
      }
      if (sink?.skin) continue;
      for (const mesh of meshes) {
        const verts = mesh.verts.map((v) => {
          const r = apply(m, v);
          return [p[0] + r[0], p[1] + r[1], p[2] + r[2]] as V3;
        });
        for (const face of mesh.faces) emit(verts, face.idx, face.color, face.base);
      }
    }
    // 弓弦（上下兩段，接到搭箭點）
    const str = mount?.string ? this.stringPoints(world, mount.joint, mount.string) : null;
    this.stringNow = str;
    if (str && !sink?.skin) {
      const s = mount!.string!;
      for (const [a, b] of [[str[0], str[1]], [str[1], str[2]]] as const) {
        const [e1, e2] = rodAxes(a, b, s.width);
        const verts = ROD_CORNERS.map(([x, y, z]) => vadd(vadd(vadd(a, e1, x), e2, y), vsub(b, a), z));
        ROD_FACES.forEach((f, i) => emit(verts, f, s.colors[i % s.colors.length]!));
      }
      if (str.arrow) {
        const [o, d] = str.arrow;
        const [e1, e2] = rodAxes(o, vadd(o, d), 1);
        const arrow = arrowMesh(s);
        const verts = arrow.verts.map(([x, y, z]) => vadd(vadd(vadd(o, e1, x), e2, y), d, z));
        for (const f of arrow.faces) emit(verts, f.idx, f.color);
      }
    }
    // 蒙皮網格（整張連續的身體）：被裝備蓋住的部位不畫；靴子等部位換成裝備的顏色（skinColors）
    const skin = this.model.skin;
    if (sink?.skin) {
      const share = !this.outfit && !mount ? { owner: this.model, id: `${mode}|${lod}|${weaponJoint}|${[...this.hidden].sort().join(',')}` } : undefined;
      sink.skin([mode, lod, this.outfit, mount, this.hidden], () => this.skinGeometry(weaponJoint, lod, mode), this.boneMatrices(world, k), share);
    } else if (skin) {
      const verts = skinVerts(skin, world);
      const hide = this.outfit?.hideSkin;
      const colors = this.outfit?.skinColors;
      skin.faces.forEach((face, i) => {
        if (hide?.has(face.region) || this.hidden.has(face.region as Joint)) return;
        emit(verts, face.idx, colors?.get(i) ?? face.color);
      });
    }
    if (this.model.dynamicShadow) this.shadow = footprint([world.get('footL')?.p, world.get('footR')?.p, world.get('head')?.p], world.get('root')!.p, toScreen, k);
    if (sink) {
      sink.end();
      facets.visible = false;
      this.debugLayer?.clear();
      return;
    }
    facets.visible = true;
    facets.end();
    const dbg = PolyFigure.debug;
    if (!dbg.edges && !dbg.joints && !dbg.bones && !dbg.pivot && !dbg.facing && !dbg.anchor) {
      this.debugLayer?.clear();
      return;
    }
    const g = (this.debugLayer ??= this.graphics.addChild(new Graphics())).clear();
    if (dbg.edges) facets.forEachFace((points) => g.poly(points).stroke({ color: 0xffffff, width: 0.35, alpha: 0.45 }));
    if (dbg.joints || dbg.bones || dbg.pivot || dbg.facing || dbg.anchor) this.drawDebug(g, world, toScreen, yaw, facing, weaponJoint);
  }

  /** 這一幀弓弦的三個點（上端、搭箭點、下端；模型空間）與搭著的箭（箭尾、朝箭頭的單位向量；射箭前搖才有）：GPU 蒙皮的骨頭矩陣也用 */
  private stringNow: (readonly [V3, V3, V3] & { arrow?: readonly [V3, V3] }) | null = null;

  private stringPoints(world: JointFrames, joint: Joint, s: NonNullable<WeaponMount['string']>): readonly [V3, V3, V3] & { arrow?: readonly [V3, V3] } {
    const { m, p } = world.get(joint)!;
    const at = (v: V3): V3 => vadd(p, apply(m, v));
    const rest: V3 = [(s.top[0] + s.bottom[0]) / 2, (s.top[1] + s.bottom[1]) / 2, (s.top[2] + s.bottom[2]) / 2];
    let nock = rest;
    const a = this.action;
    // 右手拳心：主角的 weapon 關節（握劍的位置）；沒有時用手腕
    const fist = world.get('weapon')?.p ?? world.get('handR')?.p;
    const back = Math.hypot(...rest);
    const shooting = !!a && a.variant === 'shoot' && a.elapsed < a.windup && back > 1e-6;
    const u = rest.map((x) => x / back) as V3; // 握把 → 弦：拉弓的方向
    if (shooting && fist) {
      // 拳心換到弓的座標（旋轉矩陣的反矩陣 = 轉置）
      const d = vsub(fist, p);
      const local: V3 = [m[0] * d[0] + m[3] * d[1] + m[6] * d[2], m[1] * d[0] + m[4] * d[1] + m[7] * d[2], m[2] * d[0] + m[5] * d[1] + m[8] * d[2]];
      const half = Math.hypot(...vsub(s.bottom, s.top)) / 2;
      // 右手先從身側伸到弦上：搭箭（前搖 40%，HeroinePose 第 1 格）之後搭箭點才跟著拳心，40%～55% 之間漸入。
      // 搭箭點就是拳心的位置（含左右的偏移；設計者 2026-11-16：弦不能跑到左手臂另一側），離弦的中點最多 0.9 個半弦長
      const t = a!.elapsed / a!.windup;
      const x = Math.max(0, Math.min(1, (t - NOCK_AT) / 0.15));
      const rel = vsub(local, rest);
      const far = Math.hypot(...rel);
      const w = x * x * (3 - 2 * x) * (far > half * 0.9 ? (half * 0.9) / far : 1);
      if (w > 0) nock = vadd(rest, rel, w);
    }
    const pts: [V3, V3, V3] = [at(s.top), at(nock), at(s.bottom)];
    // 箭：箭尾在搭箭點，箭身穿過握把（弓的座標原點）
    const aim = vsub(p, pts[1]);
    const dir = Math.hypot(...aim) > 1e-6 ? normalize(aim) : normalize(apply(m, [-u[0], -u[1], -u[2]]));
    return shooting && a!.elapsed >= a!.windup * NOCK_AT ? Object.assign(pts, { arrow: [pts[1], dir] as const }) : pts;
  }

  /** 這個關節這一幀要畫的網格：換裝、換武器、隱藏、細節層級（加密的裝備沒有放大時畫粗網格） */
  private meshesOf(part: FigureModel['parts'][number], weaponJoint: Joint, lod: number): Mesh[] {
    const mount = this.mount;
    let meshes = this.hidden.has(part.joint) ? [] : (this.outfit?.get(part.joint) ?? part.meshes);
    if (mount !== undefined && (part.joint === weaponJoint || part.joint === mount?.joint)) meshes = mount?.joint === part.joint ? mount.meshes : [];
    const still = mount?.string?.meshes;
    return meshes.filter((m) => (m.lod ?? 0) <= lod && !still?.has(m)).map((fine) => (lod < 2 && fine.coarse ? fine.coarse : fine));
  }

  /** GPU 蒙皮的靜止網格：與 draw() 交給 sink 的三角形相同（同樣的面、顏色、扇形切法） */
  private skinGeometry(weaponJoint: Joint, lod: number, mode: NonNullable<FigureModel['lighting']>): SkinGeometry {
    const parts = this.model.parts;
    const pos: number[] = [];
    const col: number[] = [];
    const jnt: number[] = [];
    const wts: number[] = [];
    const vertex = (v: V3, color: number, joints: readonly number[], weights: readonly number[]) => {
      pos.push(v[0], v[1], v[2]);
      col.push(color);
      for (let i = 0; i < 4; i++) {
        jnt.push(joints[i] ?? 0);
        wts.push(weights[i] ?? 0);
      }
    };
    const fan = (idx: readonly number[], at: (i: number) => void) => {
      for (let i = 1; i < idx.length - 1; i++) {
        at(idx[0]!);
        at(idx[i]!);
        at(idx[i + 1]!);
      }
    };
    parts.forEach((part, b) => {
      for (const mesh of this.meshesOf(part, weaponJoint, lod)) {
        for (const face of mesh.faces) {
          const color = mode === 'normal' ? face.color : (face.base ?? face.color);
          fan(face.idx, (i) => vertex(mesh.verts[i]!, color, [b], [1]));
        }
      }
    });
    // 弓弦：兩段單位弦，各自一根骨頭（2n、2n + 1；boneMatrices 依這一幀的弦拉到位置）
    const s = this.mount?.string;
    if (s)
      for (const seg of [0, 1])
        ROD_FACES.forEach((f, i) => fan(f, (v) => vertex(ROD_CORNERS[v]!, s.colors[i % s.colors.length]!, [parts.length * 2 + seg], [1])));
    // 箭：第三根骨頭（2n + 2；不射箭時矩陣全為 0，縮成一點看不見）
    if (s) {
      const arrow = arrowMesh(s);
      for (const f of arrow.faces) fan(f.idx, (v) => vertex(arrow.verts[v]!, f.color, [parts.length * 2 + 2], [1]));
    }
    const skin = this.model.skin;
    if (skin) {
      const index = new Map(parts.map((p, i) => [p.joint, i]));
      const hide = this.outfit?.hideSkin;
      const colors = this.outfit?.skinColors;
      // 每個頂點的骨頭與權重（關節不存在或沒有靜止位置的不算，與 skinVerts 相同）
      const infl = skin.infl.map((list) => {
        const used = list.filter(({ joint }) => index.has(joint) && skin.rest[joint]);
        if (used.length > 4) throw new Error('蒙皮網格每個頂點最多 4 根骨頭');
        return { joints: used.map(({ joint }) => parts.length + index.get(joint)!), weights: used.map(({ w }) => w) };
      });
      skin.faces.forEach((face, i) => {
        if (hide?.has(face.region) || this.hidden.has(face.region as Joint)) return;
        const color = colors?.get(i) ?? face.color;
        fan(face.idx, (v) => vertex(skin.verts[v]!, color, infl[v]!.joints, infl[v]!.weights));
      });
    }
    return { positions: new Float32Array(pos), colors: new Uint32Array(col), joints: new Uint16Array(jnt), weights: new Float32Array(wts) };
  }

  /**
   * GPU 蒙皮的骨頭矩陣（4 × 4，行優先，與 Three.js 的 Matrix4.elements 相同）：
   * 零件：k ×（p + m·v）；蒙皮：k ×（p + m·(v − 靜止位置)）。k = 畫面縮放。
   */
  private boneMatrices(world: JointFrames, k: number): Float32Array {
    const parts = this.model.parts;
    const n = parts.length;
    const count = (n * 2 + (this.mount?.string ? 3 : 0)) * 16;
    if (this.bones?.length !== count) this.bones = new Float32Array(count);
    const out = this.bones;
    const rest = this.model.skin?.rest;
    parts.forEach((part, i) => {
      const { m, p } = world.get(part.joint)!;
      const r = rest?.[part.joint] ?? [0, 0, 0];
      const mr = apply(m, r);
      for (const [b, t] of [
        [i, p],
        [n + i, [p[0] - mr[0], p[1] - mr[1], p[2] - mr[2]]],
      ] as const) {
        const o = b * 16;
        out[o] = m[0] * k;
        out[o + 1] = m[3] * k;
        out[o + 2] = m[6] * k;
        out[o + 3] = 0;
        out[o + 4] = m[1] * k;
        out[o + 5] = m[4] * k;
        out[o + 6] = m[7] * k;
        out[o + 7] = 0;
        out[o + 8] = m[2] * k;
        out[o + 9] = m[5] * k;
        out[o + 10] = m[8] * k;
        out[o + 11] = 0;
        out[o + 12] = t[0] * k;
        out[o + 13] = t[1] * k;
        out[o + 14] = t[2] * k;
        out[o + 15] = 1;
      }
    });
    // 弓弦兩段：單位弦的 x、y 是截面、z 是 a → b
    const str = this.stringNow;
    const w = this.mount?.string?.width;
    if (str && w !== undefined)
      [[str[0], str[1]], [str[1], str[2]]].forEach(([a, b], seg) => {
        const [e1, e2] = rodAxes(a!, b!, w);
        const cols = [e1, e2, vsub(b!, a!), a!];
        const o = (n * 2 + seg) * 16;
        cols.forEach((c, j) => {
          out[o + j * 4] = c[0] * k;
          out[o + j * 4 + 1] = c[1] * k;
          out[o + j * 4 + 2] = c[2] * k;
          out[o + j * 4 + 3] = j === 3 ? 1 : 0;
        });
      });
    if (str && w !== undefined) {
      const o = (n * 2 + 2) * 16;
      out.fill(0, o, o + 16);
      if (str.arrow) {
        const [a, d] = str.arrow;
        const [e1, e2] = rodAxes(a, vadd(a, d), 1);
        [e1, e2, d, a].forEach((c, j) => {
          out[o + j * 4] = c[0] * k;
          out[o + j * 4 + 1] = c[1] * k;
          out[o + j * 4 + 2] = c[2] * k;
          out[o + j * 4 + 3] = j === 3 ? 1 : 0;
        });
      }
    }
    return out;
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

