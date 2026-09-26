import type { DataTable } from '../../data/DataRegistry';
import { isRangeSequenceValid, type ComboRuleDef, type StepMatcher } from '../../data/schema/combo';
import { buildModifiers, describeModifiers, type BuiltModifiers } from './ComboModifierFactory';
import type { ComboProfile, ComboSkillIndex } from './ComboSkillIndex';

export type NoComboReason = 'tooShort' | 'tripleSame' | 'invalidRange' | 'noRule' | 'notComboSkill';

export type ComboResolution =
  | { status: 'none'; steps: string[]; reason: NoComboReason }
  | {
      status: 'combo';
      steps: string[];
      rule: ComboRuleDef;
      /** Codex 以「規則 + 具體排列」為單位 */
      comboId: string;
      displayName: string;
      modifiers: BuiltModifiers;
      description: string[];
    };

/**
 * 判定一組連段是否產生 Combo（純函式，不修改任何狀態）。
 * 無論結果如何，steps 都是原始排列：不合理的組合照常施放，只是沒有加成。
 */
export class ComboResolver {
  private readonly rules: ComboRuleDef[];

  constructor(
    rules: DataTable<ComboRuleDef>,
    private readonly skills: ComboSkillIndex,
  ) {
    // Tier 小 → Specificity 大 → order 小
    this.rules = [...rules.all].sort((a, b) => a.tier - b.tier || specificity(b) - specificity(a) || a.order - b.order);
  }

  resolve(skillIds: readonly string[], rankOf: (skillId: string) => number): ComboResolution {
    const steps = [...skillIds];
    if (steps.length < 3) return { status: 'none', steps, reason: 'tooShort' };
    const profiles = steps.map((id) => this.skills.get(id));
    if (profiles.some((p) => !p)) return { status: 'none', steps, reason: 'notComboSkill' };
    const [a, b, c] = profiles as [ComboProfile, ComboProfile, ComboProfile];

    if (a.id === b.id && b.id === c.id) return { status: 'none', steps, reason: 'tripleSame' };
    if (!isRangeSequenceValid(a.range, b.range, c.range)) return { status: 'none', steps, reason: 'invalidRange' };

    const rule = this.rules.find((r) => matches(r, [a, b, c]));
    if (!rule) return { status: 'none', steps, reason: 'noRule' };

    const modifiers = buildModifiers(rule, [a, b, c], steps.map(rankOf));
    return {
      status: 'combo',
      steps,
      rule,
      comboId: `${rule.id}|${steps.join('>')}`,
      displayName: rule.displayNames.find((d) => d.finalSkill === c.id)?.name ?? rule.name,
      modifiers,
      description: describeModifiers(modifiers),
    };
  }
}

export function matches(rule: ComboRuleDef, skills: readonly [ComboProfile, ComboProfile, ComboProfile]): boolean {
  const m = rule.match;
  if (m.kind === 'exact') return m.skills.every((id, i) => id === skills[i]!.id);
  if (!m.steps.every((matcher, i) => stepMatches(matcher, skills[i]!))) return false;
  if (m.distinctSkills && new Set(skills.map((s) => s.id)).size !== 3) return false;
  if (m.sameElement && !skills.every((s) => s.elementTags.includes(m.sameElement!))) return false;
  if (m.rangePattern && !m.rangePattern.every((r, i) => skills[i]!.range === r)) return false;
  return true;
}

function stepMatches(m: StepMatcher, s: ComboProfile): boolean {
  if (m.anyTags && !m.anyTags.some((t) => s.tags.has(t))) return false;
  if (m.allTags && !m.allTags.every((t) => s.tags.has(t))) return false;
  if (m.range && !m.range.includes(s.range)) return false;
  if (m.role && !m.role.includes(s.role)) return false;
  if (m.hasDamage && s.damageTags.length === 0) return false;
  if (m.hasElement && s.elementTags.length === 0) return false;
  return true;
}

/** 條件越多越具體；同層衝突時較具體者優先 */
export function specificity(rule: ComboRuleDef): number {
  const m = rule.match;
  if (m.kind === 'exact') return 100;
  const step = (s: StepMatcher) =>
    (s.anyTags ? 1 : 0) + (s.allTags?.length ?? 0) + (s.range ? 1 : 0) + (s.role ? 1 : 0) + (s.hasDamage ? 1 : 0) + (s.hasElement ? 1 : 0);
  return m.steps.reduce((sum, s) => sum + step(s), 0) + (m.distinctSkills ? 1 : 0) + (m.sameElement ? 1 : 0) + (m.rangePattern ? 1 : 0);
}
