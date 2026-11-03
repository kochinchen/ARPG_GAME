import { Container, Graphics, GraphicsContext } from 'pixi.js';

/** 地面：半透明的黑、紅色的圈 */
const DISC_COLOR = 0x050206;
const DISC_ALPHA = 0.62;
const RING_COLOR = 0xe0141c;
const FADE_IN = 0.35;
const FADE_OUT = 0.5;
/** 平均每秒、每格面積冒出幾顆骷髏（範圍越大越多；裝備的半徑 3 格約 2 秒 1 顆）；上限避免高樓層的大範圍擋住畫面 */
const SKULLS_PER_AREA = 0.016;
const MAX_SKULLS_PER_SECOND = 2.5;
const SKULL_LIFE: [number, number] = [1.5, 2.6];
/** 往上漂的距離（px） */
const SKULL_RISE: [number, number] = [55, 105];
const SKULL_SCALE: [number, number] = [0.7, 1.2];
const SKULL_FADE = 0.3;
const SKULL_MAX_ALPHA = 0.85;

const between = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

interface FloatingSkull {
  view: Graphics;
  x: number;
  y: number;
  age: number;
  life: number;
  rise: number;
  sway: number;
  swayRate: number;
  phase: number;
}

type Point = readonly [number, number];

/** 骷髏正面的頂點（px，x 往右、y 往下；中心在鼻樑） */
const P = {
  crown: [0, -15], crownL: [-7, -14], crownR: [7, -14],
  templeL: [-12, -8], templeR: [12, -8], sideL: [-13, -1], sideR: [13, -1],
  domeL: [-5, -8], domeR: [5, -8], dome: [0, -10],
  browL: [-9, -3], browR: [9, -3], glabella: [0, -3],
  cheekL: [-10, 4], cheekR: [10, 4], noseTop: [0, 0], noseL: [-2.5, 5], noseR: [2.5, 5],
  mouthL: [-7, 8], mouthR: [7, 8], mouth: [0, 8],
  jawL: [-7, 14], jawR: [7, 14], chinL: [-3, 16], chinR: [3, 16],
} as const satisfies Record<string, Point>;

/** 細碎的三角面（亮面朝左上），和遊戲的構面風格一致 */
const BONE_FACETS: readonly (readonly [Point, Point, Point])[] = [
  [P.crown, P.crownL, P.dome], [P.crown, P.crownR, P.dome], [P.crownL, P.domeL, P.dome], [P.crownR, P.domeR, P.dome],
  [P.crownL, P.templeL, P.domeL], [P.crownR, P.templeR, P.domeR], [P.templeL, P.browL, P.domeL], [P.templeR, P.browR, P.domeR],
  [P.domeL, P.dome, P.glabella], [P.domeR, P.dome, P.glabella], [P.domeL, P.browL, P.glabella], [P.domeR, P.browR, P.glabella],
  [P.templeL, P.sideL, P.browL], [P.templeR, P.sideR, P.browR], [P.sideL, P.cheekL, P.browL], [P.sideR, P.cheekR, P.browR],
  [P.browL, P.cheekL, P.noseL], [P.browR, P.cheekR, P.noseR], [P.browL, P.glabella, P.noseL], [P.browR, P.glabella, P.noseR],
  [P.cheekL, P.mouthL, P.noseL], [P.cheekR, P.mouthR, P.noseR], [P.mouthL, P.mouth, P.noseL], [P.mouthR, P.mouth, P.noseR], [P.noseL, P.noseR, P.mouth],
];
const JAW_FACETS: readonly (readonly [Point, Point, Point])[] = [
  [[-7, 10], [-3, 10], P.jawL], [[-3, 10], P.chinL, P.jawL], [[-3, 10], [3, 10], P.chinL], [[3, 10], P.chinR, P.chinL], [[3, 10], [7, 10], P.chinR], [[7, 10], P.jawR, P.chinR],
];

/** 依面的位置算明暗：左上亮、右下暗，帶一點紅 */
function boneColor([a, b, c]: readonly [Point, Point, Point], index: number): number {
  const x = (a[0] + b[0] + c[0]) / 3;
  const y = (a[1] + b[1] + c[1]) / 3;
  const light = Math.min(1, Math.max(0.3, 0.78 - x * 0.022 - y * 0.024 + (index % 3) * 0.045));
  return (Math.round(232 * light) << 16) | (Math.round(214 * light) << 8) | Math.round(196 * light);
}

const flat = (points: readonly Point[]) => points.flatMap((p) => [p[0], p[1]]);

/** 所有骷髏共用一份幾何（不必每顆重新建立） */
function skullArt(): GraphicsContext {
  const art = new GraphicsContext();
  [...BONE_FACETS, ...JAW_FACETS].forEach((facet, i) => {
    const color = boneColor(facet, i);
    // 同色的細邊補掉三角形之間的接縫
    art.poly(flat(facet)).fill({ color }).stroke({ color, width: 0.5 });
  });
  // 眼窩、鼻孔、牙縫
  const hollow = 0x140406;
  art.poly([-8, -2, -3, -2.5, -2, 2, -5, 4, -8.5, 2]).fill({ color: hollow });
  art.poly([8, -2, 3, -2.5, 2, 2, 5, 4, 8.5, 2]).fill({ color: hollow });
  art.poly([0, 1, -2, 5.5, 0, 4.5, 2, 5.5]).fill({ color: hollow });
  for (const x of [-4.5, -1.5, 1.5, 4.5]) art.moveTo(x, 8).lineTo(x, 12).stroke({ color: hollow, width: 0.9 });
  art.moveTo(-7, 10).lineTo(7, 10).stroke({ color: hollow, width: 0.8 });
  // 眼窩裡的紅光
  art.poly([-6.8, -0.6, -4, -1, -3.2, 1.2, -5.2, 2.6, -7, 1.2]).fill({ color: RING_COLOR, alpha: 0.75 });
  art.poly([6.8, -0.6, 4, -1, 3.2, 1.2, 5.2, 2.6, 7, 1.2]).fill({ color: RING_COLOR, alpha: 0.75 });
  art.circle(-5.2, 0.8, 1).fill({ color: 0xffb0a0 });
  art.circle(5.2, 0.8, 1).fill({ color: 0xffb0a0 });
  return art;
}

let sharedArt: GraphicsContext | null = null;

/**
 * 暗黑領域（ZoneEffect 的 look: 'darkDomain'、裝備條件效果的 aura，魔王與裝備共用）：地上一塊半透明的黑、紅色的圈，
 * 不定時從裡面漂出骷髏。結束後地面淡出，還在漂的骷髏漂完才移除。
 */
export class DarkDomainFx {
  private readonly disc = new Graphics();
  private readonly skulls: FloatingSkull[] = [];
  private age = 0;
  private spawnIn = Math.random() * 0.3;
  private readonly screenRadius: { x: number; y: number };
  private readonly origin: { x: number; y: number };
  private discAlive = true;

  constructor(
    /** 範圍外緣（畫面座標，已投影的 x, y 交錯） */
    private readonly outline: readonly number[],
    private center: { x: number; y: number },
    private readonly area: number,
    ground: Container,
    private readonly top: Container,
  ) {
    this.origin = center;
    // 世界座標的圓在畫面上是扁的橢圓：骷髏在橢圓裡冒出來
    const xs = outline.filter((_, i) => i % 2 === 0);
    const ys = outline.filter((_, i) => i % 2 === 1);
    this.screenRadius = { x: (Math.max(...xs) - Math.min(...xs)) / 2, y: (Math.max(...ys) - Math.min(...ys)) / 2 };
    const inner = outline.map((v, i) => (i % 2 === 0 ? center.x + (v - center.x) * 0.965 : center.y + (v - center.y) * 0.965));
    this.disc
      .poly([...outline]).fill({ color: DISC_COLOR, alpha: DISC_ALPHA })
      .poly(inner).stroke({ color: RING_COLOR, width: 1, alpha: 0.45 })
      .poly([...outline]).stroke({ color: RING_COLOR, width: 3, alpha: 0.95 });
    ground.addChild(this.disc);
  }

  /** remaining：區域還有幾秒 */
  update(dt: number, remaining: number, now: number): void {
    this.age += dt;
    const fade = Math.min(1, this.age / FADE_IN, remaining / FADE_OUT);
    // 紅圈慢慢呼吸；黑色本身不閃爍
    this.disc.alpha = fade * (0.9 + 0.1 * Math.sin(now * 2.4));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnSkull();
      // 不固定的間隔：平均值依面積，每次 0.3～1.7 倍
      this.spawnIn = (0.3 + Math.random() * 1.4) / Math.min(MAX_SKULLS_PER_SECOND, this.area * SKULLS_PER_AREA);
    }
    this.updateSkulls(dt);
  }

  /** 跟著主角走（裝備條件成立時的外觀）：地面跟著移動，已經漂出來的骷髏留在原處 */
  moveTo(center: { x: number; y: number }): void {
    this.center = center;
    this.disc.position.set(center.x - this.origin.x, center.y - this.origin.y);
  }

  /** 結束後每幀呼叫：地面淡出、骷髏漂完；false = 全部清乾淨了 */
  drain(dt: number): boolean {
    if (this.discAlive) {
      this.disc.alpha -= dt / FADE_OUT;
      if (this.disc.alpha <= 0) {
        this.disc.destroy();
        this.discAlive = false;
      }
    }
    this.updateSkulls(dt);
    return this.discAlive || this.skulls.length > 0;
  }

  private spawnSkull(): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * 0.88;
    const view = new Graphics((sharedArt ??= skullArt()));
    view.scale.set(between(SKULL_SCALE));
    view.alpha = 0;
    this.top.addChild(view);
    this.skulls.push({
      view,
      x: this.center.x + Math.cos(angle) * distance * this.screenRadius.x,
      y: this.center.y + Math.sin(angle) * distance * this.screenRadius.y,
      age: 0,
      life: between(SKULL_LIFE),
      rise: between(SKULL_RISE),
      sway: 4 + Math.random() * 8,
      swayRate: 1.5 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
    });
  }

  private updateSkulls(dt: number): void {
    for (let i = this.skulls.length - 1; i >= 0; i--) {
      const s = this.skulls[i]!;
      s.age += dt;
      if (s.age >= s.life) {
        s.view.destroy();
        this.skulls.splice(i, 1);
        continue;
      }
      const t = s.age / s.life;
      // 一開始浮得快，之後慢下來
      const lift = s.rise * (1 - (1 - t) * (1 - t));
      const wave = Math.sin(s.age * s.swayRate + s.phase);
      s.view.position.set(s.x + wave * s.sway, s.y - 8 - lift);
      s.view.rotation = wave * 0.16;
      s.view.alpha = SKULL_MAX_ALPHA * Math.min(1, s.age / SKULL_FADE, (s.life - s.age) / SKULL_FADE);
    }
  }
}
