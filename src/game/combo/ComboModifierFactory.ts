import type { ComboModifierDef, ComboModifierType, ComboRuleDef } from '../../data/schema/combo';
import type { Element } from '../../data/schema/common';
import type { ComboProfile } from './ComboSkillIndex';
import { emptyMods, type NumericModKey, type StepMods } from './StepMods';

/** Lv1～Lv5 的 Combo 加成倍率 */
export const LEVEL_FACTOR = [1, 1.1, 1.2, 1.3, 1.4] as const;
export const levelFactor = (rank: number) => LEVEL_FACTOR[Math.min(Math.max(rank, 1), 5) - 1]!;

/** 數量、次數、開關類不隨等級縮放 */
const UNSCALED: ReadonlySet<ComboModifierType> = new Set(['projectileCount', 'pierce', 'chainCount', 'hitCount', 'knockbackResist']);

const ELEMENT_OF = { Fire: 'fire', Ice: 'cold', Lightning: 'lightning' } as const;

export interface BuiltModifiers {
  steps: [StepMods, StepMods, StepMods];
  /** 整組連段期間施放者免疫擊退 */
  knockbackResist: boolean;
}

/**
 * Rule 的 Modifier 資料 → 三個步驟各自的加成（套用條件與 LevelFactor）。
 * 新增 Modifier 類型時只需在這裡與讀取它的效果中處理，規則比對不受影響。
 */
export function buildModifiers(rule: ComboRuleDef, profiles: readonly ComboProfile[], ranks: readonly number[]): BuiltModifiers {
  const steps: [StepMods, StepMods, StepMods] = [emptyMods(), emptyMods(), emptyMods()];
  let knockbackResist = false;

  for (const mod of rule.modifiers) {
    if (!conditionMet(mod, profiles)) continue;
    if (mod.type === 'knockbackResist') {
      knockbackResist = true;
      continue;
    }
    for (const index of targetSteps(mod)) {
      const value = mod.value * (UNSCALED.has(mod.type) ? 1 : levelFactor(ranks[index] ?? 1));
      const mods = steps[index]!;
      if (mod.when && 'targetHasStatus' in mod.when) {
        if (mod.type === 'damage' || mod.type === 'crit' || mod.type === 'stagger') {
          mods.vsTarget.push({ type: mod.type, statuses: mod.when.targetHasStatus, value });
        }
      } else if (mod.type === 'elementDamage') {
        const element = resolveElement(mod, profiles);
        if (element) mods.elementDamage.push({ element, value });
      } else {
        mods[mod.type as NumericModKey] += value;
      }
    }
  }
  return { steps, knockbackResist };
}

function targetSteps(mod: ComboModifierDef): number[] {
  switch (mod.target) {
    case 'step1':
      return [0];
    case 'step2':
      return [1];
    case 'step3':
      return [2];
    case 'allSteps':
      return [0, 1, 2];
    case 'self':
      return [];
  }
}

/** 判定時就能決定的條件（targetHasStatus 在命中時判斷） */
function conditionMet(mod: ComboModifierDef, profiles: readonly ComboProfile[]): boolean {
  const when = mod.when;
  if (!when) return true;
  if ('stepHasTag' in when) return profiles[when.stepHasTag.step - 1]?.tags.has(when.stepHasTag.tag) ?? false;
  if ('stepLacksTag' in when) return !(profiles[when.stepLacksTag.step - 1]?.tags.has(when.stepLacksTag.tag) ?? true);
  if ('hitsAtLeast' in when) {
    const hits = when.hitsAtLeast.steps.reduce((sum, s) => sum + (profiles[s - 1]?.hits ?? 0), 0);
    return hits >= when.hitsAtLeast.hits;
  }
  return true;
}

function resolveElement(mod: ComboModifierDef, profiles: readonly ComboProfile[]): Element | null {
  if (mod.element && mod.element !== 'fromStep1') return mod.element === 'ice' ? 'cold' : mod.element;
  const first = profiles[0]?.elementTags[0];
  return first ? ELEMENT_OF[first] : null;
}

// ───────────────────── 說明文字（Codex / UI） ─────────────────────

const LABELS: Record<Exclude<ComboModifierType, 'elementDamage' | 'knockbackResist'>, [string, 'pct' | 'count' | 'points']> = {
  damage: ['傷害', 'pct'],
  crit: ['暴擊率', 'points'],
  aoeRadius: ['範圍', 'pct'],
  projectileSize: ['投射物大小', 'pct'],
  projectileSpeed: ['投射物速度', 'pct'],
  projectileCount: ['投射物數量', 'count'],
  pierce: ['穿透', 'count'],
  armorPenetration: ['穿甲', 'pct'],
  knockback: ['擊退距離', 'pct'],
  stagger: ['硬直', 'pct'],
  attackSpeed: ['攻擊速度', 'pct'],
  castSpeed: ['施法速度', 'pct'],
  animationSpeed: ['動作速度', 'pct'],
  burn: ['燃燒', 'pct'],
  freezeChance: ['冰凍機率', 'points'],
  freezeDuration: ['冰凍時間', 'pct'],
  statusChance: ['狀態觸發機率', 'points'],
  chainCount: ['連鎖次數', 'count'],
  hitCount: ['命中次數', 'count'],
  mp: ['魔力消耗', 'pct'],
  movementSpeed: ['位移距離', 'pct'],
};

const ELEMENT_LABELS: Record<string, string> = { fire: '火焰', cold: '冰霜', lightning: '雷電', physical: '物理' };
const STATUS_LABELS: Record<string, string> = { slow: '緩速', freeze: '冰凍', weakPoint: '標記', stun: '暈眩', burn: '燃燒' };

const fmt = (v: number, unit: 'pct' | 'count' | 'points') =>
  unit === 'count' ? `+${v}` : `${v >= 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`;

/** 產生每一步的加成說明，例如「第三招：傷害 +30%、範圍 +40%」 */
export function describeModifiers(built: BuiltModifiers): string[] {
  const lines: string[] = [];
  built.steps.forEach((mods, i) => {
    const parts: string[] = [];
    for (const [key, [label, unit]] of Object.entries(LABELS) as [NumericModKey, [string, 'pct' | 'count' | 'points']][]) {
      const v = mods[key];
      if (v !== 0) parts.push(`${label} ${fmt(v, unit)}${key === 'stagger' ? '（未實作）' : ''}`);
    }
    for (const e of mods.elementDamage) parts.push(`追加 ${ELEMENT_LABELS[e.element]}傷害 ${fmt(e.value, 'pct')}`);
    for (const c of mods.vsTarget) {
      const who = c.statuses.map((s) => STATUS_LABELS[s] ?? s).join(' / ');
      parts.push(`對${who}目標${LABELS[c.type][0]} ${fmt(c.value, LABELS[c.type][1])}`);
    }
    if (parts.length) lines.push(`第${'一二三'[i]}招：${parts.join('、')}`);
  });
  if (built.knockbackResist) lines.push('整組連段期間免疫擊退');
  return lines;
}
