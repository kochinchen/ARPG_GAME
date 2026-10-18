import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { EquipSlot, WeaponType } from '../../data/schema/item';
import type { EquipmentSlot, ItemInstance } from './ItemInstance';
import { itemStats } from './ItemStats';

/**
 * 裝備欄位。穿上時把基底屬性與詞綴轉成 StatModifier 加到角色身上，脫下時整批移除。
 */
export class Equipment {
  private readonly slots = new Map<EquipmentSlot, ItemInstance>();
  private _version = 0;

  constructor(
    private readonly owner: Actor,
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>,
    private readonly events: GameEventBus,
  ) {}

  get(slot: EquipmentSlot): ItemInstance | undefined {
    return this.slots.get(slot);
  }

  get version(): number {
    return this._version;
  }

  /** 物品可以穿在哪些欄位（戒指有兩格） */
  slotsFor(item: ItemInstance): EquipmentSlot[] {
    return slotsForBase(this.data.items.get(item.baseId).slot);
  }

  canEquip(item: ItemInstance, slot: EquipmentSlot): boolean {
    if (!this.slotsFor(item).includes(slot)) return false;
    // 盾牌只能和劍、斧一起裝備
    return slot !== 'shield' || shieldAllowed(this.weaponType());
  }

  /** 換上這把武器時，身上的盾牌必須卸下（弓、法杖要用雙手） */
  conflictsWithShield(item: ItemInstance): boolean {
    const base = this.data.items.get(item.baseId);
    return base.slot === 'weapon' && this.slots.has('shield') && !shieldAllowed(base.weaponType);
  }

  /** 目前武器的種類（空手 = undefined） */
  weaponType(): WeaponType | undefined {
    const weapon = this.slots.get('weapon');
    return weapon ? this.data.items.get(weapon.baseId).weaponType : undefined;
  }

  /** 物品會放進哪一格：戒指優先放空的那一格 */
  slotFor(item: ItemInstance): EquipmentSlot {
    const slot = this.data.items.get(item.baseId).slot;
    if (slot !== 'ring') return slot;
    if (!this.slots.has('ring1')) return 'ring1';
    if (!this.slots.has('ring2')) return 'ring2';
    return 'ring1';
  }

  /** 穿上物品（自動選欄位），回傳被替換下來的物品（沒有則 null） */
  equip(item: ItemInstance): ItemInstance | null {
    return this.equipTo(this.slotFor(item), item);
  }

  /** 穿到指定欄位；欄位不符時丟錯（呼叫前應先檢查 canEquip） */
  equipTo(slot: EquipmentSlot, item: ItemInstance): ItemInstance | null {
    if (!this.canEquip(item, slot)) throw new Error(`${item.baseId} cannot be equipped in ${slot}`);
    const replaced = this.unequip(slot);
    this.slots.set(slot, item);
    this.applyModifiers(item);
    this._version++;
    this.events.emit('ItemEquipped', { uid: item.uid, slot });
    return replaced;
  }

  unequip(slot: EquipmentSlot): ItemInstance | null {
    const item = this.slots.get(slot);
    if (!item) return null;
    this.slots.delete(slot);
    this.owner.stats.removeBySource(sourceOf(item));
    this.clampResources();
    this._version++;
    this.events.emit('ItemUnequipped', { uid: item.uid, slot });
    return item;
  }

  private applyModifiers(item: ItemInstance): void {
    const source = sourceOf(item);
    const stats = itemStats(item, this.data);
    for (const [stat, value] of Object.entries(stats.baseStats) as [StatId, number][]) {
      this.owner.stats.addModifier({ stat, kind: 'flat', value, source });
    }
    // 盾擊的傷害基準：盾牌本身的防禦（含主倍率，不含其他部位與詞綴）
    if (stats.base.slot === 'shield' && stats.baseStats.defense) {
      this.owner.stats.addModifier({ stat: 'shieldDefense', kind: 'flat', value: stats.baseStats.defense, source });
    }
    for (const { def, value } of stats.affixes) {
      this.owner.stats.addModifier({ stat: def.stat, kind: def.modifier, value, source });
    }
  }

  /** 上限降低時，目前 HP / MP 不超過新的上限 */
  private clampResources(): void {
    this.owner.hp = Math.min(this.owner.hp, this.owner.maxHp);
    this.owner.mana = Math.min(this.owner.mana, this.owner.maxMana);
  }
}

const sourceOf = (item: ItemInstance) => `item:${item.uid}`;

/** 盾牌：只能和劍、斧一起裝備（近戰的好處） */
export function shieldAllowed(weapon: WeaponType | undefined): boolean {
  return weapon === 'sword' || weapon === 'axe';
}

export function slotsForBase(slot: EquipSlot): EquipmentSlot[] {
  return slot === 'ring' ? ['ring1', 'ring2'] : [slot];
}
