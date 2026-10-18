import type { Balance } from '../../data/schema/balance';
import { WEAPON_TYPE_LABELS, type WeaponType } from '../../data/schema/item';
import type { ActiveCategory, SkillDef } from '../../data/schema/skill';
import { SKILL_CATEGORY_LABELS } from '../../data/skillTree';

export type CombatCategory = ActiveCategory;

/**
 * 技能屬於近戰 / 遠程 / 魔法 / 戰術哪一類（決定 MP、吸血倍率與近戰加成）。
 * 技能樹技能依類別；不在技能樹的（普通攻擊、怪物技能）依 tag 判斷。Support 被動回傳 null。
 */
export function combatCategory(skill: SkillDef): CombatCategory | null {
  const category = skill.tree?.category;
  if (category === 'support') return null;
  if (category) return category;
  if (skill.tags.includes('melee')) return 'melee';
  if (skill.tags.includes('spell')) return 'magic';
  if (skill.tags.includes('ranged')) return 'ranged';
  return null;
}

/**
 * 武器允許矩陣（純函式）：拿這把武器時不能用的技能，回傳原因；可以用回傳 null。
 * 沒拿武器時不限制；沒有類別的技能（Support 被動）不限制。
 */
export function weaponDenial(skill: SkillDef, weapon: WeaponType | undefined, rules: Balance['weaponRules']): string | null {
  const category = combatCategory(skill);
  if (!weapon || !category || rules[weapon].includes(category)) return null;
  return `${WEAPON_TYPE_LABELS[weapon]}無法使用${SKILL_CATEGORY_LABELS[category]}技能`;
}
