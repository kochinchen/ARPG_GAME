import { gameData } from '../src/data';
import { DataRegistry } from '../src/data/DataRegistry';
import { isRangeSequenceValid } from '../src/data/schema/combo';
import { rankRange, rankValue } from '../src/data/schema/common';
import type { WeaponType } from '../src/data/schema/item';
import type { SkillCategory } from '../src/data/schema/skill';
import { SKILL_CATEGORY_LABELS, SKILL_ROUTE_LABELS } from '../src/data/skillTree';
import { defenseMitigation } from '../src/game/combat/DamagePipeline';
import { ComboResolver } from '../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../src/game/combo/ComboSkillIndex';
import { STAT_LABELS } from '../src/game/items/ItemDescriber';
import { xpToNext } from '../src/game/progression/ExperienceSystem';
import { categoriesWithT4, checkLearn, checkUnlockT4, isT4Open, masteryAchieved, SkillTreeIndex, type TreeState } from '../src/game/skills/MasteryRule';
import { describeSkill } from '../src/game/skills/SkillDescriber';
import { combatCategory, weaponDenial } from '../src/game/skills/skillCategory';

/**
 * 角色成長模擬頁的遊戲邏輯（npm run docs:sim → release/設計文件/sim.js，全域變數 window.Sim）：
 * 與遊戲共用資料、Combo 判定、技能樹規則、技能說明與武器允許矩陣，頁面不自己重寫規則。
 */
const data = DataRegistry.load(gameData);
const profiles = new ComboSkillIndex(data.skills);
const resolver = new ComboResolver(data.comboRules, profiles, data.balance.combo.nearNearFarBonus);
const tree = new SkillTreeIndex(data.skills.all);

/** 某等級的魔力（套用類別倍率，不含裝備的魔力消耗降低） */
function manaCost(skillId: string, rank: number): number {
  const skill = data.skills.get(skillId);
  const category = combatCategory(skill);
  return rankValue(skill.cost.mana, Math.max(1, rank)) * (category ? data.balance.skillCategories[category].manaCost : 1);
}

export const Sim = {
  balance: data.balance,
  skills: data.skills.all,
  enemies: data.enemies.all,
  items: data.items.all,
  comboRules: data.comboRules.all,
  tree,
  labels: { category: SKILL_CATEGORY_LABELS, route: SKILL_ROUTE_LABELS, stat: STAT_LABELS },
  resolve: (ids: string[], rankOf: (id: string) => number) => resolver.resolve(ids, rankOf),
  profile: (id: string) => profiles.get(id),
  checkLearn: (state: TreeState, id: string) => checkLearn(state, data.balance, tree, data.skills.get(id)),
  checkUnlockT4: (state: TreeState, category: SkillCategory) => checkUnlockT4(state, tree, category),
  masteryAchieved: (state: TreeState) => masteryAchieved(state, tree),
  isT4Open: (state: TreeState, category: SkillCategory) => isT4Open(state, tree, category),
  categoriesWithT4: (state: TreeState) => [...categoriesWithT4(state, tree)],
  describe: (id: string, rank: number) => describeSkill(data.skills.get(id), rank, manaCost(id, rank)),
  manaCost,
  category: (id: string) => combatCategory(data.skills.get(id)),
  /** v0.4.0 武器允許矩陣：拿這把武器不能用時回傳原因（空手 = 不限制） */
  weaponDenial: (id: string, weapon: WeaponType | '') => weaponDenial(data.skills.get(id), weapon || undefined, data.balance.weaponRules),
  xpToNext: (level: number) => xpToNext(level, data.balance),
  defenseMitigation,
  rankValue,
  rankRange,
  isRangeSequenceValid,
};

(globalThis as { Sim?: typeof Sim }).Sim = Sim;
