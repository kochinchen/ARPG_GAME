import type { SkillBranch, SkillCategory } from './schema/skill';

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  melee: '近戰',
  ranged: '遠程',
  magic: '魔法',
  utility: '戰術',
  support: '輔助',
};

/** 各類別三條路線的名稱 */
export const SKILL_ROUTE_LABELS: Record<SkillCategory, Record<SkillBranch, string>> = {
  melee: { A: '重擊', B: '連擊', C: '刃術' },
  ranged: { A: '精準', B: '彈幕', C: '射術' },
  magic: { A: '火焰', B: '冰霜', C: '雷電' },
  utility: { A: '身法', B: '機關', C: '投擲' },
  support: { A: '生存', B: '資源', C: '戰鬥強化' },
};
