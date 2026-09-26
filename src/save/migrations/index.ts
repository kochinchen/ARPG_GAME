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

/** index = 起始版本（0 → 1 → 2 …） */
const MIGRATIONS: Migration[] = [v0ToV1, v1ToV2];

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
