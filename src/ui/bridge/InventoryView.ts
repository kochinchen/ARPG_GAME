import type { DataRegistry } from '../../data/DataRegistry';
import { MATERIAL_IDS, MATERIAL_LABELS, type MaterialId, type Rarity } from '../../data/schema/item';
import type { GameWorld } from '../../game/GameWorld';
import { slotsForBase } from '../../game/items/Equipment';
import type { InventoryEntry } from '../../game/items/Inventory';
import { describeItem, formatValue, SLOT_LABELS, STAT_LABELS } from '../../game/items/ItemDescriber';
import { EQUIPMENT_SLOTS, type EquipmentSlot, type ItemInstance } from '../../game/items/ItemInstance';
import { itemValue, sellPrice } from '../../game/items/Pricing';
import { affixTier } from '../../game/items/ItemGenerator';

export type { EquipmentSlot };

/** 格子裡顯示的內容（M8 換成圖示前先用單字代表） */
export interface EntryView {
  kind: 'item' | 'potion';
  name: string;
  rarity: Rarity;
  glyph: string;
  slotLabel: string;
  baseLines: string[];
  /** 主倍率（例如「武器傷害 +180%」） */
  mainLine: string | null;
  /** 強屬性 */
  strongLines: string[];
  /** 傳奇 / 神話：定位、固定行、介紹 */
  legendary: { role: string; lore: string; lines: { text: string; kind: 'normal' | 'strong' | 'unique' }[] } | null;
  affixLines: string[];
  /** 物品可以穿在哪些裝備欄（比較用） */
  equipSlots: EquipmentSlot[];
  count: number;
  /** 物品等級（藥水為 0） */
  itemLevel: number;
  /** 詞綴階級（T1～T5；藥水為 0） */
  tier: number;
  /** 賣給商人的價格 */
  sellPrice: number;
}

export interface InventoryView {
  cols: number;
  rows: number;
  cells: (EntryView | null)[];
  equipment: { slot: EquipmentSlot; label: string; item: EntryView | null }[];
  /** 滑鼠上拿著的物品 */
  held: EntryView | null;
  stats: { label: string; value: string }[];
  /** 拆解區的格子 */
  salvage: (EntryView | null)[];
  /** 拆掉後預計得到的精華，例如「武器精華 5～9、防具精華 2～4」（空的為空字串） */
  salvagePreview: string;
  /** 持有的材料 */
  materials: { id: MaterialId; label: string; count: number }[];
}

export const EQUIPMENT_LABELS: Record<EquipmentSlot, string> = {
  weapon: '武器',
  helmet: '頭盔',
  armor: '盔甲',
  gloves: '手套',
  boots: '鞋子',
  ring1: '戒指',
  ring2: '戒指',
  amulet: '護身符',
};

const GLYPHS: Record<string, string> = {
  weapon: '劍',
  sword: '劍',
  axe: '斧',
  bow: '弓',
  staff: '杖',
  helmet: '盔',
  armor: '甲',
  gloves: '手',
  boots: '靴',
  ring: '戒',
  amulet: '符',
};

/** 滑鼠所在的位置（而非當下的內容），快照更新後 Tooltip 會跟著更新 */
export type HoverTarget = { kind: 'cell'; cell: number } | { kind: 'slot'; slot: EquipmentSlot } | { kind: 'salvage'; slot: number };

/** 依目前快照解析 Tooltip 內容：背包物品附帶比較對象；裝備欄只顯示自己 */
export function resolveHover(view: InventoryView, target: HoverTarget | null): { entry: EntryView; compare: EntryView[] } | null {
  if (!target) return null;
  if (target.kind === 'slot') {
    const entry = view.equipment.find((e) => e.slot === target.slot)?.item;
    return entry ? { entry, compare: [] } : null;
  }
  if (target.kind === 'salvage') {
    const entry = view.salvage[target.slot];
    return entry ? { entry, compare: [] } : null;
  }
  const entry = view.cells[target.cell];
  return entry ? { entry, compare: comparisonFor(view, entry) } : null;
}

/** 背包物品要與哪些目前裝備比較（對應欄位已有裝備時；戒指可能有兩個） */
export function comparisonFor(view: InventoryView, entry: EntryView): EntryView[] {
  return entry.equipSlots.flatMap((slot) => {
    const equipped = view.equipment.find((e) => e.slot === slot)?.item;
    return equipped ? [equipped] : [];
  });
}

export function emptyInventoryView(): InventoryView {
  return { cols: 0, rows: 0, cells: [], equipment: [], held: null, stats: [], salvage: [], salvagePreview: '', materials: [] };
}

/** 單一物品的顯示資料（背包、商人貨架共用） */
export function itemEntryView(item: ItemInstance, data: DataRegistry): EntryView {
    const d = describeItem(item, data);
    return {
      kind: 'item',
      name: d.name,
      rarity: d.rarity,
      glyph: GLYPHS[data.items.get(item.baseId).weaponType ?? d.slot] ?? '?',
      // 例如「史詩 劍 · 短劍」
      slotLabel: d.subtitle,
      baseLines: d.baseLines,
      mainLine: d.mainLine,
      strongLines: d.strongLines,
      legendary: d.legendary,
      affixLines: d.affixLines,
      equipSlots: slotsForBase(d.slot),
      count: 1,
      itemLevel: item.itemLevel,
      tier: affixTier(item.itemLevel, data.balance),
      sellPrice: itemValue(item, data),
    };
}

/** 由 GameWorld 產生背包面板的唯讀快照（world.itemsVersion 變動時才重建） */
export function buildInventoryView(world: GameWorld, data: DataRegistry): InventoryView {
  const itemView = (item: ItemInstance): EntryView => itemEntryView(item, data);
  const entryView = (entry: InventoryEntry | null): EntryView | null => {
    if (!entry) return null;
    if (entry.kind === 'item') return itemView(entry.item);
    const potion = data.potions.get(entry.potionId);
    return {
      kind: 'potion',
      name: potion.name,
      rarity: 'normal',
      glyph: '藥',
      slotLabel: '消耗品',
      baseLines: [
        `回復 ${Math.round(potion.hpPct * 100)}% 生命與 ${Math.round(potion.mpPct * 100)}% 魔力`,
        `數量 ${entry.count} / ${potion.maxStack}`,
        'Space 使用',
      ],
      mainLine: null,
      strongLines: [],
      legendary: null,
      affixLines: [],
      equipSlots: [],
      count: entry.count,
      itemLevel: 0,
      tier: 0,
      sellPrice: sellPrice(entry, data),
    };
  };
  const stats = world.player.stats;
  return {
    cols: world.inventory.cols,
    rows: world.inventory.rows,
    cells: world.inventory.cells.map(entryView),
    equipment: EQUIPMENT_SLOTS.map((slot) => {
      const item = world.equipment.get(slot);
      return { slot, label: EQUIPMENT_LABELS[slot], item: item ? itemView(item) : null };
    }),
    held: entryView(world.cursor.entry),
    stats: [
      // 武器傷害合計（角色基礎 + 武器含主倍率 + 攻擊屬性 + 詞綴；明細見角色面板）
      { label: '武器傷害', value: `${Math.round(stats.get('damageMin'))}–${Math.round(stats.get('damageMax'))}` },
      { label: STAT_LABELS.defense, value: `${Math.round(stats.get('defense'))}` },
      { label: STAT_LABELS.maxHp, value: `${Math.round(stats.get('maxHp'))}` },
      { label: STAT_LABELS.maxMana, value: `${Math.round(stats.get('maxMana'))}` },
      { label: STAT_LABELS.attackSpeed, value: stats.get('attackSpeed').toFixed(2) },
      { label: STAT_LABELS.critChance, value: formatValue('critChance', 'flat', stats.get('critChance'), false) },
      { label: STAT_LABELS.moveSpeed, value: stats.get('moveSpeed').toFixed(2) },
    ],
    salvage: world.salvage.slots.map((item) => (item ? itemView(item) : null)),
    salvagePreview: (Object.entries(world.salvage.preview()) as [MaterialId, [number, number]][])
      .map(([id, [min, max]]) => `${MATERIAL_LABELS[id]} ${min === max ? min : `${min}～${max}`}`)
      .join('、'),
    materials: MATERIAL_IDS.map((id) => ({ id, label: MATERIAL_LABELS[id], count: world.materials.get(id) })),
  };
}
