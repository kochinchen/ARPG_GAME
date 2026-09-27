import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DungeonTheme } from '../../data/schema/floor';
import type { NavGrid } from '../../game/movement/NavGrid';
import { THEMES, type ThemeColors } from '../themes';

/** 牆高（px）：每一格隨機加上 0～WALL_JITTER，牆頂參差不齊 */
const WALL_HEIGHT = 24;
const WALL_JITTER = 10;
/** 擋住玩家的牆改為半透明 */
const FADE_ALPHA = 0.35;
/** 玩家身體在畫面上的範圍（相對腳底，px），用來判斷是否被牆遮住 */
const OCCLUDE_HALF_WIDTH = 72;
const OCCLUDE_BELOW = 72;
/** 離玩家（畫面中心）多遠以外的牆不顯示（px） */
const CULL_X = 860;
const CULL_Y = 600;
/** 同一條對角線上，每幾格的牆合成一個物件 */
const CHUNK = 8;

interface WallChunk {
  graphics: Graphics;
  /** 中心的畫面座標（未加鏡頭位移） */
  screen: Vec2;
  depth: number;
}

interface Light {
  graphics: Graphics;
  phase: number;
}

/** 以格子座標產生的固定亂數（0～1）：同一張地圖每次畫出來都一樣 */
function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * 地板與牆壁（依地牢風格上色）：
 * - 地板：每格隨機深淺，不畫格線；依風格加上地毯、熔岩縫、苔蘚等
 * - 牆：只畫鄰接地板的牆（岩壁深處留黑），高度隨機、牆頂參差；同一條對角線上每 CHUNK 格合成一個物件，
 *   與角色一起依深度排序
 * - 光源：火把 / 燭光 / 熔岩 / 水晶，地上有光暈並閃爍
 */
export class TileMapView {
  readonly floor = new Graphics();
  private readonly walls: WallChunk[] = [];
  private readonly lights: Light[] = [];
  private readonly theme: ThemeColors;
  private time = 0;

  constructor(
    private readonly projection: IsoProjection,
    private readonly nav: NavGrid,
    private readonly objectLayer: Container,
    theme: DungeonTheme = 'crypt',
  ) {
    this.theme = THEMES[theme];
    const t = this.theme;
    const nearFloor = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (nav.isWalkable(x + dx, y + dy)) return true;
      return false;
    };
    const chunks = new Map<string, { g: Graphics; x: number; y: number; n: number }>();

    for (let y = 0; y < nav.height; y++) {
      for (let x = 0; x < nav.width; x++) {
        const walkable = nav.isWalkable(x, y);
        if (!walkable && !nearFloor(x, y)) continue;
        // 地板（牆底下也畫，牆變半透明時才不會露出背景）
        let color = mix(t.floorA, t.floorB, hash(x, y));
        if (walkable) color = this.floorAccent(x, y, color);
        this.floor.poly(this.corners(x, y)).fill({ color });
        if (walkable) {
          this.decorate(x, y);
          continue;
        }
        const key = `${x + y}:${Math.floor((x - y + nav.height) / CHUNK)}`;
        let chunk = chunks.get(key);
        if (!chunk) {
          chunk = { g: new Graphics(), x: 0, y: 0, n: 0 };
          chunks.set(key, chunk);
        }
        this.drawWall(chunk.g, x, y);
        chunk.x += x;
        chunk.y += y;
        chunk.n++;
      }
    }
    const c = nav.cell;
    for (const chunk of chunks.values()) {
      const cx = chunk.x / chunk.n;
      const cy = chunk.y / chunk.n;
      // 牆佔 [x·c, (x+1)·c)，以中心深度排序
      const depth = (cx + cy + 1) * c;
      chunk.g.zIndex = depth;
      objectLayer.addChild(chunk.g);
      this.walls.push({ graphics: chunk.g, screen: projection.toScreen(vec2((cx + 0.5) * c, (cy + 0.5) * c)), depth });
    }
  }

  /** 換樓層時移除地板、牆壁與光源 */
  destroy(): void {
    for (const wall of this.walls) wall.graphics.destroy();
    for (const light of this.lights) light.graphics.destroy();
    this.walls.length = 0;
    this.lights.length = 0;
    this.floor.destroy();
  }

  /** 牆：畫面外不顯示；在玩家前方、蓋住玩家身體的改為半透明；光源閃爍 */
  update(playerPos: Vec2, dt = 1 / 60): void {
    this.time += dt;
    const playerDepth = this.projection.depth(playerPos);
    const p = this.projection.toScreen(playerPos);
    for (const wall of this.walls) {
      const dy = wall.screen.y - p.y;
      const visible = Math.abs(wall.screen.x - p.x) < CULL_X && Math.abs(dy) < CULL_Y;
      wall.graphics.visible = visible;
      if (!visible) continue;
      const occludes = wall.depth > playerDepth && Math.abs(wall.screen.x - p.x) < OCCLUDE_HALF_WIDTH && dy > 0 && dy < OCCLUDE_BELOW;
      wall.graphics.alpha = occludes ? FADE_ALPHA : 1;
    }
    for (const light of this.lights) {
      light.graphics.alpha = 0.75 + 0.2 * Math.sin(this.time * 7 + light.phase) + 0.08 * Math.sin(this.time * 13.7 + light.phase * 2);
    }
  }

  /** 風格特有的地板色塊 */
  private floorAccent(x: number, y: number, color: number): number {
    const t = this.theme;
    const r = hash(x, y, 7);
    switch (t.decor) {
      case 'carpet':
        // 紅地毯：沿著一條條固定的走道
        return (x % 22 === 10 || x % 22 === 11) && hash(Math.floor(y / 30), x, 3) < 0.5 ? mix(t.accent, color, 0.15) : color;
      case 'cracks':
        return r < 0.035 ? mix(t.accent, color, 0.25) : color;
      case 'crystals':
        return r < 0.03 ? mix(t.accent, color, 0.5) : color;
      default:
        // 苔蘚 / 汙漬
        return r < 0.08 ? mix(t.accent, color, 0.4) : color;
    }
  }

  /** 地板上的裝飾與光源（固定亂數決定位置） */
  private decorate(x: number, y: number): void {
    const t = this.theme;
    const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !this.nav.isWalkable(x + dx!, y + dy!));
    const r = hash(x, y, 11);
    const c = this.nav.cell;
    const world = vec2((x + 0.5) * c, (y + 0.5) * c);
    const center = this.projection.toScreen(world);
    // 光源：牆邊的火把 / 燭台 / 水晶
    if (nearWall && r < 0.012 * t.lights) {
      const glow = new Graphics();
      glow.ellipse(center.x, center.y, 58, 29).fill({ color: t.glow, alpha: 0.07 });
      glow.ellipse(center.x, center.y, 34, 17).fill({ color: t.glow, alpha: 0.1 });
      glow.ellipse(center.x, center.y, 16, 8).fill({ color: t.glow, alpha: 0.14 });
      if (t.decor === 'crystals') glow.poly([center.x - 4, center.y, center.x, center.y - 14, center.x + 4, center.y]).fill({ color: t.glow, alpha: 0.9 });
      else glow.rect(center.x - 1, center.y - 12, 2, 10).fill({ color: 0x3a2a1a }).ellipse(center.x, center.y - 15, 3, 5).fill({ color: t.glow });
      glow.zIndex = this.projection.depth(world);
      this.objectLayer.addChild(glow);
      this.lights.push({ graphics: glow, phase: r * 100 });
      return;
    }
    // 小裝飾：碎石、骨頭、熔岩縫的亮點
    if (hash(x, y, 23) >= 0.02) return;
    if (t.decor === 'bones') {
      this.floor.poly([center.x - 5, center.y - 1, center.x + 5, center.y + 1, center.x + 5, center.y + 2.5, center.x - 5, center.y + 0.5]).fill({ color: 0xcfc6b0 });
    } else if (t.decor === 'cracks') {
      this.floor.poly([center.x - 7, center.y, center.x, center.y - 1.5, center.x + 7, center.y + 1, center.x, center.y + 1]).fill({ color: t.glow, alpha: 0.8 });
    } else {
      this.floor.poly([center.x - 3, center.y, center.x, center.y - 2.5, center.x + 3.5, center.y, center.x, center.y + 1.5]).fill({ color: mix(t.wallTop, 0x000000, 0.2) });
    }
  }

  /** 一格牆：左、右兩個面與頂面，高度與明暗依格子座標隨機 */
  private drawWall(g: Graphics, x: number, y: number): void {
    const t = this.theme;
    const [top, right, bottom, left] = this.cornerPoints(x, y);
    const h = WALL_HEIGHT + Math.floor(hash(x, y, 5) * WALL_JITTER);
    const up = (p: Vec2) => vec2(p.x, p.y - h);
    const flat = (...ps: Vec2[]) => ps.flatMap((p) => [p.x, p.y]);
    const shade = hash(x, y, 9) * 0.24 - 0.12;
    const tone = (color: number) => mix(color, shade > 0 ? 0xffffff : 0x000000, Math.abs(shade));
    g.poly(flat(left, bottom, up(bottom), up(left))).fill({ color: tone(t.wallLeft) });
    g.poly(flat(bottom, right, up(right), up(bottom))).fill({ color: tone(t.wallRight) });
    g.poly(flat(up(top), up(right), up(bottom), up(left))).fill({ color: tone(t.wallTop) });
  }

  /** 格子的四個角（上、右、下、左）的畫面座標 */
  private cornerPoints(x: number, y: number): [Vec2, Vec2, Vec2, Vec2] {
    const p = this.projection;
    const c = this.nav.cell;
    return [
      p.toScreen(vec2(x * c, y * c)),
      p.toScreen(vec2((x + 1) * c, y * c)),
      p.toScreen(vec2((x + 1) * c, (y + 1) * c)),
      p.toScreen(vec2(x * c, (y + 1) * c)),
    ];
  }

  private corners(x: number, y: number): number[] {
    return this.cornerPoints(x, y).flatMap((c) => [c.x, c.y]);
  }
}
