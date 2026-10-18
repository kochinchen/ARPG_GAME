import { distance, type Vec2 } from '../../core/math/Vec2';
import { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import { RARITIES, type ItemBaseDef, type MaterialId, type Rarity } from '../../data/schema/item';
import type { LegendaryKind } from '../../data/schema/legendary';
import type { Materials } from '../player/Materials';
import type { Actor } from '../entities/Actor';
import type { GameEventBus, GameEvents } from '../GameEvents';
import type { Wallet } from '../player/Wallet';
import type { Inventory, InventoryEntry } from './Inventory';
import type { ItemCursor } from './ItemCursor';
import { ItemGenerator } from './ItemGenerator';
import type { ItemInstance } from './ItemInstance';
import { epicTheme } from './ItemNamer';
import { buyPrice, gamblePrice, sellPrice } from './Pricing';
import { CORE_SLOTS, type CoreSlot } from '../../data/schema/core';
import type { CoreInstance } from './CoreInstance';
import { fuse, previewFusion, type FusionPreview } from './FusionResolver';

type ShopData = Pick<DataRegistry, 'balance' | 'items' | 'affixes' | 'legendaries' | 'potions' | 'cores'>;

export interface ShopContext {
  player: Actor;
  inventory: Inventory;
  cursor: ItemCursor;
  wallet: Wallet;
  /** 賭博用（與掉落共用流水號，uid 不重複） */
  generator: ItemGenerator;
  potionId: string;
  /** 材料（飛昇消耗精華與碎片） */
  materials: Materials;
  /** 融合擲骰（獨立序列） */
  fusionRng: Rng;
}

/** 飛昇的預覽：下一階基底與價格；不能飛昇時 next 為 null 並附上原因 */
export interface AscendInfo {
  next: ItemBaseDef | null;
  price: number;
  /** 需要的材料（精華、碎片） */
  materials: Partial<Record<MaterialId, number>>;
  reason: 'jewelry' | 'maxTier' | null;
}

/** 鑿孔 / 鑲嵌 / 拆卸的預覽（v0.5.0）：limit = 這個稀有度的孔數上限；drill = 下一孔的費用（不能鑿時為 null） */
export interface SocketInfo {
  socketable: boolean;
  limit: number;
  holes: number;
  cores: number;
  drill: { gold: number; essence: number } | null;
  insertPrice: number;
  removePrice: number;
}

/** 重鑄的一行：一般詞綴（affix）或傳奇 / 神話的固定屬性（legendary）；locked = 不能重鑄（紫裝決定名稱的強屬性） */
export interface RerollLine {
  index: number;
  kind: 'affix' | 'legendary';
  strong: boolean;
  locked: boolean;
  price: number;
}

/**
 * 出口旁的商人：買（每層固定的貨架 + 藥水）、賣（變成金幣）、賭博（指定類別，隨機稀有度）。
 * 交易必須站在商人附近。貨架由「世界種子 + 樓層」決定，已買走的位置記在存檔中。
 */
export class ShopSystem {
  /** 本層貨架；買走的位置為 null */
  stock: (ItemInstance | null)[] = [];
  /** 飛昇格：要飛昇的裝備（飛昇後留在原位，點一下拿回來） */
  ascendSlot: ItemInstance | null = null;
  /** 融合：合成區（武器）與飾品區（戒指 / 護身符，只提高印記機率）；格子裡的物品會存檔 */
  readonly fusionInputs: (ItemInstance | null)[];
  readonly fusionJewelry: (ItemInstance | null)[];
  /** 最近一次融合的結果（介面顯示揭曉動畫；關閉面板或收下後清除，不存檔） */
  lastFused: CoreInstance | null = null;
  /** 商人位置（樓梯口、中途存檔點、出口旁；共用同一家店） */
  private _positions: readonly Vec2[] = [];
  private floor = 0;
  private _version = 0;

  constructor(
    private readonly ctx: ShopContext,
    private readonly data: ShopData,
    private readonly events: GameEventBus,
  ) {
    this.fusionInputs = Array.from({ length: data.balance.fusion.inputs.max }, () => null);
    this.fusionJewelry = Array.from({ length: data.balance.fusion.jewelrySlots }, () => null);
  }

  get positions(): readonly Vec2[] {
    return this._positions;
  }

  /** 貨架或價格改變時遞增（UI 依此重建快照） */
  get version(): number {
    return this._version;
  }

  /** 已買走的貨架位置（存檔） */
  get boughtIndices(): number[] {
    return this.stock.flatMap((item, i) => (item === null ? [i] : []));
  }

  get gamblePrice(): number {
    return gamblePrice(this.floor, this.data);
  }

  get potionPrice(): number {
    return this.data.balance.shop.potionBuyPrice;
  }

  /** 進入樓層：擺攤並補貨（固定地圖模式傳空陣列 = 沒有商人）。每層只有一個貨架，任何一個商人都能交易 */
  open(floor: number, positions: readonly Vec2[], rng: Rng, bought: readonly number[] = []): void {
    this.floor = floor;
    this._positions = positions;
    const shop = this.data.balance.shop;
    // 貨架的孔數用另一條序列（由貨架種子推得，不改變貨架原本的內容）
    const generator = new ItemGenerator(this.data, rng, new Rng(rng.getState() ^ 0x50c4e7));
    this.stock = positions.length === 0 ? [] : Array.from({ length: shop.stockSize }, () => generator.generate(Math.max(1, floor), shop.stockRarityWeights));
    for (const i of bought) if (i < this.stock.length) this.stock[i] = null;
    this._version++;
  }

  /** 站在任何一個商人附近 */
  isNear(): boolean {
    const range = this.data.balance.shop.range;
    return this._positions.some((p) => distance(this.ctx.player.position, p) <= range);
  }

  buy(index: number): boolean {
    const item = this.stock[index];
    if (!item || !this.canTrade()) return false;
    const price = buyPrice(item, this.data);
    if (!this.pay(price) ) return false;
    const bought = { ...item, uid: this.ctx.generator.newUid() };
    if (!this.ctx.inventory.addItem(bought)) {
      this.ctx.wallet.add(price);
      this.fail('inventoryFull');
      return false;
    }
    this.stock[index] = null;
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'buy', gold: -price });
    return true;
  }

  buyPotions(count: number): boolean {
    if (count <= 0 || !this.canTrade()) return false;
    if (this.ctx.inventory.potionRoom(this.ctx.potionId) === 0) {
      this.fail('potionCap');
      return false;
    }
    const price = this.potionPrice * count;
    if (!this.pay(price)) return false;
    const added = this.ctx.inventory.addPotions(this.ctx.potionId, count);
    // 放不下的退錢
    if (added < count) this.ctx.wallet.add(this.potionPrice * (count - added));
    if (added === 0) {
      this.fail('inventoryFull');
      return false;
    }
    this.events.emit('ShopTransaction', { kind: 'buy', gold: -this.potionPrice * added });
    return true;
  }

  sellCell(cell: number): boolean {
    if (!this.canTrade()) return false;
    const entry = this.ctx.inventory.get(cell);
    if (!entry) return false;
    if (entry.kind === 'core') {
      this.fail('cannotSell');
      return false;
    }
    this.ctx.inventory.take(cell);
    this.receive(entry);
    return true;
  }

  sellHeld(): boolean {
    if (!this.canTrade() || !this.ctx.cursor.entry) return false;
    if (this.ctx.cursor.entry.kind === 'core') {
      this.fail('cannotSell');
      return false;
    }
    this.receive(this.ctx.cursor.take()!);
    return true;
  }

  /** 賣出背包裡所有稀有度不高於 maxRarity 的裝備（白 / 白＋藍 / 白＋藍＋黃） */
  sellUpTo(maxRarity: Rarity): boolean {
    if (!this.canTrade()) return false;
    const max = RARITIES.indexOf(maxRarity);
    let gold = 0;
    this.ctx.inventory.cells.forEach((entry, cell) => {
      if (entry?.kind !== 'item' || RARITIES.indexOf(entry.item.rarity) > max) return;
      this.ctx.inventory.take(cell);
      gold += sellPrice(entry, this.data);
    });
    if (gold === 0) return false;
    this.ctx.wallet.add(gold);
    this.events.emit('ShopTransaction', { kind: 'sell', gold });
    return true;
  }

  /** 重鑄預覽：每一行可以重鑄的詞綴與價格（橘 / 紅的特殊效果不能重鑄，只有固定屬性行可以重擲數值） */
  rerollLines(item: ItemInstance): RerollLine[] {
    const r = this.data.balance.shop.reroll;
    const price = (strong: boolean) =>
      Math.round((r.base + r.perItemLevel * item.itemLevel) * r.rarity[item.rarity] * (strong ? r.strong : 1) * (1 + r.perReroll * (item.rerolls ?? 0)));
    if (item.legendaryId && this.data.legendaries.has(item.legendaryId)) {
      const stats = this.data.legendaries.get(item.legendaryId).lines.filter((l) => l.type === 'stat');
      return stats.map((l, index) => ({ index, kind: 'legendary', strong: l.type === 'stat' && l.strong, locked: false, price: price(l.type === 'stat' && l.strong) }));
    }
    const base = this.data.items.get(item.baseId);
    // 紫裝：名稱決定的那一條強屬性不能重鑄（名字會對不上）
    const nameAffix = item.rarity === 'epic' ? epicTheme(item.uid, base)[1] : null;
    return item.affixes.map((a, index) => {
      const strong = this.data.affixes.has(a.id) && this.data.affixes.get(a.id).kind === 'strong';
      return { index, kind: 'affix', strong, locked: a.id === nameAffix, price: price(strong) };
    });
  }

  /** 重鑄飛昇格裡裝備的第 index 行：付金幣，詞綴重抽（橘 / 紅重擲固定屬性的數值），重鑄次數 +1 */
  reroll(index: number): boolean {
    if (!this.canTrade()) return false;
    const current = this.ascendSlot;
    const line = current ? this.rerollLines(current).find((l) => l.index === index) : undefined;
    if (!current || !line || line.locked) {
      this.fail('cannotReroll');
      return false;
    }
    if (!this.pay(line.price)) return false;
    const gen = this.ctx.generator;
    const rerolled = line.kind === 'legendary' ? gen.rerollLegendaryLine(current, index) : gen.rerollAffix(current, index);
    this.ascendSlot = { ...rerolled, rerolls: (current.rerolls ?? 0) + 1 };
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'reroll', gold: -line.price, rarity: current.rarity });
    return true;
  }

  /** 飛昇預覽：同種類（武器種類或部位）的下一階基底 */
  ascendInfo(item: ItemInstance): AscendInfo {
    const base = this.data.items.get(item.baseId);
    if (base.tier === undefined) return { next: null, price: 0, materials: {}, reason: 'jewelry' };
    const next = this.data.items.all.find((b) => b.tier === base.tier! + 1 && b.slot === base.slot && b.weaponType === base.weaponType) ?? null;
    if (!next) return { next: null, price: 0, materials: {}, reason: 'maxTier' };
    const a = this.data.balance.shop.ascend;
    const tier = next.tier!;
    const price = Math.round((a.base + a.perTier * tier) * a.rarity[item.rarity]);
    // 精華：武器用武器精華、防具用防具精華；第 shardFromTier 階起另外需要飛昇碎片
    const materials: Partial<Record<MaterialId, number>> = {
      [base.slot === 'weapon' ? 'weaponEssence' : 'armorEssence']: Math.round((a.essenceBase + a.essencePerTier * tier) * a.essenceRarity[item.rarity]),
    };
    if (tier >= a.shardFromTier) materials.ascensionShard = tier - a.shardFromTier + 1;
    return { next, price, materials, reason: null };
  }

  /**
   * 關閉商人面板時：鍛造格與融合格裡的裝備放回背包（背包滿了就由 drop 丟在腳下），避免裝備留在看不到的格子裡。
   * 回傳是否有放回。
   */
  returnForgeItems(drop: (item: ItemInstance) => void): boolean {
    if (this.lastFused) {
      this.lastFused = null;
      this._version++;
    }
    const items = [this.ascendSlot, ...this.fusionInputs, ...this.fusionJewelry].filter((i): i is ItemInstance => i !== null);
    if (items.length === 0) return false;
    this.ascendSlot = null;
    this.fusionInputs.fill(null);
    this.fusionJewelry.fill(null);
    for (const item of items) if (!this.ctx.inventory.addItem(item)) drop(item);
    this._version++;
    return true;
  }

  // ─────────────────────────── 融合（v0.5.0）───────────────────────────

  /** 點合成區（只能放武器）或飾品區（只能放非白的戒指 / 護身符）的格子：放進 / 互換 / 拿回 */
  clickFusionSlot(zone: 'inputs' | 'jewelry', index: number): void {
    const slots = zone === 'inputs' ? this.fusionInputs : this.fusionJewelry;
    if (index < 0 || index >= slots.length) return;
    const held = this.ctx.cursor.entry;
    if (held && held.kind !== 'item') return;
    if (held) {
      const base = this.data.items.get(held.item.baseId);
      const ok = zone === 'inputs' ? base.weaponType !== undefined : (base.slot === 'ring' || base.slot === 'amulet') && held.item.rarity !== 'normal';
      if (!ok) {
        this.fail('cannotFuse');
        return;
      }
    }
    const current = slots[index] ?? null;
    slots[index] = held?.kind === 'item' ? held.item : null;
    this.ctx.cursor.set(current ? { kind: 'item', item: current } : null);
    this._version++;
  }

  /** 收下融合結果（關掉揭曉畫面） */
  dismissFused(): void {
    if (!this.lastFused) return;
    this.lastFused = null;
    this._version++;
  }

  /** 融合預覽（目前融合格的內容；不擲骰） */
  fusionPreview(): FusionPreview {
    return previewFusion(this.filled(this.fusionInputs), this.filled(this.fusionJewelry), this.data);
  }

  /** 投入物中有傳奇 / 神話（要二次確認） */
  get fusionNeedsConfirm(): boolean {
    return [...this.fusionInputs, ...this.fusionJewelry].some((i) => i?.rarity === 'legendary' || i?.rarity === 'mythic');
  }

  /**
   * 融合：付金幣與武器精華，投入的武器與飾品消失，產出一顆熔核放進背包（滿了由 drop 丟在腳下）。
   * 有傳奇 / 神話投入時必須 confirmed。
   */
  fuse(confirmed: boolean, drop: (core: CoreInstance) => void): CoreInstance | null {
    if (!this.canTrade()) return null;
    const pv = this.fusionPreview();
    if (pv.problems.length > 0) {
      this.fail('cannotFuse');
      return null;
    }
    if (this.fusionNeedsConfirm && !confirmed) {
      this.fail('needsConfirm');
      return null;
    }
    const materials = { weaponEssence: pv.cost.essence };
    if (!this.ctx.materials.has(materials)) {
      this.fail('materials');
      return null;
    }
    if (!this.pay(pv.cost.gold)) return null;
    this.ctx.materials.spend(materials);
    const core = fuse(this.filled(this.fusionInputs), this.filled(this.fusionJewelry), this.data, this.ctx.fusionRng, this.ctx.generator.newUid());
    this.fusionInputs.fill(null);
    this.fusionJewelry.fill(null);
    if (!this.ctx.inventory.addCore(core)) drop(core);
    this.lastFused = core;
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'fuse', gold: -pv.cost.gold, rarity: core.rarity });
    this.events.emit('CoreFused', { uid: core.uid, rarity: core.rarity, tier: core.tier, branded: core.brand !== undefined });
    return core;
  }

  private filled(slots: readonly (ItemInstance | null)[]): ItemInstance[] {
    return slots.filter((i): i is ItemInstance => i !== null);
  }

  /** 飛昇格：拿著裝備點 → 放進去（有東西則互換）；空手點 → 拿回來。格子裡的裝備會存檔 */
  clickAscendSlot(): void {
    const held = this.ctx.cursor.entry;
    if (held && held.kind !== 'item') return;
    const current = this.ascendSlot;
    this.ascendSlot = held?.kind === 'item' ? held.item : null;
    this.ctx.cursor.set(current ? { kind: 'item', item: current } : null);
    this._version++;
  }

  /** 飛昇飛昇格裡的裝備：付金幣與材料，基底換成下一階（其他內容保留），結果留在飛昇格 */
  ascend(): boolean {
    if (!this.canTrade()) return false;
    const current = this.ascendSlot;
    if (!current) return false;
    const info = this.ascendInfo(current);
    if (!info.next || info.reason) {
      this.fail('cannotAscend');
      return false;
    }
    if (!this.ctx.materials.has(info.materials)) {
      this.fail('materials');
      return false;
    }
    if (!this.pay(info.price)) return false;
    this.ctx.materials.spend(info.materials);
    const item: ItemInstance = { ...current, baseId: info.next.id, itemLevel: Math.max(current.itemLevel, info.next.levelReq) };
    this.ascendSlot = item;
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'ascend', gold: -info.price, rarity: item.rarity });
    return true;
  }

  // ─────────────────────────── 鑲嵌（v0.5.0）───────────────────────────

  /** 鍛造格裡裝備的孔位資訊與費用 */
  socketInfo(item: ItemInstance): SocketInfo {
    const s = this.data.balance.sockets;
    const socketable = CORE_SLOTS.includes(this.data.items.get(item.baseId).slot as CoreSlot);
    const limit = socketable ? s.max[item.rarity] : 0;
    const holes = item.sockets?.max ?? 0;
    const n = holes + 1;
    return {
      socketable,
      limit,
      holes,
      cores: item.sockets?.cores.length ?? 0,
      drill: n <= limit ? { gold: s.drillGold * item.itemLevel * n, essence: s.drillEssence * n } : null,
      insertPrice: s.insertGold * item.itemLevel,
      removePrice: s.removeGold * item.itemLevel,
    };
  }

  /** 鑿孔：第 n 孔付金幣 drillGold × 物品等級 × n 與防具精華 drillEssence × n；不超過稀有度上限（紅裝不可） */
  drill(): boolean {
    if (!this.canTrade()) return false;
    const item = this.ascendSlot;
    const info = item ? this.socketInfo(item) : null;
    if (!item || !info?.drill) {
      this.fail('cannotDrill');
      return false;
    }
    const materials = { armorEssence: info.drill.essence };
    if (!this.ctx.materials.has(materials)) {
      this.fail('materials');
      return false;
    }
    if (!this.pay(info.drill.gold)) return false;
    this.ctx.materials.spend(materials);
    this.ascendSlot = { ...item, sockets: { max: info.holes + 1, cores: [...(item.sockets?.cores ?? [])] } };
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'drill', gold: -info.drill.gold, rarity: item.rarity });
    return true;
  }

  /** 鑲嵌：把背包某一格的熔核鑲進空孔（付金幣 insertGold × 物品等級）；鑲入後不能換，只能拆 */
  insertCore(cell: number): boolean {
    if (!this.canTrade()) return false;
    const item = this.ascendSlot;
    const entry = this.ctx.inventory.get(cell);
    const info = item ? this.socketInfo(item) : null;
    if (!item || !info || entry?.kind !== 'core' || info.cores >= info.holes) {
      this.fail('cannotInsert');
      return false;
    }
    if (!this.pay(info.insertPrice)) return false;
    this.ctx.inventory.take(cell);
    this.ascendSlot = { ...item, sockets: { max: info.holes, cores: [...item.sockets!.cores, entry.core] } };
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'insert', gold: -info.insertPrice, rarity: item.rarity });
    return true;
  }

  /** 拆卸：付金幣 removeGold × 物品等級；熔核毀掉、孔保留 */
  removeCore(index: number): boolean {
    if (!this.canTrade()) return false;
    const item = this.ascendSlot;
    const cores = item?.sockets?.cores ?? [];
    if (!item || index < 0 || index >= cores.length) return false;
    const price = this.socketInfo(item).removePrice;
    if (!this.pay(price)) return false;
    this.ascendSlot = { ...item, sockets: { max: item.sockets!.max, cores: cores.filter((_, i) => i !== index) } };
    this._version++;
    this.events.emit('ShopTransaction', { kind: 'remove', gold: -price, rarity: item.rarity });
    return true;
  }

  /** 賭博：付錢，得到一件指定種類（劍 / 斧 / 弓 / 法杖、防具與飾品部位）、隨機稀有度的物品 */
  gamble(kind: LegendaryKind): ItemInstance | null {
    if (!this.canTrade()) return null;
    if (this.ctx.inventory.isFull) {
      this.fail('inventoryFull');
      return null;
    }
    const price = this.gamblePrice;
    if (!this.pay(price)) return null;
    const item = this.ctx.generator.generateForKind(kind, Math.max(1, this.floor), this.data.balance.shop.gamble.rarityWeights);
    if (!item) {
      this.ctx.wallet.add(price);
      return null;
    }
    this.ctx.inventory.addItem(item);
    this.events.emit('ShopTransaction', { kind: 'gamble', gold: -price, rarity: item.rarity });
    return item;
  }

  private canTrade(): boolean {
    if (!this.ctx.player.alive) return false;
    if (this.isNear()) return true;
    this.fail('far');
    return false;
  }

  private pay(price: number): boolean {
    if (this.ctx.wallet.gold < price) {
      this.fail('gold');
      return false;
    }
    this.ctx.wallet.gold -= price;
    return true;
  }

  private receive(entry: InventoryEntry): void {
    const gold = sellPrice(entry, this.data);
    this.ctx.wallet.add(gold);
    this.events.emit('ShopTransaction', { kind: 'sell', gold });
  }

  private fail(reason: GameEvents['ShopFailed']['reason']): void {
    this.events.emit('ShopFailed', { reason });
  }
}
