import type { DataRegistry } from '../data/DataRegistry';
import { slotsForBase } from '../game/items/Equipment';
import { xpToNext } from '../game/progression/ExperienceSystem';
import { mapIdForFloor } from '../game/world/FloorManager';
import type { SaveData, SavedEntry, SavedItem } from './schema';

export interface RepairResult {
  data: SaveData;
  /** 沒有地方放的物品：讀檔後放在樓梯口地上 */
  overflow: SavedEntry[];
  /** 修復紀錄（顯示給玩家 / console） */
  notes: string[];
}

/**
 * 讀檔時修正「存檔與目前遊戲資料不一致」的情況（資料表刪改、平衡調整），
 * 讓舊存檔永遠讀得進來。規則見 docs/SAVE_SYSTEM.md 5.3。純函式，不修改輸入。
 */
export function repairSave(input: SaveData, data: DataRegistry): RepairResult {
  const save = structuredClone(input);
  const notes: string[] = [];
  const overflow: SavedEntry[] = [];
  const { balance } = data;
  const p = balance.player;

  // ---- 等級與經驗 ----
  const level = clamp(save.character.level, 1, balance.maxLevel);
  if (level !== save.character.level) notes.push(`等級修正為 ${level}`);
  save.character.level = level;
  save.character.xp = level >= balance.maxLevel ? 0 : clamp(save.character.xp, 0, xpToNext(level, balance) - 1);

  // ---- 技能等級 ----
  const ranks = new Map<string, number>();
  for (const [id, rank] of Object.entries(save.skills.ranks)) {
    if (!data.skills.has(id)) {
      notes.push(`技能「${id}」已移除，退回技能點`);
      continue;
    }
    const clamped = Math.min(rank, balance.maxSkillRank);
    if (clamped !== rank) notes.push(`技能「${data.skills.get(id).name}」等級超過上限，退回多出的點數`);
    ranks.set(id, clamped);
  }
  // 初始技能的 Lv1 是免費的，一定存在
  for (const id of p.startingSkills) if (!ranks.has(id)) ranks.set(id, 1);

  // ---- 技能點：總數 = 初始點數 + 每級點數 × (等級 − 1)；已使用 = 等級總和 − 初始技能數 ----
  const totalPoints = p.startingSkillPoints + balance.skillPointsPerLevel * (level - 1);
  const spent = [...ranks.values()].reduce((sum, r) => sum + r, 0) - p.startingSkills.length;
  if (spent > totalPoints) {
    notes.push('技能點數與等級不符，技能樹已重置並退回全部點數');
    ranks.clear();
    for (const id of p.startingSkills) ranks.set(id, 1);
    save.skills.unspentPoints = totalPoints;
  } else if (save.skills.unspentPoints !== totalPoints - spent) {
    notes.push(`未使用技能點修正為 ${totalPoints - spent}`);
    save.skills.unspentPoints = totalPoints - spent;
  }
  save.skills.ranks = Object.fromEntries(ranks);
  save.skills.t4Unlocked = [...new Set(save.skills.t4Unlocked)];

  // ---- 屬性點：總數 = 每級點數 × (等級 − 1) ----
  const attributeDefs = balance.attributes.list;
  const allocated = new Map<string, number>();
  for (const [id, points] of Object.entries(save.attributes.allocated)) {
    const def = attributeDefs.find((d) => d.id === id);
    if (!def) {
      notes.push(`屬性「${id}」已移除，退回屬性點`);
      continue;
    }
    const capped = def.maxPoints === undefined ? points : Math.min(points, def.maxPoints);
    if (capped !== points) notes.push(`「${def.name}」超過上限，退回多出的屬性點`);
    allocated.set(id, capped);
  }
  const totalAttributes = balance.attributes.pointsPerLevel * (level - 1);
  const spentAttributes = [...allocated.values()].reduce((sum, p) => sum + p, 0);
  if (spentAttributes > totalAttributes) {
    notes.push('屬性點與等級不符，已重置並退回全部屬性點');
    allocated.clear();
    save.attributes.unspent = totalAttributes;
  } else if (save.attributes.unspent !== totalAttributes - spentAttributes) {
    notes.push(`未分配屬性點修正為 ${totalAttributes - spentAttributes}`);
    save.attributes.unspent = totalAttributes - spentAttributes;
  }
  save.attributes.allocated = Object.fromEntries(allocated);

  // ---- 按鍵配置：只能放已學會、種類正確的技能 ----
  const learned = (id: string | null, kind: 'active' | 'passive') =>
    id !== null && ranks.has(id) && data.skills.get(id).kind === kind;
  if (!learned(save.loadout.left, 'active')) {
    notes.push('左鍵技能無效，改回普通攻擊');
    save.loadout.left = p.startingLoadout.left;
  }
  for (const steps of save.loadout.combos) {
    steps.forEach((id, i) => {
      if (id !== null && !(learned(id, 'active') && data.skills.get(id).tree)) steps[i] = null;
    });
  }
  const seenSupports = new Set<string>();
  save.loadout.supports.forEach((id, i) => {
    if (id === null) return;
    if (!learned(id, 'passive') || seenSupports.has(id)) save.loadout.supports[i] = null;
    else seenSupports.add(id);
  });

  // ---- 物品 ----
  // 改版後的基底：舊 ID 換成宣告了這個別名的新基底
  const aliasOf = new Map(data.items.all.flatMap((b) => b.aliases.map((a) => [a, b.id] as const)));
  const fixItem = (input: SavedItem): SavedItem | null => {
    const renamed = aliasOf.get(input.baseId);
    const item = renamed && !data.items.has(input.baseId) ? { ...input, baseId: renamed } : input;
    if (!data.items.has(item.baseId)) {
      notes.push(`物品「${item.baseId}」已移除`);
      return null;
    }
    const affixes = item.affixes.filter((a) => data.affixes.has(a.id));
    if (affixes.length !== item.affixes.length) notes.push(`物品「${data.items.get(item.baseId).name}」的部分詞綴已移除`);
    return { ...item, affixes };
  };
  const fixEntry = (entry: SavedEntry | null): SavedEntry[] => {
    if (entry === null) return [];
    if (entry.kind === 'item') {
      const item = fixItem(entry.item);
      return item ? [{ kind: 'item', item }] : [];
    }
    if (!data.potions.has(entry.potionId)) return [];
    // 超過上限的藥水疊拆成多疊
    const max = data.potions.get(entry.potionId).maxStack;
    const stacks: SavedEntry[] = [];
    for (let left = entry.count; left > 0; left -= max) stacks.push({ ...entry, count: Math.min(left, max) });
    return stacks;
  };

  // 背包：格數或內容改變時重新排列，放不下的進 overflow
  const capacity = p.inventoryCols * p.inventoryRows;
  const cells: (SavedEntry | null)[] = save.inventory.cells.slice(0, capacity).map((c) => {
    const fixed = fixEntry(c);
    if (fixed.length === 0) return null;
    overflow.push(...fixed.slice(1));
    return fixed[0]!;
  });
  overflow.push(...save.inventory.cells.slice(capacity).flatMap(fixEntry));
  while (cells.length < capacity) cells.push(null);

  const [cursor, ...cursorRest] = fixEntry(save.inventory.cursor);
  save.inventory.cursor = cursor ?? null;
  overflow.push(...cursorRest);

  // 裝備：欄位或等級需求不符的卸下
  for (const [slot, raw] of Object.entries(save.equipment)) {
    const key = slot as keyof typeof save.equipment;
    const item = raw ? fixItem(raw) : null;
    if (!item) {
      delete save.equipment[key];
      continue;
    }
    const base = data.items.get(item.baseId);
    if (!slotsForBase(base.slot).includes(key) || base.levelReq > level) {
      notes.push(`「${base.name}」無法再裝備於此欄位，已放回背包`);
      delete save.equipment[key];
      overflow.push({ kind: 'item', item });
      continue;
    }
    save.equipment[key] = item;
  }

  // overflow 優先放回背包空格
  for (let i = 0; i < overflow.length; ) {
    const empty = cells.indexOf(null);
    if (empty < 0) break;
    cells[empty] = overflow.splice(i, 1)[0]!;
  }
  save.inventory.cells = cells;
  if (overflow.length > 0) notes.push(`背包放不下的 ${overflow.length} 件物品已放在樓梯口`);

  // ---- 樓層 ----
  save.floor.highest = Math.max(save.floor.highest, save.floor.current);
  const expectedMap = mapIdForFloor(data, save.floor.current);
  const ground = save.floor.groundItems.flatMap((g) => {
    const e = g.entry;
    if (e.kind === 'gold' || e.kind === 'material') return [g];
    return fixEntry(e).map((entry) => ({ ...g, entry }));
  });
  if (save.floor.mapId !== expectedMap) {
    // 佈局改變：本層重新生成，地上的物品移到樓梯口
    notes.push('樓層佈局已更新，本層重新生成');
    for (const g of ground) {
      const e = g.entry;
      if (e.kind === 'material') save.materials[e.materialId] = (save.materials[e.materialId] ?? 0) + e.count;
      else if (e.kind !== 'gold') overflow.push(e);
    }
    save.floor = {
      ...save.floor,
      mapId: expectedMap,
      midwayActive: false,
      exitOpen: save.floor.current < save.floor.highest,
      killed: [],
      shopBought: [],
      openedChests: Object.fromEntries(Object.entries(save.floor.openedChests).filter(([f]) => Number(f) !== save.floor.current)),
      groundItems: [],
    };
  } else {
    save.floor.groundItems = ground;
  }

  // ---- 物品流水號：不小於任何已存物品 ----
  save.counters.itemUidCounter = Math.max(save.counters.itemUidCounter, maxUidCounter(save, overflow));

  // ---- 拆解區：修正物品（已刪除的基底移除） ----
  save.salvage = save.salvage.map((item) => (item ? fixItem(item) : null));
  if (save.ascendSlot) save.ascendSlot = fixItem(save.ascendSlot);

  // ---- 怪物圖鑑：移除已刪除的怪物 ----
  save.bestiary = Object.fromEntries(Object.entries(save.bestiary).filter(([id]) => data.enemies.has(id)));
  // ---- 裝備圖鑑：移除已刪除的基底與傳奇 ----
  save.collection = [
    ...new Set(
      save.collection
        .map((key) => (key.startsWith('base:') && aliasOf.has(key.slice(5)) && !data.items.has(key.slice(5)) ? `base:${aliasOf.get(key.slice(5))}` : key))
        .filter((key) => {
          const [kind, id] = key.split(':') as [string, string];
          return kind === 'base' ? data.items.has(id) : kind === 'legendary' ? data.legendaries.has(id) : false;
        }),
    ),
  ];

  return { data: save, overflow, notes };
}

/** uid 格式為「流水號（36 進位）-隨機碼」；回傳所有物品中最大的流水號 */
function maxUidCounter(save: SaveData, overflow: readonly SavedEntry[]): number {
  const items: SavedItem[] = [];
  const collect = (e: { kind: string; item?: SavedItem } | null) => {
    if (e?.kind === 'item' && e.item) items.push(e.item);
  };
  save.inventory.cells.forEach(collect);
  collect(save.inventory.cursor);
  Object.values(save.equipment).forEach((item) => item && items.push(item));
  save.floor.groundItems.forEach((g) => collect(g.entry));
  overflow.forEach(collect);
  let max = 0;
  for (const item of items) {
    const n = parseInt(item.uid.split('-')[0] ?? '', 36);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
