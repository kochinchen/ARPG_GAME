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
import { ComboRuleSchema, isRangeSequenceValid, type ComboRuleDef } from './schema/combo';
import { EliteAffixDefSchema, type EliteAffixDef } from './schema/elite';
import { LegendaryDefSchema, type LegendaryDef, type SkillFilter } from './schema/legendary';
import { checkComboTags, flattenEffects } from './skillAnalysis';
import { findMarker, reachableTiles } from './mapAnalysis';
import { MAP_TILES } from './schema/map';
import { SKILL_BRANCHES, SKILL_CATEGORIES, SKILL_TIERS } from './schema/skill';

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
  comboRules: readonly unknown[];
  eliteAffixes: readonly unknown[];
  legendaries: readonly unknown[];
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
    readonly comboRules: DataTable<ComboRuleDef>,
    readonly eliteAffixes: DataTable<EliteAffixDef>,
    readonly legendaries: DataTable<LegendaryDef>,
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
    const comboRules = parseTable('comboRule', ComboRuleSchema, raw.comboRules, problems);
    const eliteAffixes = parseTable('eliteAffix', EliteAffixDefSchema, raw.eliteAffixes, problems);
    const legendaries = parseTable('legendary', LegendaryDefSchema, raw.legendaries, problems);
    // 基底的舊版 ID：不可與現有 ID 或其他別名重複；同種類的階級不可重複
    const aliasSeen = new Set<string>();
    const tierSeen = new Set<string>();
    for (const base of items.all) {
      for (const alias of base.aliases) {
        if (items.has(alias) || aliasSeen.has(alias)) problems.push(`item '${base.id}' 的舊版 ID '${alias}' 重複`);
        aliasSeen.add(alias);
      }
      if (base.tier !== undefined) {
        const key = `${base.weaponType ?? base.slot}:${base.tier}`;
        if (tierSeen.has(key)) problems.push(`item '${base.id}' 的階級 ${key} 重複`);
        tierSeen.add(key);
      }
    }
    // 傳奇 / 神話：條件引用的技能要存在；requireBuff 用到的增益要由同一件裝備產生
    for (const def of legendaries.all) {
      const buffs = new Set<string>();
      const filters: SkillFilter[] = [];
      const required: string[] = [];
      for (const line of def.lines) {
        if (line.type !== 'effect') continue;
        for (const m of line.mechanics) {
          if (m.type === 'mods') {
            filters.push(m.when);
            if (m.requireBuff) required.push(m.requireBuff.id);
            if (m.scale?.by === 'buff') required.push(m.scale.id);
          } else if (m.type === 'trigger') {
            filters.push(m.when);
            if (m.requireBuff) required.push(m.requireBuff.id);
            for (const a of m.actions) {
              if (a.type === 'buff') buffs.add(a.id);
              if (a.type === 'arm') filters.push(a.when);
            }
          } else if (m.buff) required.push(m.buff.id);
        }
      }
      for (const f of filters) for (const id of f.skills ?? []) if (!skills.has(id)) problems.push(`legendary '${def.id}' 引用不存在的 skill '${id}'`);
      for (const id of required) if (!buffs.has(id)) problems.push(`legendary '${def.id}' 需要的增益 '${id}' 沒有由這件裝備產生`);
    }
    if (balance && !lootTables.has(balance.elite.lootTable)) {
      problems.push(`balance.elite 引用不存在的 lootTable '${balance.elite.lootTable}'`);
    }

    // 交叉引用檢查
    for (const skill of skills.all) {
      for (const effect of flattenEffects(skill.effects)) {
        if (effect.type === 'summon' && !enemies.has(effect.enemyId)) {
          problems.push(`skill '${skill.id}' 召喚不存在的 enemy '${effect.enemyId}'`);
        }
      }
    }
    for (const enemy of enemies.all) {
      for (const skillId of [...enemy.skills, ...enemy.phases.flatMap((p) => p.skills ?? [])]) {
        if (!skills.has(skillId)) problems.push(`enemy '${enemy.id}' 引用不存在的 skill '${skillId}'`);
      }
      if (enemy.lootTable !== undefined && !lootTables.has(enemy.lootTable)) {
        problems.push(`enemy '${enemy.id}' 引用不存在的 lootTable '${enemy.lootTable}'`);
      }
    }
    for (const floor of floors.all) {
      if (floor.boss) {
        const boss = enemies.has(floor.boss.enemyId) ? enemies.get(floor.boss.enemyId) : null;
        if (!boss) problems.push(`floor '${floor.id}' 的 Boss 引用不存在的 enemy '${floor.boss.enemyId}'`);
        else if (!boss.boss) problems.push(`floor '${floor.id}' 的 Boss '${boss.id}' 沒有設定 boss: true`);
      }
      if (!floor.monsterPool.some((m) => m.minFloor <= floor.floors[0])) {
        problems.push(`floor '${floor.id}' 在第 ${floor.floors[0]} 層沒有任何可生成的怪物（檢查 minFloor）`);
      }
      for (const { enemyId } of floor.monsterPool) {
        if (!enemies.has(enemyId)) problems.push(`floor '${floor.id}' 引用不存在的 enemy '${enemyId}'`);
      }
      if (!lootTables.has(floor.chestLootTable)) problems.push(`floor '${floor.id}' 引用不存在的 lootTable '${floor.chestLootTable}'`);
      for (const mapId of floor.maps ?? []) {
        if (!maps.has(mapId)) {
          problems.push(`floor '${floor.id}' 引用不存在的 map '${mapId}'`);
          continue;
        }
        const map = maps.get(mapId);
        // 樓層地圖必須有中途存檔點與出口，且從樓梯口走得到
        const start = findMarker(map, MAP_TILES.spawn)!;
        const reachable = reachableTiles(map, start);
        for (const [marker, label] of [[MAP_TILES.midway, '中途存檔點 M'], [MAP_TILES.exit, '出口 X']] as const) {
          const at = findMarker(map, marker);
          if (!at) problems.push(`floor '${floor.id}' 使用的 map '${mapId}' 沒有${label}`);
          else if (!reachable.has(`${at.x},${at.y}`)) problems.push(`map '${mapId}' 的${label}從樓梯口走不到`);
        }
      }
    }
    // 樓層區間必須從 1 開始連續、不重疊
    const ranges = [...floors.all].sort((a, b) => a.floors[0] - b.floors[0]);
    let expected = 1;
    for (const f of ranges) {
      if (f.floors[0] !== expected) problems.push(`floor '${f.id}' 應從第 ${expected} 層開始（目前 ${f.floors[0]}）`);
      expected = f.floors[1] + 1;
    }

    if (balance) {
      if (!potions.has(balance.player.potionId)) problems.push(`balance.player.potionId 引用不存在的 potion '${balance.player.potionId}'`);
      const { left, combos: startCombos, supports } = balance.player.startingLoadout;
      const starting = new Set(balance.player.startingSkills);
      for (const skillId of balance.player.startingSkills) {
        if (!skills.has(skillId)) problems.push(`balance.player.startingSkills 引用不存在的 skill '${skillId}'`);
      }
      const checkLoadout = (skillId: string | null, kind: 'active' | 'passive') => {
        if (skillId === null) return;
        if (!skills.has(skillId)) problems.push(`balance.player.startingLoadout 引用不存在的 skill '${skillId}'`);
        else if (!starting.has(skillId)) problems.push(`balance.player.startingLoadout 的 '${skillId}' 不在 startingSkills 內`);
        else if (skills.get(skillId).kind !== kind) problems.push(`balance.player.startingLoadout 的 '${skillId}' 必須是 ${kind} 技能`);
      };
      checkLoadout(left, 'active');
      startCombos.flat().forEach((id) => checkLoadout(id, 'active'));
      supports.forEach((id) => checkLoadout(id, 'passive'));
    }
    // 技能樹：每個位置剛好一個技能
    const treeSlots = new Map<string, string>();
    for (const skill of skills.all) {
      if (!skill.tree) continue;
      const key = `${skill.tree.category} T${skill.tree.tier}-${skill.tree.branch}`;
      const existing = treeSlots.get(key);
      if (existing) problems.push(`技能樹位置 ${key} 重複：'${existing}' 與 '${skill.id}'`);
      else treeSlots.set(key, skill.id);
    }
    if (skills.all.length > 0) {
      for (const category of SKILL_CATEGORIES) {
        for (const tier of SKILL_TIERS) {
          for (const branch of SKILL_BRANCHES) {
            const key = `${category} T${tier}-${branch}`;
            if (!treeSlots.has(key)) problems.push(`技能樹位置 ${key} 沒有技能`);
          }
        }
      }
    }

    // Combo 標籤必須與技能效果一致
    for (const skill of skills.all) {
      for (const problem of checkComboTags(skill)) problems.push(`skill '${skill.id}' 的 combo ${problem}`);
    }

    // Combo Rule：Exact Combo 的技能必須是帶 combo 標籤的主動技能，且排列合理
    for (const rule of comboRules.all) {
      const ids = [...(rule.match.kind === 'exact' ? rule.match.skills : []), ...rule.displayNames.map((d) => d.finalSkill)];
      for (const id of ids) {
        if (!skills.has(id)) problems.push(`comboRule '${rule.id}' 引用不存在的 skill '${id}'`);
        else if (!skills.get(id).combo) problems.push(`comboRule '${rule.id}' 的 '${id}' 必須是可放入連段的主動技能`);
      }
      if (rule.match.kind === 'exact' && rule.match.skills.every((id) => skills.has(id) && skills.get(id).combo)) {
        const [a, b, c] = rule.match.skills.map((id) => skills.get(id).combo!.range);
        if (!isRangeSequenceValid(a!, b!, c!)) problems.push(`comboRule '${rule.id}' 的排列 ${a}→${b}→${c} 不合理，永遠不會觸發`);
        if (new Set(rule.match.skills).size === 1) problems.push(`comboRule '${rule.id}' 是三個相同技能，永遠不會觸發`);
      }
    }

    for (const map of maps.all) {
      for (const { enemyId } of map.spawns) {
        if (!enemies.has(enemyId)) problems.push(`map '${map.id}' 引用不存在的 enemy '${enemyId}'`);
      }
      for (const { lootTable } of map.chests) {
        if (!lootTables.has(lootTable)) problems.push(`map '${map.id}' 的寶箱引用不存在的 lootTable '${lootTable}'`);
      }
    }

    if (problems.length > 0 || !balance) throw new DataValidationError(problems);
    return new DataRegistry(balance, skills, enemies, items, potions, affixes, lootTables, floors, maps, comboRules, eliteAffixes, legendaries);
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
