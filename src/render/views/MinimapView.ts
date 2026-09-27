import { Container, Graphics } from 'pixi.js';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DungeonTheme } from '../../data/schema/floor';
import type { NavGrid } from '../../game/movement/NavGrid';
import { THEMES } from '../themes';

/** 走過的地方周圍多遠會被揭開（World 單位） */
const REVEAL_RADIUS = 9;
/** 小地圖：畫面右上角的大小（px）與比例（1 World 單位 = 幾 px，等角投影） */
const SMALL = { width: 220, height: 150, scale: 2.4 };
/** 全地圖（Tab）：畫面中央半透明 */
const LARGE_SCALE = 5.5;

export interface MinimapMarker {
  kind: 'stairs' | 'exit' | 'midway' | 'merchant';
  position: Vec2;
}

const MARKER_COLORS: Record<MinimapMarker['kind'], number> = {
  stairs: 0xc8a25a,
  exit: 0xb07cff,
  midway: 0x6fa8ff,
  merchant: 0x7fe07f,
};

/**
 * 迷霧探索的小地圖：一開始只顯示起始區域，走過的地方逐步揭開（本層結束前保留，不存檔）。
 * 以等角投影畫成菱形；右上角是以玩家為中心的小地圖，按 Tab 切換成畫面中央的全地圖。
 */
export class MinimapView {
  readonly container = new Container();
  private readonly frame = new Graphics();
  private readonly mask = new Graphics();
  private readonly content = new Container();
  private readonly terrain = new Graphics();
  private readonly markers = new Graphics();
  private readonly player = new Graphics();
  private revealed: Uint8Array;
  private readonly floorColor: number;
  private readonly wallColor: number;
  private large = false;
  private lastCell = { x: -999, y: -999 };

  constructor(
    private readonly nav: NavGrid,
    theme: DungeonTheme = 'crypt',
    private readonly screen: () => { width: number; height: number },
  ) {
    const t = THEMES[theme];
    this.floorColor = t.floorA + 0x181818;
    this.wallColor = t.wallTop;
    this.revealed = new Uint8Array(nav.width * nav.height);
    this.player.circle(0, 0, 3).fill({ color: 0xffffff }).stroke({ color: 0x000000, width: 1 });
    this.content.addChild(this.terrain, this.markers, this.player);
    this.container.addChild(this.frame, this.content, this.mask);
    this.content.mask = this.mask;
  }

  /** Tab：切換小地圖 / 全地圖 */
  toggle(): void {
    this.large = !this.large;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  update(playerPos: Vec2, markers: readonly MinimapMarker[]): void {
    this.reveal(playerPos);
    const scale = this.large ? LARGE_SCALE : SMALL.scale;
    const { width, height } = this.screen();
    const w = this.large ? width - 80 : SMALL.width;
    const h = this.large ? height - 160 : SMALL.height;
    const x0 = this.large ? 40 : width - SMALL.width - 12;
    const y0 = this.large ? 60 : 52;

    this.frame.clear();
    if (this.large) this.frame.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.55 });
    else this.frame.roundRect(x0 - 2, y0 - 2, w + 4, h + 4, 6).fill({ color: 0x000000, alpha: 0.55 }).stroke({ color: 0x3d342c, width: 1 });
    this.mask.clear().rect(x0, y0, w, h).fill({ color: 0xffffff });
    this.content.alpha = this.large ? 0.9 : 1;
    this.content.scale.set(scale);
    // 以玩家為中心
    const p = iso(playerPos);
    this.content.position.set(x0 + w / 2 - p.x * scale, y0 + h / 2 - p.y * scale);
    this.player.position.set(p.x, p.y);
    this.player.scale.set(1 / scale);

    this.markers.clear();
    for (const m of markers) {
      const cell = this.nav.cellOf(m.position);
      if (!this.revealed[cell.y * this.nav.width + cell.x]) continue;
      const s = iso(m.position);
      const r = 4 / scale;
      this.markers.poly([s.x, s.y - r * 1.4, s.x + r, s.y, s.x, s.y + r * 1.4, s.x - r, s.y]).fill({ color: MARKER_COLORS[m.kind] });
    }
  }

  /** 揭開玩家周圍的格子：新揭開的地板與牆邊畫到地形上 */
  private reveal(playerPos: Vec2): void {
    const nav = this.nav;
    const cell = nav.cellOf(playerPos);
    // 同一格內不重複計算
    if (cell.x === this.lastCell.x && cell.y === this.lastCell.y) return;
    this.lastCell = cell;
    const r = Math.ceil(REVEAL_RADIUS / nav.cell);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (!nav.inBounds(x, y) || this.revealed[y * nav.width + x]) continue;
        this.revealed[y * nav.width + x] = 1;
        const walkable = nav.isWalkable(x, y);
        // 牆只畫鄰接地板的邊，岩壁深處保持空白
        if (!walkable && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => nav.isWalkable(x + ex!, y + ey!))) continue;
        const c = nav.cell;
        const corners = [vec2(x * c, y * c), vec2((x + 1) * c, y * c), vec2((x + 1) * c, (y + 1) * c), vec2(x * c, (y + 1) * c)].flatMap((v) => {
          const s = iso(v);
          return [s.x, s.y];
        });
        this.terrain.poly(corners).fill({ color: walkable ? this.floorColor : this.wallColor });
      }
    }
  }
}

/** 小地圖的等角投影（1 World 單位：寬 1、高 0.5） */
function iso(p: Vec2): Vec2 {
  return vec2(p.x - p.y, (p.x + p.y) / 2);
}
