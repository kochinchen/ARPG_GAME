import type { SkillDef } from '../../data/schema/skill';

export type CombatCategory = 'melee' | 'ranged' | 'magic';

/**
 * 技能屬於近戰 / 遠程 / 魔法哪一類（決定 MP、吸血倍率與近戰加成）。
 * 技能樹技能依類別；不在技能樹的（普通攻擊、怪物技能）依 tag 判斷。Support 被動回傳 null。
 */
export function combatCategory(skill: SkillDef): CombatCategory | null {
  const category = skill.tree?.category;
  if (category === 'melee' || category === 'ranged' || category === 'magic') return category;
  if (category === 'support') return null;
  if (skill.tags.includes('melee')) return 'melee';
  if (skill.tags.includes('spell')) return 'magic';
  if (skill.tags.includes('ranged')) return 'ranged';
  return null;
}
