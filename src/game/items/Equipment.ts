import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { EquipSlot, WeaponType } from '../../data/schema/item';
import type { EquipmentSlot, ItemInstance } from './ItemInstance';
import type { Sockets } from './CoreInstance';
import { itemStats } from './ItemStats';
import { CORE_SLOTS } from '../../data/schema/core';
import { coreEffects, type CoreEffects, type SocketedCore } from './CoreStats';
import { socketBonus } from './SocketBonus';

const CORE_SOURCE = 'cores';
const NO_CORES: CoreEffects = { stats: [], mechanics: [], capped: [] };

/**
 * 裝備欄位。穿上時把基底屬性與詞綴轉成 StatModifier 加到角色身上，脫下時整批移除。
 */
export class Equipment {
  private readonly slots = new Map<EquipmentSlot, ItemInstance>();
  private _version = 0;
  private _cores: CoreEffects = NO_CORES;
  private _coreVersion = 0;

  constructor(
    private readonly owner: Actor,
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries' | 'balance' | 'cores'>,
    private readonly events: GameEventBus,
  ) {}

  get(slot: EquipmentSlot): ItemInstance | undefined {
    return this.slots.get(slot);
  }

  get version(): number {
    return this._version;
  }

  /** 全身熔核的效果（屬性已加到角色身上；技能加成與印記由 ItemEffectSystem 讀取） */
  get cores(): CoreEffects {
    return this._cores;
  }

  /** 熔核效果每次重算就增加（ItemEffectSystem 據此重建機制） */
  get coreVersion(): number {
    return this._coreVersion;
  }

  /** 目前裝備上所有鑲入的熔核（只有可鑲嵌的部位） */
  socketedCores(): SocketedCore[] {
    return CORE_SLOTS.flatMap((slot) => {
      const item = this.slots.get(slot);
      const bonus = socketBonus(item?.sockets, this.data.balance);
      const matchedHoles = bonus > 1 ? item!.sockets!.max : 0;
      return (item?.sockets?.cores ?? []).map((core) => ({ slot, core, bonus, matchedHoles }));
    });
  }

  /**
   * 重算全身熔核：全身上限要看所有部位，所以整批移除再加回（穿脫裝備、鑲嵌、拆卸後呼叫）。
   */
  refreshCores(): void {
    this.owner.stats.removeBySource(CORE_SOURCE);
    const cores = this.socketedCores();
    this._cores = cores.length === 0 ? NO_CORES : coreEffects(cores, this.data);
    for (const { stat, kind, value } of this._cores.stats) this.owner.stats.addModifier({ stat, kind, value, source: CORE_SOURCE });
    this._coreVersion++;
    this.clampResources();
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
    if (item.sockets?.cores.length) this.refreshCores();
    this._version++;
    this.events.emit('ItemEquipped', { uid: item.uid, slot });
    return replaced;
  }

  unequip(slot: EquipmentSlot): ItemInstance | null {
    const item = this.slots.get(slot);
    if (!item) return null;
    this.slots.delete(slot);
    this.owner.stats.removeBySource(sourceOf(item));
    if (item.sockets?.cores.length) this.refreshCores();
    this.clampResources();
    this._version++;
    this.events.emit('ItemUnequipped', { uid: item.uid, slot });
    return item;
  }

  /** 鑲嵌 / 取下熔核：換掉身上這件裝備的孔位內容（武器傷害 +% 會變，所以這件裝備的屬性也重加） */
  setSockets(slot: EquipmentSlot, sockets: Sockets): void {
    const item = this.slots.get(slot);
    if (!item) return;
    const next = { ...item, sockets };
    this.slots.set(slot, next);
    this.owner.stats.removeBySource(sourceOf(item));
    this.applyModifiers(next);
    this.refreshCores();
    this._version++;
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
