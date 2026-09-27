import { SAVE_VERSION } from '../schema';

/**
 * 存檔格式轉換：每一步把 vN 的 payload 轉成 vN+1，全部是純函式。
 * 讀檔時從存檔的 schemaVersion 一路套用到 SAVE_VERSION，最後才做 Schema 驗證。
 */
type Migration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * v0：ARCHITECTURE.md 1.2 最初規劃的格式（M5 之前的設計，從未正式使用）。
 * 保留這一步是為了驗證 Migration 流程本身。
 */
interface SaveDataV0 {
  character: { level: number; xp: number; gold: number };
  skills: {
    learned: Record<string, number>;
    unspentPoints: number;
    t4UnlockCharges: number;
    t4UnlockedCategories: string[];
    loadout: { left: string; right: (string | null)[]; activeRight: number };
  };
  inventory: unknown[];
  equipment: Record<string, unknown>;
  potions: number;
  progress: { currentFloor: number; highestFloor: number; checkpoint: 'stairs' | 'midway' };
}

const V0_POTION_ID = 'potion.rejuvenation';
const V0_POTION_STACK = 20;
const V0_INVENTORY_CELLS = 80;

const v0ToV1: Migration = (raw) => {
  const v0 = raw as unknown as SaveDataV0;
  const cells: unknown[] = v0.inventory.map((item) => ({ kind: 'item', item }));
  for (let left = v0.potions; left > 0; left -= V0_POTION_STACK) {
    cells.push({ kind: 'potion', potionId: V0_POTION_ID, count: Math.min(left, V0_POTION_STACK) });
  }
  while (cells.length < V0_INVENTORY_CELLS) cells.push(null);
  const right = v0.skills.loadout.right;
  const floor = Math.max(1, v0.progress.currentFloor);
  return {
    meta: { createdAt: new Date(0).toISOString(), playTimeSec: 0, runSeed: 1 },
    // v0 沒有存 HP / MP：給極大值，讀檔時會限制在上限（等於滿血）
    character: { ...v0.character, hp: Number.MAX_SAFE_INTEGER, mana: Number.MAX_SAFE_INTEGER },
    skills: {
      ranks: v0.skills.learned,
      unspentPoints: v0.skills.unspentPoints,
      t4Charges: v0.skills.t4UnlockCharges,
      t4Unlocked: v0.skills.t4UnlockedCategories,
    },
    loadout: {
      left: v0.skills.loadout.left,
      // v0 的右鍵三格各自成為 Q / W / E 連段的第一招
      combos: [0, 1, 2].map((i) => [right[i] ?? null, null, null]),
      activeCombo: v0.skills.loadout.activeRight,
      supports: [null, null, null],
    },
    inventory: { cells, cursor: null },
    equipment: v0.equipment,
    codex: [],
    floor: {
      current: floor,
      highest: Math.max(floor, v0.progress.highestFloor),
      // v0 沒有地圖 ID：讀檔時判定為佈局不符，本層重新生成
      mapId: '',
      midwayActive: v0.progress.checkpoint === 'midway',
      exitOpen: false,
      killed: [],
      openedChests: {},
      groundItems: [],
    },
    counters: { itemUidCounter: 0 },
  };
};

/**
 * v1 → v2：加入屬性點。舊角色補發過去每一級的點數（每級 3 點，v2 推出時的數值），全部未分配。
 * Migration 寫死當時的數值：之後平衡調整由 SaveRepair 依當下規則修正，不改寫這一步。
 */
const V2_ATTRIBUTE_POINTS_PER_LEVEL = 3;
const v1ToV2: Migration = (v1) => {
  const level = (v1.character as { level?: unknown } | undefined)?.level;
  const levels = typeof level === 'number' && level > 1 ? Math.floor(level) - 1 : 0;
  return { ...v1, attributes: { unspent: levels * V2_ATTRIBUTE_POINTS_PER_LEVEL, allocated: {} } };
};

/** v2 → v3：加入商人貨架紀錄（舊存檔視為都還沒買） */
const v2ToV3: Migration = (v2) => ({ ...v2, floor: { ...(v2.floor as object), shopBought: [] } });

/** v3 → v4：加入怪物圖鑑（舊存檔從空的圖鑑開始） */
const v3ToV4: Migration = (v3) => ({ ...v3, bestiary: {} });

/**
 * v4 → v5：裝備加入主倍率（quality）。舊裝備補上該稀有度區間的中間值（寫死 v5 推出時的數值）：
 * 武器 / 防具乘在基礎攻防，戒指 / 護身符乘在所有詞綴。
 */
const V5_MID_BASE: Record<string, number> = { normal: 0, magic: 0.55, rare: 1.1, epic: 1.8, legendary: 2.65, mythic: 3.45 };
const V5_MID_JEWELRY: Record<string, number> = { normal: 0, magic: 0.15, rare: 0.325, epic: 0.525, legendary: 0.725, mythic: 0.9 };
const v4ToV5: Migration = (v4) => {
  const withQuality = (item: unknown): unknown => {
    if (typeof item !== 'object' || item === null) return item;
    const it = item as { baseId?: string; rarity?: string; quality?: number };
    if (it.quality !== undefined) return item;
    const jewelry = typeof it.baseId === 'string' && /^(ring|amulet)\./.test(it.baseId);
    return { ...it, quality: (jewelry ? V5_MID_JEWELRY : V5_MID_BASE)[it.rarity ?? 'normal'] ?? 0 };
  };
  const entry = (e: unknown): unknown =>
    typeof e === 'object' && e !== null && (e as { kind?: string }).kind === 'item' ? { ...e, item: withQuality((e as { item: unknown }).item) } : e;
  const inv = (v4.inventory ?? {}) as { cells?: unknown[]; cursor?: unknown };
  const floor = (v4.floor ?? {}) as { groundItems?: { entry: unknown }[] };
  return {
    ...v4,
    inventory: { ...inv, cells: (inv.cells ?? []).map(entry), cursor: entry(inv.cursor ?? null) },
    equipment: Object.fromEntries(Object.entries((v4.equipment ?? {}) as Record<string, unknown>).map(([slot, item]) => [slot, withQuality(item)])),
    floor: { ...floor, groundItems: (floor.groundItems ?? []).map((g) => ({ ...g, entry: entry(g.entry) })) },
  };
};

/**
 * v5 → v6：傳奇 / 神話裝備加入固定屬性的擲骰（legendaryRolls，選填）。
 * 之前的版本沒有真正的傳奇 / 神話裝備（只有開發用的隨機預覽），不需要轉換內容。
 */
const v5ToV6: Migration = (v5) => v5;

/** v6 → v7：加入裝備圖鑑（空的；讀檔後依背包與裝備補上已擁有的物品） */
const v6ToV7: Migration = (v6) => ({ ...v6, collection: [] });

/** v7 → v8：加入材料與拆解區（舊存檔從零開始） */
const v7ToV8: Migration = (v7) => ({ ...v7, materials: {}, salvage: [] });

/** index = 起始版本（0 → 1 → 2 → 3 …） */
const MIGRATIONS: Migration[] = [v0ToV1, v1ToV2, v2ToV3, v3ToV4, v4ToV5, v5ToV6, v6ToV7, v7ToV8];

export class MigrationError extends Error {}

export function migrate(payload: unknown, fromVersion: number): unknown {
  if (!Number.isInteger(fromVersion) || fromVersion < 0) throw new MigrationError(`invalid schemaVersion ${fromVersion}`);
  if (fromVersion > SAVE_VERSION) throw new MigrationError(`存檔版本 v${fromVersion} 比遊戲新（v${SAVE_VERSION}），請更新遊戲`);
  if (MIGRATIONS.length !== SAVE_VERSION) throw new Error('每個版本都需要一個 Migration');
  let current = payload;
  for (let v = fromVersion; v < SAVE_VERSION; v++) {
    if (typeof current !== 'object' || current === null) throw new MigrationError(`v${v} payload is not an object`);
    current = MIGRATIONS[v]!(current as Record<string, unknown>);
  }
  return current;
}
