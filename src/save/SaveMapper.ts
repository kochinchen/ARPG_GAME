import { vec2 } from '../core/math/Vec2';
import type { GameWorld } from '../game/GameWorld';
import type { ComboCodexEntry } from '../game/combo/ComboCodex';
import type { GroundContent } from '../game/entities/Interactable';
import type { InventoryEntry } from '../game/items/Inventory';
import { EQUIPMENT_SLOTS, type ItemInstance } from '../game/items/ItemInstance';
import type { RepairResult } from './SaveRepair';
import type { SaveData, SavedEntry, SavedGroundItem, SavedItem } from './schema';

/** 地上物品最多存幾件（避免存檔無限膨脹） */
export const MAX_SAVED_GROUND_ITEMS = 200;

/**
 * GameWorld ⇄ SaveData 的轉換，唯一同時知道兩邊格式的地方。
 * - capture：Tick 結束後取快照（不修改 GameWorld）
 * - restore：套用到「剛建立、還在第 1 層」的新 GameWorld
 */
export const SaveMapper = {
  capture(world: GameWorld, createdAt: string): SaveData {
    const player = world.player;
    const progress = world.progress;
    const loadout = world.loadout;
    // 倒地中存檔：等同已重生（HP / MP 滿，位置由存檔點決定）
    const dead = !player.alive;
    const equipment: SaveData['equipment'] = {};
    for (const slot of EQUIPMENT_SLOTS) {
      const item = world.equipment.get(slot);
      if (item) equipment[slot] = clone(item);
    }
    const midway = world.checkpoints.checkpoints.find((c) => c.kind === 'midway');
    return {
      meta: { createdAt, playTimeSec: world.playTime, runSeed: world.runSeed },
      character: {
        level: progress.level,
        xp: progress.xp,
        gold: world.wallet.gold,
        hp: dead ? player.maxHp : player.hp,
        mana: dead ? player.maxMana : player.mana,
      },
      skills: {
        ranks: Object.fromEntries(player.skillRanks),
        unspentPoints: progress.skillPoints,
        t4Charges: progress.t4Charges,
        t4Unlocked: [...progress.t4Unlocked],
      },
      attributes: {
        unspent: progress.attributePoints,
        allocated: Object.fromEntries([...progress.attributes].filter(([, points]) => points > 0)),
      },
      loadout: {
        left: loadout.left,
        combos: [[...loadout.combos[0]], [...loadout.combos[1]], [...loadout.combos[2]]],
        activeCombo: loadout.activeCombo,
        supports: [...loadout.supports],
      },
      inventory: {
        cells: world.inventory.cells.map((c) => (c ? toSavedEntry(c) : null)),
        cursor: world.cursor.entry ? toSavedEntry(world.cursor.entry) : null,
      },
      equipment,
      codex: world.codex.all.map((e) => ({
        comboId: e.comboId,
        ruleId: e.ruleId,
        skills: [...e.skills],
        order: e.firstDiscoveredAt,
        timesUsed: e.timesUsed,
      })),
      floor: {
        current: world.floors.floor,
        highest: progress.highestFloor,
        mapId: world.map.id,
        midwayActive: midway?.active ?? false,
        exitOpen: world.floors.exitOpen,
        killed: [...world.floors.killedSpawns],
        openedChests: Object.fromEntries([...world.floors.openedChests].map(([floor, set]) => [String(floor), [...set].sort((a, b) => a - b)])),
        groundItems: captureGround(world),
      },
      counters: { itemUidCounter: world.itemGenerator.uidCounter },
    };
  },

  /**
   * 把（已修復的）存檔套用到新 GameWorld。回傳額外的修復紀錄（例如已移除的 Combo 規則）。
   * 呼叫前 GameWorld 必須以存檔的 runSeed 建立。
   */
  restore(world: GameWorld, repaired: RepairResult): string[] {
    const save = repaired.data;
    const notes: string[] = [];
    if (world.runSeed !== save.meta.runSeed) throw new Error('GameWorld must be created with the saved runSeed');
    const player = world.player;
    const progress = world.progress;

    // 等級（套用每級屬性成長）與技能
    world.experience.restore(save.character.level, save.character.xp);
    player.skillRanks.clear();
    for (const [id, rank] of Object.entries(save.skills.ranks)) player.skillRanks.set(id, rank);
    progress.skillPoints = save.skills.unspentPoints;
    progress.t4Charges = save.skills.t4Charges;
    progress.t4Unlocked.clear();
    for (const c of save.skills.t4Unlocked) progress.t4Unlocked.add(c);
    progress.attributePoints = save.attributes.unspent;
    progress.attributes.clear();
    for (const [id, points] of Object.entries(save.attributes.allocated)) progress.attributes.set(id, points);
    world.attributes.apply();

    // 按鍵配置
    const loadout = world.loadout;
    loadout.left = save.loadout.left;
    save.loadout.combos.forEach((steps, i) => steps.forEach((id, step) => (loadout.combos[i]![step] = id)));
    save.loadout.supports.forEach((id, i) => (loadout.supports[i] = id));
    loadout.select(save.loadout.activeCombo);

    // 物品
    world.wallet.gold = save.character.gold;
    world.inventory.restore(save.inventory.cells.map((c) => (c ? toInventoryEntry(c) : null)));
    world.cursor.set(save.inventory.cursor ? toInventoryEntry(save.inventory.cursor) : null);
    for (const slot of EQUIPMENT_SLOTS) {
      const item = save.equipment[slot];
      if (item) world.equipment.equipTo(slot, toItem(item));
    }
    world.itemGenerator.uidCounter = save.counters.itemUidCounter;

    // Codex：名稱與說明依目前規則重新產生；規則已不存在的條目移除
    const rankOf = (id: string) => player.skillRanks.get(id) ?? 1;
    const entries: ComboCodexEntry[] = [];
    for (const e of save.codex) {
      const resolved = world.comboResolver.resolve(e.skills, rankOf);
      if (resolved.status !== 'combo' || resolved.comboId !== e.comboId) {
        notes.push(`Combo「${e.comboId}」的規則已變更，已從 Codex 移除`);
        continue;
      }
      entries.push({
        comboId: e.comboId,
        ruleId: resolved.rule.id,
        comboName: resolved.displayName,
        skills: e.skills,
        firstDiscoveredAt: e.order,
        timesUsed: e.timesUsed,
        effectDescription: resolved.description,
      });
    }
    world.codex.restore(entries);

    // 樓層：寶箱紀錄要在進入樓層前還原
    world.floors.openedChests.clear();
    for (const [floor, indices] of Object.entries(save.floor.openedChests)) {
      for (const i of indices) world.floors.markChestOpened(Number(floor), i);
    }
    progress.highestFloor = save.floor.highest;
    world.enterFloor(save.floor.current, {
      killed: save.floor.killed,
      midwayActive: save.floor.midwayActive,
      exitOpen: save.floor.exitOpen,
    });
    for (const g of save.floor.groundItems) {
      const item = world.spawnGroundItem(vec2(g.x, g.y), toGroundContent(g.entry));
      if (g.droppedByPlayer) item.droppedByPlayer = true;
    }
    for (const entry of repaired.overflow) {
      world.spawnGroundItem(world.spawnPoint, toGroundContent(entry)).droppedByPlayer = true;
    }

    // 最後才還原 HP / MP（裝備與 Support 可能影響上限）
    world.restoreResources(save.character.hp, save.character.mana);
    world.playTime = save.meta.playTimeSec;
    progress.changed();
    return notes;
  },
};

/**
 * 存檔用的變動簽章：immediate 改變時（換層、啟動存檔點）要立即存檔，
 * normal 改變時標記 dirty 等待節流。只比對版本號與計數，每幀計算成本很低。
 */
export function saveSignature(world: GameWorld): { immediate: string; normal: string } {
  const l = world.loadout;
  const f = world.floors;
  const ground = world.groundItems;
  return {
    immediate: `${f.floor}|${world.checkpoints.checkpoints.map((c) => (c.active ? 1 : 0)).join('')}|${f.exitOpen}`,
    normal: [
      world.progress.version,
      world.progress.level,
      world.progress.xp,
      world.codex.version,
      world.itemsVersion,
      world.wallet.gold,
      l.left,
      l.combos.map((c) => c.join(',')).join('/'),
      l.supports.join(','),
      l.activeCombo,
      f.killed,
      world.chests.filter((c) => c.opened).length,
      ground.length,
      ground[ground.length - 1]?.id ?? 0,
    ].join('|'),
  };
}

function captureGround(world: GameWorld): SavedGroundItem[] {
  let items = world.groundItems;
  if (items.length > MAX_SAVED_GROUND_ITEMS) {
    // 太多時先丟掉最舊的普通物品、藥水與金幣
    const excess = items.length - MAX_SAVED_GROUND_ITEMS;
    const cheap = new Set(
      items.filter((g) => g.content.kind !== 'item' || g.content.item.rarity === 'normal').slice(0, excess).map((g) => g.id),
    );
    items = items.filter((g) => !cheap.has(g.id)).slice(-MAX_SAVED_GROUND_ITEMS);
  }
  return items.map((g) => ({
    entry: clone(g.content),
    x: g.position.x,
    y: g.position.y,
    droppedByPlayer: g.droppedByPlayer ?? false,
  }));
}

function toSavedEntry(entry: InventoryEntry): SavedEntry {
  return clone(entry);
}

function toInventoryEntry(entry: SavedEntry): InventoryEntry {
  return entry.kind === 'item' ? { kind: 'item', item: toItem(entry.item) } : { ...entry };
}

function toGroundContent(entry: SavedGroundItem['entry']): GroundContent {
  return entry.kind === 'item' ? { kind: 'item', item: toItem(entry.item) } : { ...entry };
}

/** Schema 的 optional 欄位可能是 undefined；ItemInstance 不允許，沒有值時省略 */
function toItem(saved: SavedItem): ItemInstance {
  const { legendaryId, ...rest } = clone(saved);
  return legendaryId === undefined ? rest : { ...rest, legendaryId };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
