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

/**
 * v8 → v9：存入亂數序列的狀態。舊存檔沒有這些狀態，給空的紀錄；
 * 讀檔時由 SaveMapper 以種子、流水號、遊玩時間混出新狀態，不會再從頭重跑同一串結果。
 */
const v8ToV9: Migration = (v8) => ({ ...v8, rng: {} });

/**
 * v9 → v10：加入終局紀錄。舊版樓層沒有上限（第 30 層以後一直往下），最高樓層超過 30 視為已通關；
 * 隱藏難關（第 35 層的最終魔王）是新內容，一律未完成。樓層超過 35 由 SaveRepair 修正。
 */
const v9ToV10: Migration = (v9) => {
  const highest = Number(((v9.floor ?? {}) as { highest?: number }).highest ?? 1);
  return { ...v9, endgame: { cleared: highest > 30, completedHidden: false } };
};

/**
 * v10 → v11：魔王門前的存檔點與到過中途的樓層。舊存檔的魔王門前點一律未啟動；
 * 目前這一層的中途點已啟動的話，記為到過中途（其他樓層沒有紀錄，重新走到中途即可）。
 */
const v10ToV11: Migration = (v10) => {
  const floor = (v10.floor ?? {}) as { current?: number; midwayActive?: boolean };
  return { ...v10, floor: { ...floor, bossGateActive: false, midwayFloors: floor.midwayActive && floor.current ? [floor.current] : [] } };
};

/** v11 → v12：新增盾牌欄位與重鑄次數，兩者都是選填（舊存檔沒有盾牌、沒有重鑄過），內容不需要轉換 */
const v11ToV12: Migration = (v11) => v11;

/** v12 → v13：連段從 Q / W / E 三組增加為 Q / W / E / R / A / S / D 七組，新的四組是空的 */
const v12ToV13: Migration = (v12) => {
  const loadout = (v12.loadout ?? {}) as { combos?: unknown[] };
  const combos = [...(loadout.combos ?? [])];
  while (combos.length < 7) combos.push([null, null, null]);
  return { ...v12, loadout: { ...loadout, combos } };
};

/**
 * v13 → v14：雙重斬（melee.double_slash）換成盾擊（melee.shield_bash），技能樹同一格。
 * 技能等級、左鍵與連段格直接轉給盾擊；組合表裡含雙重斬的組合已經不存在，移除。
 */
const OLD_SKILL = 'melee.double_slash';
const NEW_SKILL = 'melee.shield_bash';
const v13ToV14: Migration = (v13) => {
  const rename = (id: unknown) => (id === OLD_SKILL ? NEW_SKILL : id);
  const skills = (v13.skills ?? {}) as { ranks?: Record<string, number> };
  const ranks = Object.fromEntries(Object.entries(skills.ranks ?? {}).map(([id, rank]) => [rename(id), rank]));
  const loadout = (v13.loadout ?? {}) as { left?: unknown; combos?: unknown[][]; supports?: unknown[] };
  const codex = ((v13.codex ?? []) as { skills?: unknown[] }[]).filter((entry) => !(entry.skills ?? []).includes(OLD_SKILL));
  return {
    ...v13,
    skills: { ...skills, ranks },
    loadout: { ...loadout, left: rename(loadout.left), combos: (loadout.combos ?? []).map((steps) => steps.map(rename)) },
    codex,
  };
};

/**
 * v14 → v15：鑲嵌與融合。新欄位（裝備的 sockets、熔核格、拆解區的熔核）都是選填，舊物品視為沒有孔；
 * 商人的融合格補上空的格子。孔數與融合的亂數序列沒有存檔時，讀檔會由種子重新推得。
 */
const v14ToV15: Migration = (v14) => ({ ...v14, fusion: v14.fusion ?? { inputs: [null, null, null, null], jewelry: [null, null] } });

/**
 * v15 → v16：盾牌也能鑲嵌（2026-10-19）。熔核的主屬性多了盾牌欄：舊熔核沿用自己衣裝欄的擲骰值（同一個核種同一個位置），
 * 盾牌欄有兩條候選時依熔核 uid 的雜湊固定選一條。熔核可能在背包、身上裝備的孔、地上、拆解區、融合格，所以整份存檔走一遍。
 * 屬性 ID 照 v16 當時的 data/cores.ts 寫死（之後改資料也不影響這一步）。
 */
const V16_SHIELD_LINES: Record<string, string[]> = {
  sharp: ['core.sharp.dodge_shield', 'core.sharp.attack_speed_shield'],
  heavy: ['core.heavy.shield_bash', 'core.heavy.physical_resist_shield'],
  pierce: ['core.pierce.slow_resist_shield', 'core.pierce.move_speed_shield'],
  arcane: ['core.arcane.element_resist_shield'],
  wall: ['core.wall.block_shield', 'core.wall.defense_shield'],
  swift: ['core.swift.move_speed_shield', 'core.swift.slow_resist_shield'],
  grip: ['core.grip.block', 'core.grip.knockback_resist_shield'],
  crown: ['core.crown.stun_resist_shield', 'core.crown.element_resist_shield'],
};
function uidHash(uid: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** 沒有熔核的部分原樣回傳（不複製） */
function addShieldMain(node: unknown): unknown {
  if (Array.isArray(node)) {
    const next = node.map(addShieldMain);
    return next.some((v, i) => v !== node[i]) ? next : node;
  }
  if (!node || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  let out = obj;
  for (const [k, v] of Object.entries(obj)) {
    const next = addShieldMain(v);
    if (next !== v) out = { ...out, [k]: next };
  }
  const main = out.main as Record<string, { roll?: number }[] | undefined> | undefined;
  if (typeof out.uid === 'string' && Array.isArray(out.types) && main && typeof main === 'object' && Array.isArray(main.armor) && !main.shield) {
    const uid = out.uid;
    const armor = main.armor;
    const shield = (out.types as string[]).flatMap((type, i) => {
      const lines = V16_SHIELD_LINES[type];
      return lines ? [{ lineId: lines[uidHash(uid, i) % lines.length]!, roll: armor[i]?.roll ?? 0.5 }] : [];
    });
    out = { ...out, main: { ...main, shield } };
  }
  return out;
}
const v15ToV16: Migration = (v15) => addShieldMain(v15) as Record<string, unknown>;

/** index = 起始版本（0 → 1 → 2 → 3 …） */
const MIGRATIONS: Migration[] = [v0ToV1, v1ToV2, v2ToV3, v3ToV4, v4ToV5, v5ToV6, v6ToV7, v7ToV8, v8ToV9, v9ToV10, v10ToV11, v11ToV12, v12ToV13, v13ToV14, v14ToV15, v15ToV16];

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
