import type { Rng } from '../../core/Rng';
import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { EnemyDef } from '../../data/schema/enemy';
import type { SkillCategory, SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';

/** 怪物版主角技能的 ID 前綴（data/mimicSkills.ts） */
export const MIMIC_PREFIX = 'mimic.';
const MAX_RANK = 5;

/** 數值另外設定、樣子和主角招式相同的怪物技能 */
const SAME_LOOK: Readonly<Record<string, string>> = { 'enemy.tail_flame_burst': 'magic.flame_burst', 'enemy.tail_frost_nova': 'magic.frost_nova' };

/** 怪物版技能對應的主角技能 ID（畫面沿用主角的特效）；其他技能原樣回傳 */
export function originalSkillId(skillId: string): string {
  const look = SAME_LOOK[skillId];
  if (look) return look;
  return skillId.startsWith(MIMIC_PREFIX) ? skillId.slice(MIMIC_PREFIX.length) : skillId;
}

export interface MimicRoll {
  skillId: string;
  rank: number;
}

/**
 * 怪物學主角技能（設計者 2026-10-30）：依樓層決定學得到第幾層、機率多少，每隻最多一招。
 * 法術系（原本的技能有 spell 標籤）學法術樹，保持距離的學遠程樹，其他學近戰樹。
 * 不論結果都固定擲兩次亂數：同一個生成索引讀檔後學到的技能不變。
 */
export function rollMimic(
  def: EnemyDef,
  floor: number,
  guaranteed: boolean,
  skills: DataTable<SkillDef>,
  config: Balance['enemyMimic'],
  rng: Rng,
): MimicRoll | null {
  const learnRoll = rng.next();
  const pickRoll = rng.next();
  if (def.boss || def.ai === 'none' || def.spellbook) return null;
  const unlock = [...config.unlocks].reverse().find((u) => u.minFloor <= floor);
  if (!unlock || (!guaranteed && learnRoll >= unlock.chance)) return null;
  const school = schoolOf(def, skills);
  const candidates = skills.all.filter((s) => {
    if (!s.id.startsWith(MIMIC_PREFIX)) return false;
    const tree = skills.get(s.id.slice(MIMIC_PREFIX.length)).tree;
    return tree?.category === school && tree.tier <= unlock.maxTier;
  });
  if (candidates.length === 0) return null;
  const skill = candidates[Math.floor(pickRoll * candidates.length)]!;
  return { skillId: skill.id, rank: mimicRank(floor, config) };
}

/** 怪物版技能的等級：第一個解鎖樓層為 Lv1，之後每 floorsPerRank 層 +1（更淺的樓層也是 Lv1） */
function mimicRank(floor: number, config: Balance['enemyMimic']): number {
  return Math.min(MAX_RANK, 1 + Math.max(0, Math.floor((floor - config.unlocks[0]!.minFloor) / config.floorsPerRank)));
}

export interface SpellbookRoll {
  /** 這隻的普通攻擊 */
  basic: string;
  /** 會的法術（高階的排前面） */
  spells: string[];
}

/**
 * 法師的法術書（設計者 2026-11-08）：會的系各有 tier 階的招；低機率多一招 tier + 1（越深越高）；精英低機率再多一招 tier + 2。
 * 不論結果都固定擲五次亂數：同一個生成索引讀檔後學到的招不變。
 */
export function rollSpellbook(def: EnemyDef, floor: number, elite: boolean, skills: DataTable<SkillDef>, config: Balance['mageSpellbook'], rng: Rng): SpellbookRoll | null {
  const [basicRoll, upperRoll, upperPick, eliteRoll, elitePick] = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
  const book = def.spellbook;
  if (!book) return null;
  const spell = (branch: string, tier: number) =>
    skills.all.find((s) => {
      if (!s.id.startsWith(MIMIC_PREFIX)) return false;
      const tree = skills.get(s.id.slice(MIMIC_PREFIX.length)).tree;
      return tree?.category === 'magic' && tree.tier === tier && tree.branch === branch;
    })?.id;
  const pick = (roll: number) => book.schools[Math.floor(roll * book.schools.length)]!;
  const { fromFloor, toFloor, chance } = config.upper;
  const t = Math.max(0, Math.min(1, (floor - fromFloor) / (toFloor - fromFloor)));
  const spells: (string | undefined)[] = book.schools.map((s) => spell(s.branch, book.tier));
  if (upperRoll < chance[0] + (chance[1] - chance[0]) * t) spells.unshift(spell(pick(upperPick).branch, book.tier + 1));
  if (elite && eliteRoll < config.eliteChance) spells.unshift(spell(pick(elitePick).branch, book.tier + 2));
  return { basic: pick(basicRoll).basic, spells: spells.filter((id): id is string => id !== undefined) };
}

/** 學會法術書：招式等級隨樓層（一般法師有上限）；精英固定 1 級 */
export function teachSpellbook(actor: Actor, roll: SpellbookRoll, floor: number, mimic: Balance['enemyMimic'], config: Balance['mageSpellbook']): void {
  if (!actor.ai) return;
  const rank = actor.elite ? 1 : Math.min(config.maxRank, mimicRank(floor, mimic));
  actor.skillRanks.set(roll.basic, 1);
  actor.ai.skillId = roll.basic;
  for (const id of roll.spells) actor.skillRanks.set(id, rank);
  actor.ai.specialSkills = roll.spells;
}

/** 物理系 / 法術系：原本的技能有 spell 標籤就是法術系 */
export function schoolOf(def: EnemyDef, skills: DataTable<SkillDef>): SkillCategory {
  if (def.spellbook) return 'magic';
  if (def.skills.some((id) => skills.has(id) && skills.get(id).tags.includes('spell'))) return 'magic';
  return def.ai === 'ranged' ? 'ranged' : 'melee';
}

/** 學會的招式排在特殊技能的最前面（冷卻好、目標在範圍內就優先使用） */
export function teachMimic(actor: Actor, mimic: MimicRoll): void {
  if (!actor.ai) return;
  actor.skillRanks.set(mimic.skillId, mimic.rank);
  actor.ai.specialSkills = [mimic.skillId, ...actor.ai.specialSkills];
}
