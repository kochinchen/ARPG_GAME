import type { Rng } from '../../core/Rng';
import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { EnemyDef } from '../../data/schema/enemy';
import type { SkillCategory, SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';

/** 怪物版主角技能的 ID 前綴（data/mimicSkills.ts） */
export const MIMIC_PREFIX = 'mimic.';
const MAX_RANK = 5;

/** 怪物版技能對應的主角技能 ID（畫面沿用主角的特效）；其他技能原樣回傳 */
export function originalSkillId(skillId: string): string {
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
  if (def.boss || def.ai === 'none') return null;
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
  const rank = Math.min(MAX_RANK, 1 + Math.floor((floor - config.unlocks[0]!.minFloor) / config.floorsPerRank));
  return { skillId: skill.id, rank };
}

/** 物理系 / 法術系：原本的技能有 spell 標籤就是法術系 */
export function schoolOf(def: EnemyDef, skills: DataTable<SkillDef>): SkillCategory {
  if (def.skills.some((id) => skills.has(id) && skills.get(id).tags.includes('spell'))) return 'magic';
  return def.ai === 'ranged' ? 'ranged' : 'melee';
}

/** 學會的招式排在特殊技能的最前面（冷卻好、目標在範圍內就優先使用） */
export function teachMimic(actor: Actor, mimic: MimicRoll): void {
  if (!actor.ai) return;
  actor.skillRanks.set(mimic.skillId, mimic.rank);
  actor.ai.specialSkills = [mimic.skillId, ...actor.ai.specialSkills];
}
