import type { SkillBranch, SkillCategory, SkillDef } from '../../data/schema/skill';

/**
 * 技能樹解鎖規則（純函式，不修改任何狀態）。
 *
 * 階段一（Mastery 前）：任一類 T1 可學；T(n) 需要同類別、同路線的 T(n-1)
 * 階段二（任一類學會第一個 T4 → Mastery）：其他類別的 T1～T3 直接開放，不需前置
 * 階段三：其他類別的 T4 需花「T4 開通次數」逐類開通；開通後仍需同路線的 T3
 * 所有節點另需角色等級 ≥ tierLevelReq[tier]；每個技能最多 maxSkillRank 級
 */

export interface TreeState {
  level: number;
  /** 技能 ID → 等級（未學為 0 或不存在） */
  ranks: ReadonlyMap<string, number>;
  skillPoints: number;
  t4Charges: number;
  /** 以開通次數打開 T4 的類別 */
  t4Unlocked: ReadonlySet<SkillCategory>;
}

export interface TreeRules {
  maxSkillRank: number;
  /** index 0 = T1 */
  tierLevelReq: readonly [number, number, number, number];
}

export type LearnBlock =
  | 'notInTree'
  | 'maxRank'
  | 'noPoints'
  | 'level'
  | 'prerequisite'
  /** 其他類別的 T4 尚未開通 */
  | 't4Locked';

export type LearnCheck = { ok: true } | { ok: false; reason: LearnBlock };

/** 以技能樹位置查詢技能 */
export class SkillTreeIndex {
  private readonly byPosition = new Map<string, SkillDef>();

  constructor(skills: readonly SkillDef[]) {
    for (const s of skills) if (s.tree) this.byPosition.set(key(s.tree.category, s.tree.tier, s.tree.branch), s);
  }

  at(category: SkillCategory, tier: number, branch: SkillBranch): SkillDef | undefined {
    return this.byPosition.get(key(category, tier, branch));
  }

  get all(): SkillDef[] {
    return [...this.byPosition.values()];
  }
}

const key = (category: string, tier: number, branch: string) => `${category}:${tier}:${branch}`;
const rankOf = (state: TreeState, id: string) => state.ranks.get(id) ?? 0;

/** 已學會 T4 的類別（觸發 Mastery 的類別與已開通後學了 T4 的類別） */
export function categoriesWithT4(state: TreeState, index: SkillTreeIndex): Set<SkillCategory> {
  const result = new Set<SkillCategory>();
  for (const s of index.all) if (s.tree?.tier === 4 && rankOf(state, s.id) > 0) result.add(s.tree.category);
  return result;
}

/** 是否已達成 Mastery（任一類學會 T4） */
export function masteryAchieved(state: TreeState, index: SkillTreeIndex): boolean {
  return categoriesWithT4(state, index).size > 0;
}

/** 某類別的 T4 是否可以學（前置條件另外檢查） */
export function isT4Open(state: TreeState, index: SkillTreeIndex, category: SkillCategory): boolean {
  const withT4 = categoriesWithT4(state, index);
  // Mastery 前所有類別都能依正常路線學到 T4；之後只有「已有 T4」或「已開通」的類別
  return withT4.size === 0 || withT4.has(category) || state.t4Unlocked.has(category);
}

export function checkLearn(state: TreeState, rules: TreeRules, index: SkillTreeIndex, skill: SkillDef): LearnCheck {
  const tree = skill.tree;
  if (!tree) return { ok: false, reason: 'notInTree' };
  const rank = rankOf(state, skill.id);
  if (rank >= rules.maxSkillRank) return { ok: false, reason: 'maxRank' };
  if (state.skillPoints <= 0) return { ok: false, reason: 'noPoints' };
  if (state.level < rules.tierLevelReq[tree.tier - 1]!) return { ok: false, reason: 'level' };
  // 已學會的技能升級只需要點數與等級
  if (rank > 0) return { ok: true };

  if (tree.tier === 4 && !isT4Open(state, index, tree.category)) return { ok: false, reason: 't4Locked' };
  if (tree.tier === 1) return { ok: true };

  const withT4 = categoriesWithT4(state, index);
  // Mastery 後，其他類別（尚無 T4 的類別）的 T1～T3 不需前置
  if (tree.tier <= 3 && withT4.size > 0 && !withT4.has(tree.category)) return { ok: true };

  const previous = index.at(tree.category, tree.tier - 1, tree.branch);
  if (!previous || rankOf(state, previous.id) <= 0) return { ok: false, reason: 'prerequisite' };
  return { ok: true };
}

export type UnlockBlock = 'noMastery' | 'noCharges' | 'alreadyOpen';
export type UnlockCheck = { ok: true } | { ok: false; reason: UnlockBlock };

/** 能否花一次 T4 開通次數打開某類別的 T4 */
export function checkUnlockT4(state: TreeState, index: SkillTreeIndex, category: SkillCategory): UnlockCheck {
  if (!masteryAchieved(state, index)) return { ok: false, reason: 'noMastery' };
  if (isT4Open(state, index, category)) return { ok: false, reason: 'alreadyOpen' };
  if (state.t4Charges <= 0) return { ok: false, reason: 'noCharges' };
  return { ok: true };
}
