import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import type { EquipSlot } from '../../data/schema/item';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { Wallet } from '../player/Wallet';
import type { Inventory, InventoryEntry } from './Inventory';
import type { ItemCursor } from './ItemCursor';
import { ItemGenerator } from './ItemGenerator';
import type { ItemInstance } from './ItemInstance';
import { buyPrice, gamblePrice, sellPrice } from './Pricing';

type ShopData = Pick<DataRegistry, 'balance' | 'items' | 'affixes' | 'potions'>;

export interface ShopContext {
  player: Actor;
  inventory: Inventory;
  cursor: ItemCursor;
  wallet: Wallet;
  /** 賭博用（與掉落共用流水號，uid 不重複） */
  generator: ItemGenerator;
  potionId: string;
}

/**
 * 出口旁的商人：買（每層固定的貨架 + 藥水）、賣（變成金幣）、賭博（指定類別，隨機稀有度）。
 * 交易必須站在商人附近。貨架由「世界種子 + 樓層」決定，已買走的位置記在存檔中。
 */
export class ShopSystem {
  /** 本層貨架；買走的位置為 null */
  stock: (ItemInstance | null)[] = [];
  private _position: Vec2 | null = null;
  private floor = 0;
  private _version = 0;

  constructor(
    private readonly ctx: ShopContext,
    private readonly data: ShopData,
    private readonly events: GameEventBus,
  ) {}

  get position(): Vec2 | null {
    return this._position;
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

  /** 進入樓層：擺攤並補貨（固定地圖模式傳 null = 沒有商人） */
  open(floor: number, position: Vec2 | null, rng: Rng, bought: readonly number[] = []): void {
    this.floor = floor;
    this._position = position;
    const shop = this.data.balance.shop;
    const generator = new ItemGenerator(this.data, rng);
    this.stock = position === null ? [] : Array.from({ length: shop.stockSize }, () => generator.generate(Math.max(1, floor), shop.stockRarityWeights));
    for (const i of bought) if (i < this.stock.length) this.stock[i] = null;
    this._version++;
  }

  isNear(): boolean {
    return this._position !== null && distance(this.ctx.player.position, this._position) <= this.data.balance.shop.range;
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

  /** 賭博：付錢，得到一件指定類別、隨機稀有度的物品 */
  gamble(slot: EquipSlot): ItemInstance | null {
    if (!this.canTrade()) return null;
    if (this.ctx.inventory.isFull) {
      this.fail('inventoryFull');
      return null;
    }
    const price = this.gamblePrice;
    if (!this.pay(price)) return null;
    const item = this.ctx.generator.generateForSlot(slot, Math.max(1, this.floor), this.data.balance.shop.gamble.rarityWeights);
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

  private fail(reason: 'gold' | 'inventoryFull' | 'far'): void {
    this.events.emit('ShopFailed', { reason });
  }
}
