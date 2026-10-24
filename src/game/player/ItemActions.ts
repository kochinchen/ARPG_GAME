import type { GroundContent } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { Equipment } from '../items/Equipment';
import type { Inventory, InventoryEntry } from '../items/Inventory';
import type { ItemCursor } from '../items/ItemCursor';
import type { EquipmentSlot, ItemInstance } from '../items/ItemInstance';
import type { CoreInstance } from '../items/CoreInstance';

/** 熔核要從哪件裝備取下：背包某一格，或身上某個裝備欄 */
export type CoreHost = { kind: 'cell'; cell: number } | { kind: 'slot'; slot: EquipmentSlot };

/**
 * 背包 / 裝備欄的點擊規則（Diablo 式）：
 * - 手上沒東西：點背包格或裝備欄 → 拿起
 * - 手上有東西：點背包格 → 放下（有東西則互換、同種藥水合併）；點裝備欄 → 穿上（有裝備則互換）
 * - 手上有東西時點地面 → 丟在腳下
 * - 拿著熔核點有空孔的裝備（背包或身上）→ 鑲進去；右鍵有熔核的裝備 → 最後鑲的那顆放回背包（背包滿了才拿在手上；不需商人、不花錢）
 */
export class ItemActions {
  constructor(
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
    private readonly cursor: ItemCursor,
    private readonly events: GameEventBus,
    private readonly dropToGround: (content: GroundContent) => void,
    /** 物品的等級需求 → 是否符合 */
    private readonly meetsLevel: (baseId: string) => boolean,
  ) {}

  get holding(): boolean {
    return this.cursor.entry !== null;
  }

  clickInventory(cell: number): void {
    const held = this.cursor.take();
    if (!held) {
      const entry = this.inventory.take(cell);
      if (entry) this.cursor.set(entry);
      return;
    }
    const target = this.inventory.get(cell);
    if (held.kind === 'core' && target?.kind === 'item' && hasFreeSocket(target.item)) {
      this.inventory.take(cell);
      this.inventory.place(cell, { kind: 'item', item: withCores(target.item, [...target.item.sockets!.cores, held.core]) });
      this.events.emit('CoreSocketed', { action: 'insert' });
      return;
    }
    this.cursor.set(this.inventory.place(cell, held));
  }

  clickEquipment(slot: EquipmentSlot): void {
    const held = this.cursor.entry;
    if (!held) {
      const item = this.equipment.unequip(slot);
      if (item) this.cursor.set({ kind: 'item', item });
      return;
    }
    if (held.kind === 'core') {
      const item = this.equipment.get(slot);
      if (!item || !hasFreeSocket(item)) {
        this.events.emit('EquipFailed', { slot, reason: 'noSocket' });
        return;
      }
      this.cursor.take();
      this.equipment.setSockets(slot, { max: item.sockets!.max, cores: [...item.sockets!.cores, held.core] });
      this.events.emit('CoreSocketed', { action: 'insert' });
      return;
    }
    if (held.kind !== 'item' || !this.equipment.canEquip(held.item, slot)) {
      const shield = held.kind === 'item' && slot === 'shield' && this.equipment.slotsFor(held.item).includes('shield');
      this.events.emit('EquipFailed', { slot, reason: shield ? 'shield' : 'wrongSlot' });
      return;
    }
    if (!this.meetsLevel(held.item.baseId)) {
      this.events.emit('EquipFailed', { slot, reason: 'level' });
      return;
    }
    // 換成弓 / 法杖：盾牌放回背包（背包滿了就不換）
    if (this.equipment.conflictsWithShield(held.item)) {
      const shield = this.equipment.get('shield')!;
      if (!this.inventory.addItem(shield)) {
        this.events.emit('EquipFailed', { slot, reason: 'shield' });
        return;
      }
      this.equipment.unequip('shield');
    }
    this.cursor.take();
    const replaced = this.equipment.equipTo(slot, held.item);
    if (replaced) this.cursor.set({ kind: 'item', item: replaced });
  }

  /** 取下裝備上最後鑲入的熔核（孔保留）：放進背包，背包滿了才拿在手上（連按就一顆一顆取下）；背包滿、手上又有東西時不取 */
  /** index：取下第幾顆（觸控點選熔核）；省略 = 最後鑲入的那顆 */
  removeCore(from: CoreHost, index?: number): void {
    const item = from.kind === 'slot' ? this.equipment.get(from.slot) : itemIn(this.inventory.get(from.cell));
    const cores = item?.sockets?.cores ?? [];
    const at = index ?? cores.length - 1;
    const core = cores[at];
    if (!item || !core) return;
    // 背包滿了而且手上也拿著東西：放不下，不取
    if (this.inventory.isFull && this.cursor.entry) {
      this.events.emit('PickupFailed', { reason: 'inventoryFull' });
      return;
    }
    const rest = cores.filter((_, i) => i !== at);
    if (from.kind === 'slot') this.equipment.setSockets(from.slot, { max: item.sockets!.max, cores: rest });
    else {
      this.inventory.take(from.cell);
      this.inventory.place(from.cell, { kind: 'item', item: withCores(item, rest) });
    }
    if (!this.inventory.addCore(core)) this.cursor.set({ kind: 'core', core });
    this.events.emit('CoreSocketed', { action: 'remove' });
  }

  /** 把手上的東西丟在地上；手上沒東西時回傳 false */
  dropHeld(): boolean {
    const held = this.cursor.take();
    if (!held) return false;
    this.dropToGround(toGround(held));
    return true;
  }
}

function toGround(entry: InventoryEntry): GroundContent {
  if (entry.kind === 'item' || entry.kind === 'core') return entry;
  return { kind: 'potion', potionId: entry.potionId, count: entry.count };
}

function hasFreeSocket(item: ItemInstance): boolean {
  return !!item.sockets && item.sockets.cores.length < item.sockets.max;
}

function withCores(item: ItemInstance, cores: CoreInstance[]): ItemInstance {
  return { ...item, sockets: { max: item.sockets!.max, cores } };
}

function itemIn(entry: InventoryEntry | null): ItemInstance | undefined {
  return entry?.kind === 'item' ? entry.item : undefined;
}
