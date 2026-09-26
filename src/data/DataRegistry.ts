import { z } from 'zod';
import { BalanceSchema, type Balance } from './schema/balance';
import { SkillDefSchema, type SkillDef } from './schema/skill';
import { EnemyDefSchema, type EnemyDef } from './schema/enemy';
import {
  AffixDefSchema,
  ItemBaseDefSchema,
  PotionDefSchema,
  type AffixDef,
  type ItemBaseDef,
  type PotionDef,
} from './schema/item';
import { LootTableDefSchema, type LootTableDef } from './schema/loot';
import { FloorDefSchema, type FloorDef } from './schema/floor';
import { MapDefSchema, type MapDef } from './schema/map';

/** 尚未驗證的原始資料（來自 data/*.ts） */
export interface RawGameData {
  balance: unknown;
  skills: readonly unknown[];
  enemies: readonly unknown[];
  items: readonly unknown[];
  potions: readonly unknown[];
  affixes: readonly unknown[];
  lootTables: readonly unknown[];
  floors: readonly unknown[];
  maps: readonly unknown[];
}

export class DataValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`遊戲資料驗證失敗（${problems.length} 項）：\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

/** 以 ID 查詢的唯讀資料表 */
export class DataTable<T extends { id: string }> {
  private readonly byId: ReadonlyMap<string, T>;

  constructor(
    readonly kind: string,
    readonly all: readonly T[],
  ) {
    this.byId = new Map(all.map((entry) => [entry.id, entry]));
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** 找不到就丟錯；資料已在啟動時交叉驗證，執行期找不到代表程式錯誤 */
  get(id: string): T {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`${this.kind} not found: ${id}`);
    return entry;
  }
}

/**
 * 載入並驗證所有遊戲資料。任何錯誤都會一次列出，並阻止遊戲啟動。
 */
export class DataRegistry {
  private constructor(
    readonly balance: Balance,
    readonly skills: DataTable<SkillDef>,
    readonly enemies: DataTable<EnemyDef>,
    readonly items: DataTable<ItemBaseDef>,
    readonly potions: DataTable<PotionDef>,
    readonly affixes: DataTable<AffixDef>,
    readonly lootTables: DataTable<LootTableDef>,
    readonly floors: DataTable<FloorDef>,
    readonly maps: DataTable<MapDef>,
  ) {}

  static load(raw: RawGameData): DataRegistry {
    const problems: string[] = [];

    const balance = parseOne('balance', BalanceSchema, raw.balance, problems);
    const skills = parseTable('skill', SkillDefSchema, raw.skills, problems);
    const enemies = parseTable('enemy', EnemyDefSchema, raw.enemies, problems);
    const items = parseTable('item', ItemBaseDefSchema, raw.items, problems);
    const potions = parseTable('potion', PotionDefSchema, raw.potions, problems);
    const affixes = parseTable('affix', AffixDefSchema, raw.affixes, problems);
    const lootTables = parseTable('lootTable', LootTableDefSchema, raw.lootTables, problems);
    const floors = parseTable('floor', FloorDefSchema, raw.floors, problems);
    const maps = parseTable('map', MapDefSchema, raw.maps, problems);

    // 交叉引用檢查
    for (const enemy of enemies.all) {
      for (const skillId of enemy.skills) {
        if (!skills.has(skillId)) problems.push(`enemy '${enemy.id}' 引用不存在的 skill '${skillId}'`);
      }
      if (!lootTables.has(enemy.lootTable)) {
        problems.push(`enemy '${enemy.id}' 引用不存在的 lootTable '${enemy.lootTable}'`);
      }
    }
    for (const floor of floors.all) {
      for (const { enemyId } of floor.monsterPool) {
        if (!enemies.has(enemyId)) problems.push(`floor '${floor.id}' 引用不存在的 enemy '${enemyId}'`);
      }
      if (!maps.has(floor.map)) problems.push(`floor '${floor.id}' 引用不存在的 map '${floor.map}'`);
    }

    if (problems.length > 0 || !balance) throw new DataValidationError(problems);
    return new DataRegistry(balance, skills, enemies, items, potions, affixes, lootTables, floors, maps);
  }
}

function parseOne<T>(label: string, schema: z.ZodType<T>, value: unknown, problems: string[]): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  problems.push(...formatIssues(label, result.error));
  return undefined;
}

function parseTable<T extends { id: string }>(
  kind: string,
  schema: z.ZodType<T>,
  values: readonly unknown[],
  problems: string[],
): DataTable<T> {
  const parsed: T[] = [];
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const label = `${kind}[${index}]${describeId(value)}`;
    const entry = parseOne(label, schema, value, problems);
    if (!entry) return;
    if (seen.has(entry.id)) {
      problems.push(`${kind} ID 重複：'${entry.id}'`);
      return;
    }
    seen.add(entry.id);
    parsed.push(entry);
  });
  return new DataTable(kind, parsed);
}

function describeId(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') {
    return ` '${value.id}'`;
  }
  return '';
}

function formatIssues(label: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    return `${label}${path}: ${issue.message}`;
  });
}
