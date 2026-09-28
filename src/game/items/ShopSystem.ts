import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import type { ItemBaseDef, MaterialId } from '../../data/schema/item';
import type { LegendaryKind } from '../../data/schema/legendary';
import type { Materials } from '../player/Materials';
import type { Actor } from '../entities/Actor';
import type { GameEventBus, GameEvents } from '../GameEvents';
import type { Wallet } from '../player/Wallet';
import type { Inventory, InventoryEntry } from './Inventory';
import type { ItemCursor } from './ItemCursor';
import { ItemGenerator } from './ItemGenerator';
import type { ItemInstance } from './ItemInstance';
import { buyPrice, gamblePrice, sellPrice } from './Pricing';

type ShopData = Pick<DataRegistry, 'balance' | 'items' | 'affixes' | 'legendaries' | 'potions'>;

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
}

/** 飛昇的預覽：下一階基底與價格；不能飛昇時 next 為 null 並附上原因 */
export interface AscendInfo {
  next: ItemBaseDef | null;
  price: number;
  /** 需要的材料（精華、碎片） */
  materials: Partial<Record<MaterialId, number>>;
  reason: 'jewelry' | 'maxTier' | null;
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
  /** 商人位置（樓梯口、中途存檔點、出口旁；共用同一家店） */
  private _positions: readonly Vec2[] = [];
  private floor = 0;
  private _version = 0;

  constructor(
    private readonly ctx: ShopContext,
    private readonly data: ShopData,
    private readonly events: GameEventBus,
  ) {}

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
    const generator = new ItemGenerator(this.data, rng);
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
    this.ctx.inventory.take(cell);
    this.receive(entry);
    return true;
  }

  sellHeld(): boolean {
    if (!this.canTrade() || !this.ctx.cursor.entry) return false;
    this.receive(this.ctx.cursor.take()!);
    return true;
  }

  /** 賣出背包裡所有普通（白色）裝備 */
  sellNormals(): boolean {
    if (!this.canTrade()) return false;
    let gold = 0;
    this.ctx.inventory.cells.forEach((entry, cell) => {
      if (entry?.kind !== 'item' || entry.item.rarity !== 'normal') return;
      this.ctx.inventory.take(cell);
      gold += sellPrice(entry, this.data);
    });
    if (gold === 0) return false;
    this.ctx.wallet.add(gold);
    this.events.emit('ShopTransaction', { kind: 'sell', gold });
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
