import { Container, Graphics, Text } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { Chest, ExitPortal, GroundItem, Interactable, Merchant, StairsUp } from '../../game/entities/Interactable';
import { MERCHANT } from '../figure/Merchant';
import { PolyFigure } from '../figure/PolyFigure';
import { describeItem } from '../../game/items/ItemDescriber';
import { FLOOR_COLORS, LOOT_COLORS, PALETTE, RARITY_COLORS } from '../palette';
import { LootBeam } from './LootBeam';

/** 名稱標籤離地面的高度（px） */
const LABEL_OFFSET = 18;
const LABEL_PAD = 4;
/** 標籤重疊時往上疊的間距（px） */
const LABEL_GAP = 2;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 地上圖示的點選範圍 */
const ICON_HIT: Rect = { x: -12, y: -14, width: 24, height: 18 };

interface View {
  container: Container;
  label: Text | null;
  labelBack: Graphics | null;
  /** 標籤因避開重疊而上移的距離（px） */
  labelShift: number;
  /** 點選範圍（相對 container，px）：標籤與圖示各一塊，避免上疊的標籤蓋住下面的標籤 */
  hit: Rect[];
  chest: { lid: Graphics; opened: boolean } | null;
  /** 地上裝備的稀有度光柱 */
  beam?: LootBeam;
  exit?: { portal: Graphics; open: boolean };
}

/**
 * 地上的物品（顯示名稱標籤，點標籤撿取）與寶箱。
 */
export class InteractableLayer {
  /** 地上物品的圖示，畫在角色下方 */
  readonly ground = new Container();
  /** 名稱標籤，畫在最上層避免被牆擋住 */
  readonly labels = new Container();
  private readonly views = new Map<number, View>();
  private hoveredId: number | null = null;
  /** 本層商人的多面體模型（待機動畫每幀更新） */
  private merchantFigure: PolyFigure | null = null;

  constructor(
    private readonly projection: IsoProjection,
    private readonly objectLayer: Container,
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'potions'>,
  ) {}

  setHovered(id: number | null): void {
    this.hoveredId = id;
  }

  /** 游標下的互動物件；s 為 World 圖層內的畫面座標 */
  pickAt(s: Vec2, items: readonly Interactable[]): number | null {
    // 後畫的在上面，從後往前找
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      const view = this.views.get(item.id);
      if (!view) continue;
      const dx = s.x - view.container.x;
      const dy = s.y - view.container.y;
      if (view.hit.some((r) => dx >= r.x && dx <= r.x + r.width && dy >= r.y && dy <= r.y + r.height)) return item.id;
    }
    return null;
  }

  update(
    groundItems: readonly GroundItem[],
    chests: readonly Chest[],
    exit: ExitPortal | null = null,
    nextFloor = 0,
    stairsUp: StairsUp | null = null,
    merchant: Merchant | null = null,
    dt = 1 / 60,
  ): void {
    const seen = new Set<number>();
    let changed = false;
    for (const g of groundItems) {
      seen.add(g.id);
      let view = this.views.get(g.id);
      if (!view) {
        view = this.createGroundView(g);
        changed = true;
      }
      view.beam?.update(dt);
      this.highlight(view, g.id);
    }
    if (exit) {
      seen.add(exit.id);
      const view = this.views.get(exit.id) ?? this.createExitView(exit);
      if (view.exit && view.exit.open !== exit.open) this.drawExit(view, exit.open, nextFloor);
      if (view.exit) view.exit.portal.alpha = exit.open ? 0.75 + 0.25 * Math.sin(performance.now() / 250) : 1;
      this.highlight(view, exit.id);
    }
    if (merchant) {
      seen.add(merchant.id);
      const view = this.views.get(merchant.id) ?? this.createMerchantView(merchant);
      this.highlight(view, merchant.id);
      // 商人面向鏡頭（畫面下方）
      this.merchantFigure?.update(dt, { facing: { x: 1, y: 1 }, moving: false, alive: true });
    }
    if (stairsUp) {
      seen.add(stairsUp.id);
      const view = this.views.get(stairsUp.id) ?? this.createStairsView(stairsUp, nextFloor - 2);
      this.highlight(view, stairsUp.id);
    }
    for (const c of chests) {
      seen.add(c.id);
      const view = this.views.get(c.id) ?? this.createChestView(c);
      if (view.chest && view.chest.opened !== c.opened) this.drawLid(view.chest, c.opened);
      view.container.alpha = c.opened ? 0.7 : 1;
      this.highlight(view, c.opened ? null : c.id);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.container.destroy({ children: true });
      view.label?.destroy();
      view.labelBack?.destroy();
      this.views.delete(id);
      changed = true;
    }
    if (changed) this.layoutLabels(groundItems);
  }

  /**
   * 標籤重疊時往上疊（Diablo 式），點選範圍跟著移動。
   * 依 ID 順序排列，先掉落的保持原位，畫面不會因新掉落物而跳動。
   */
  private layoutLabels(groundItems: readonly GroundItem[]): void {
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const g of [...groundItems].sort((a, b) => a.id - b.id)) {
      const view = this.views.get(g.id);
      if (!view?.label || !view.labelBack) continue;
      const width = view.label.width + LABEL_PAD * 2;
      const height = view.label.height + LABEL_PAD;
      const left = view.container.x - width / 2;
      let bottom = view.container.y - LABEL_OFFSET + LABEL_PAD / 2;
      let rect = { left, right: left + width, top: bottom - height, bottom };
      for (let guard = 0; guard < 50; guard++) {
        const hit = placed.find((p) => rect.left < p.right && rect.right > p.left && rect.top < p.bottom && rect.bottom > p.top);
        if (!hit) break;
        bottom = hit.top - LABEL_GAP;
        rect = { left, right: left + width, top: bottom - height, bottom };
      }
      placed.push(rect);
      view.labelShift = view.container.y - LABEL_OFFSET + LABEL_PAD / 2 - bottom;
      view.label.y = view.container.y - LABEL_OFFSET - view.labelShift;
      view.labelBack.y = view.label.y;
      view.hit = [{ x: -width / 2, y: rect.top - view.container.y, width, height }, ICON_HIT];
    }
  }

  private highlight(view: View, id: number | null): void {
    const hovered = id !== null && id === this.hoveredId;
    if (view.labelBack) view.labelBack.alpha = hovered ? 0.9 : 0.55;
    if (view.chest) view.chest.lid.tint = hovered ? 0xffe6a0 : 0xffffff;
  }

  private createGroundView(g: GroundItem): View {
    const { text, color } = this.describe(g);
    const s = this.projection.toScreen(g.position);
    const container = new Container();
    container.position.set(s.x, s.y);
    // 裝備：稀有度光柱（畫在圖示後面）
    let beam: LootBeam | undefined;
    if (g.content.kind === 'item') {
      beam = new LootBeam(g.content.item.rarity);
      container.addChild(beam.container);
    }
    const icon = new Graphics();
    if (g.content.kind === 'potion') icon.roundRect(-4, -12, 8, 12, 3).fill({ color: LOOT_COLORS.potion });
    else if (g.content.kind === 'gold') icon.ellipse(0, -2, 8, 4).fill({ color: LOOT_COLORS.gold });
    else icon.poly([0, -8, 10, -3, 0, 2, -10, -3]).fill({ color }).stroke({ color: 0x000000, width: 1 });
    container.addChild(icon);
    this.ground.addChild(container);

    const label = new Text({ text, style: { fontFamily: 'sans-serif', fontSize: 12, fill: color } });
    label.anchor.set(0.5, 1);
    label.position.set(s.x, s.y - LABEL_OFFSET);
    const pad = LABEL_PAD;
    const labelBack = new Graphics()
      .rect(-label.width / 2 - pad, -label.height - pad / 2, label.width + pad * 2, label.height + pad)
      .fill({ color: LOOT_COLORS.labelBack });
    labelBack.position.copyFrom(label.position);
    this.labels.addChild(labelBack, label);

    const view: View = {
      container,
      label,
      labelBack,
      labelShift: 0,
      chest: null,
      // 標籤與圖示都可以點（位置由 layoutLabels 決定）
      hit: [ICON_HIT],
      ...(beam ? { beam } : {}),
    };
    this.views.set(g.id, view);
    return view;
  }

  private createChestView(c: Chest): View {
    const s = this.projection.toScreen(c.position);
    const container = new Container();
    container.position.set(s.x, s.y);
    container.zIndex = this.projection.depth(c.position);
    const body = new Graphics()
      .ellipse(0, 2, 20, 9)
      .fill({ color: PALETTE.shadow, alpha: 0.4 })
      .rect(-16, -18, 32, 18)
      .fill({ color: LOOT_COLORS.chest })
      .stroke({ color: LOOT_COLORS.chestDark, width: 2 });
    const lid = new Graphics();
    container.addChild(body, lid);
    this.objectLayer.addChild(container);
    const chest = { lid, opened: c.opened };
    this.drawLid(chest, c.opened);
    const view: View = { container, label: null, labelBack: null, labelShift: 0, chest, hit: [{ x: -20, y: -34, width: 40, height: 40 }] };
    this.views.set(c.id, view);
    return view;
  }

  private createExitView(exit: ExitPortal): View {
    const s = this.projection.toScreen(exit.position);
    const container = new Container();
    container.position.set(s.x, s.y);
    container.zIndex = this.projection.depth(exit.position) - 0.5;
    const portal = new Graphics();
    container.addChild(portal);
    this.objectLayer.addChild(container);
    const label = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xffffff } });
    label.anchor.set(0.5, 1);
    label.position.set(s.x, s.y - 58);
    const labelBack = new Graphics();
    labelBack.position.copyFrom(label.position);
    this.labels.addChild(labelBack, label);
    const view: View = { container, label, labelBack, labelShift: 0, chest: null, exit: { portal, open: !exit.open }, hit: [{ x: -26, y: -56, width: 52, height: 64 }] };
    this.views.set(exit.id, view);
    this.drawExit(view, exit.open, 0);
    return view;
  }

  /** 商人：多面體的商人與小攤（面向鏡頭），標籤「商人」 */
  private createMerchantView(merchant: Merchant): View {
    const s = this.projection.toScreen(merchant.position);
    const container = new Container();
    container.position.set(s.x, s.y);
    container.zIndex = this.projection.depth(merchant.position);
    const shadow = new Graphics().ellipse(0, 4, 26, 13).fill({ color: 0x000000, alpha: 0.4 });
    this.merchantFigure = new PolyFigure(MERCHANT);
    container.addChild(shadow, this.merchantFigure.graphics);
    this.objectLayer.addChild(container);
    const label = new Text({ text: '商人', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xe8c47a } });
    label.anchor.set(0.5, 1);
    label.position.set(s.x, s.y - 70);
    const labelBack = new Graphics();
    labelBack.position.copyFrom(label.position);
    const pad = LABEL_PAD;
    labelBack
      .rect(-label.width / 2 - pad, -label.height - pad / 2, label.width + pad * 2, label.height + pad)
      .fill({ color: LOOT_COLORS.labelBack, alpha: 0.55 });
    this.labels.addChild(labelBack, label);
    const view: View = { container, label, labelBack, labelShift: 0, chest: null, hit: [{ x: -30, y: -86, width: 60, height: 100 }] };
    this.views.set(merchant.id, view);
    return view;
  }

  /** 往上的樓梯：樓梯口旁的石階，標籤「往上 → 第 N 層」 */
  private createStairsView(stairs: StairsUp, floor: number): View {
    const s = this.projection.toScreen(stairs.position);
    const container = new Container();
    container.position.set(s.x, s.y);
    container.zIndex = this.projection.depth(stairs.position) - 0.6;
    const steps = new Graphics();
    for (let i = 0; i < 3; i++) {
      steps
        .rect(-14 + i * 3, -8 - i * 7, 28 - i * 6, 7)
        .fill({ color: FLOOR_COLORS.stairs, alpha: 0.85 - i * 0.15 })
        .stroke({ color: 0x3a2e1a, width: 1 });
    }
    steps.poly([0, -40, -7, -31, 7, -31]).fill({ color: 0xf2e2b8 });
    steps.position.set(0, -6);
    container.addChild(steps);
    this.objectLayer.addChild(container);
    const label = new Text({ text: `往上 → 第 ${floor} 層`, style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xf2e2b8 } });
    label.anchor.set(0.5, 1);
    label.position.set(s.x, s.y - 50);
    const labelBack = new Graphics();
    labelBack.position.copyFrom(label.position);
    const pad = LABEL_PAD;
    labelBack
      .rect(-label.width / 2 - pad, -label.height - pad / 2, label.width + pad * 2, label.height + pad)
      .fill({ color: LOOT_COLORS.labelBack, alpha: 0.55 });
    this.labels.addChild(labelBack, label);
    const view: View = {
      container,
      label,
      labelBack,
      labelShift: 0,
      chest: null,
      hit: [{ x: -label.width / 2 - pad, y: -50 - label.height - pad / 2, width: label.width + pad * 2, height: label.height + pad }],
    };
    this.views.set(stairs.id, view);
    return view;
  }

  /** 出口：未開啟為暗色石門；開啟後為發光的傳送門 */
  private drawExit(view: View, open: boolean, nextFloor: number): void {
    const exit = view.exit!;
    exit.open = open;
    const color = open ? FLOOR_COLORS.exitOpen : FLOOR_COLORS.exitClosed;
    exit.portal
      .clear()
      .ellipse(0, 0, 26, 13)
      .fill({ color: 0x000000, alpha: 0.5 })
      .roundRect(-18, -52, 36, 52, 16)
      .fill({ color, alpha: open ? 0.55 : 0.9 })
      .stroke({ color: open ? 0xe0c8ff : 0x2a2632, width: 2 });
    const label = view.label!;
    label.text = open ? (nextFloor > 0 ? `出口 → 第 ${nextFloor} 層` : '出口') : '出口（未開啟）';
    label.style.fill = open ? 0xe0c8ff : 0x8a8498;
    const pad = LABEL_PAD;
    view.labelBack!
      .clear()
      .rect(-label.width / 2 - pad, -label.height - pad / 2, label.width + pad * 2, label.height + pad)
      .fill({ color: LOOT_COLORS.labelBack, alpha: 0.55 });
  }

  private drawLid(chest: { lid: Graphics; opened: boolean }, opened: boolean): void {
    chest.opened = opened;
    chest.lid.clear();
    if (opened) chest.lid.rect(-16, -32, 32, 8).fill({ color: LOOT_COLORS.chestDark });
    else
      chest.lid
        .roundRect(-17, -26, 34, 10, 4)
        .fill({ color: LOOT_COLORS.chest })
        .stroke({ color: LOOT_COLORS.chestTrim, width: 2 });
  }

  private describe(g: GroundItem): { text: string; color: number } {
    switch (g.content.kind) {
      case 'item': {
        const d = describeItem(g.content.item, this.data);
        return { text: d.name, color: RARITY_COLORS[d.rarity] ?? 0xffffff };
      }
      case 'potion': {
        const name = this.data.potions.get(g.content.potionId).name;
        return { text: g.content.count > 1 ? `${name} ×${g.content.count}` : name, color: LOOT_COLORS.potion };
      }
      case 'gold':
        return { text: `${g.content.amount} 金幣`, color: LOOT_COLORS.gold };
    }
  }
}
