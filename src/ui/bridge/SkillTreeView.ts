import type { DataRegistry } from '../../data/DataRegistry';
import { SKILL_BRANCHES, SKILL_CATEGORIES, SKILL_TIERS, type SkillCategory, type SkillDef } from '../../data/schema/skill';
import { SKILL_CATEGORY_LABELS, SKILL_ROUTE_LABELS } from '../../data/skillTree';
import type { GameWorld } from '../../game/GameWorld';
import type { LearnBlock } from '../../game/skills/MasteryRule';
import { describeSkill } from '../../game/skills/SkillDescriber';

export type { SkillCategory };
export type ComboKey = 0 | 1 | 2;

export interface SkillNodeView {
  id: string;
  name: string;
  description: string;
  kind: 'active' | 'passive';
  tier: number;
  branch: string;
  rank: number;
  maxRank: number;
  levelReq: number;
  canLearn: boolean;
  /** 無法學習 / 升級的原因（可學時為 null） */
  blocked: string | null;
  /** 目前等級的效果（未學時顯示 Lv1） */
  now: string[];
  /** 下一級的效果（已滿級時為 null） */
  next: string[] | null;
  isLeft: boolean;
  /** 出現在哪些連段位置，例如 ['Q1', 'Q2'] */
  usedIn: string[];
  equippedSupport: boolean;
}

export interface CategoryView {
  category: SkillCategory;
  label: string;
  kind: 'active' | 'passive';
  routes: string[];
  /** index 0 = T1；每層依路線 A / B / C */
  tiers: { tier: number; levelReq: number; nodes: SkillNodeView[] }[];
  t4Open: boolean;
  canUnlock: boolean;
}

export interface SlotView {
  id: string;
  name: string;
}

export interface ComboView {
  key: ComboKey;
  label: string;
  steps: (SlotView | null)[];
  /** 每一格是否已解鎖，以及解鎖等級 */
  unlocked: boolean[];
  unlockLevels: number[];
  active: boolean;
  /** none：沒有 Combo；unknown：有 Combo 但尚未發現（???）；known：已發現 */
  status: 'none' | 'unknown' | 'known';
  name: string | null;
  description: string[];
}

export interface CodexEntryView {
  comboId: string;
  name: string;
  skills: string[];
  description: string[];
  timesUsed: number;
}

export interface SkillTreeView {
  level: number;
  skillPoints: number;
  t4Charges: number;
  mastery: boolean;
  categories: CategoryView[];
  left: SlotView | null;
  combos: ComboView[];
  supports: (SlotView | null)[];
  codex: CodexEntryView[];
}

export function emptySkillTreeView(): SkillTreeView {
  return { level: 1, skillPoints: 0, t4Charges: 0, mastery: false, categories: [], left: null, combos: [], supports: [], codex: [] };
}

/** 版本簽章：成長狀態或按鍵配置改變時才重建 */
export function skillTreeSignature(world: GameWorld): string {
  const l = world.loadout;
  return `${world.progress.version}|${world.codex.version}|${l.left}|${l.combos.map((c) => c.join(',')).join('/')}|${l.supports.join(',')}|${l.activeCombo}`;
}

export function buildSkillTreeView(world: GameWorld, data: DataRegistry): SkillTreeView {
  const tree = world.skillTree;
  const { balance } = data;
  const loadout = world.loadout;
  const player = world.player;
  const slot = (id: string | null): SlotView | null => (id && data.skills.has(id) ? { id, name: data.skills.get(id).name } : null);

  const blockedText = (reason: LearnBlock, skill: SkillDef): string => {
    const t = skill.tree!;
    switch (reason) {
      case 'maxRank':
        return '已達最高等級';
      case 'noPoints':
        return '沒有技能點';
      case 'level':
        return `需要等級 ${balance.tierLevelReq[t.tier - 1]}`;
      case 'prerequisite':
        return `需要「${tree.index.at(t.category, t.tier - 1, t.branch)?.name ?? '前一層'}」`;
      case 't4Locked':
        return '需要開通此類第四層';
      case 'notInTree':
        return '不在技能樹中';
    }
  };

  const usedIn = (id: string) =>
    loadout.combos.flatMap((steps, c) => steps.flatMap((s, i) => (s === id ? [`${'QWE'[c]}${i + 1}`] : [])));

  const nodeView = (skill: SkillDef): SkillNodeView => {
    const rank = tree.rank(skill.id);
    const check = tree.check(skill);
    const shown = Math.max(rank, 1);
    const lines = (r: number) => describeSkill(skill, r, world.skills.manaCost(skill, r, player));
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      kind: skill.kind,
      tier: skill.tree!.tier,
      branch: skill.tree!.branch,
      rank,
      maxRank: balance.maxSkillRank,
      levelReq: balance.tierLevelReq[skill.tree!.tier - 1]!,
      canLearn: check.ok,
      blocked: check.ok ? null : blockedText(check.reason, skill),
      now: lines(shown),
      next: rank > 0 && rank < balance.maxSkillRank ? lines(rank + 1) : null,
      isLeft: loadout.left === skill.id,
      usedIn: usedIn(skill.id),
      equippedSupport: loadout.supports.includes(skill.id),
    };
  };

  return {
    level: world.progress.level,
    skillPoints: world.progress.skillPoints,
    t4Charges: world.progress.t4Charges,
    mastery: tree.mastery,
    categories: SKILL_CATEGORIES.map((category) => {
      const unlock = tree.checkUnlock(category);
      return {
        category,
        label: SKILL_CATEGORY_LABELS[category],
        kind: category === 'support' ? 'passive' : 'active',
        routes: SKILL_BRANCHES.map((b) => SKILL_ROUTE_LABELS[category][b]),
        tiers: SKILL_TIERS.map((tier) => ({
          tier,
          levelReq: balance.tierLevelReq[tier - 1]!,
          nodes: SKILL_BRANCHES.flatMap((branch) => {
            const skill = tree.index.at(category, tier, branch);
            return skill ? [nodeView(skill)] : [];
          }),
        })),
        t4Open: !unlock.ok && unlock.reason === 'alreadyOpen',
        canUnlock: unlock.ok,
      };
    }),
    left: slot(loadout.left),
    combos: loadout.combos.map((steps, key) => {
      const unlockedCount = world.comboSlotsUnlocked;
      const sequence = steps.slice(0, unlockedCount).filter((s): s is string => s !== null);
      // UI 只讀取判定結果，不自己判斷任何 Combo 規則
      const resolution = world.comboResolver.resolve(sequence, (id) => player.skillRanks.get(id) ?? 1);
      const known = resolution.status === 'combo' && world.codex.has(resolution.comboId);
      return {
        key: key as ComboKey,
        label: 'QWE'[key]!,
        steps: steps.map(slot),
        unlocked: [0, 1, 2].map((i) => i < unlockedCount),
        unlockLevels: [...balance.player.comboSlotLevels],
        active: loadout.activeCombo === key,
        status: resolution.status === 'none' ? 'none' : known ? 'known' : 'unknown',
        name: known && resolution.status === 'combo' ? resolution.displayName : null,
        description: known && resolution.status === 'combo' ? resolution.description : [],
      };
    }),
    supports: loadout.supports.map(slot),
    codex: world.codex.all.map((e) => ({
      comboId: e.comboId,
      name: e.comboName,
      skills: e.skills.map((id) => data.skills.get(id).name),
      description: e.effectDescription,
      timesUsed: e.timesUsed,
    })),
  };
}
