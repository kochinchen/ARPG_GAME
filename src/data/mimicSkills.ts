import type { z } from 'zod';
import { balance } from './balance';
import type { EffectDefSchema } from './schema/effects';
import type { SkillDefSchema } from './schema/skill';

type SkillInput = z.input<typeof SkillDefSchema>;
type EffectInput = z.input<typeof EffectDefSchema>;
type RankNumber = number | [number, number, number, number, number];

/** 會被怪物學走的技能樹（戰術的機關、輔助的被動不在內） */
const SCHOOLS = ['melee', 'ranged', 'magic'] as const;
/** 沒有寫 range 的技能：對自己施放、近身的方向 / 地面技能，目標在這麼近才使用（Tile） */
const CLOSE_REACH = 1.5;
/** 沒有寫 range 的投射物技能：用投射物飛行距離的這個比例 */
const PROJECTILE_REACH = 0.6;

/**
 * 怪物版的主角技能（設計者 2026-10-30）：ID 為 `mimic.` + 原技能 ID。
 * 傷害與持續傷害 × balance.enemyMimic.damage、冷卻與前搖放慢、不耗魔力；
 * 法術強度改用怪物的傷害計算（怪物沒有法術強度）。哪些怪物在哪幾層學得到見 balance.enemyMimic。
 */
export function mimicSkills(source: readonly SkillInput[]): SkillInput[] {
  const { damage, cooldownMultiplier, minCooldown, cooldownPerTier, castTimeMultiplier } = balance.enemyMimic;
  return source
    .filter((s) => s.tree && (SCHOOLS as readonly string[]).includes(s.tree.category) && (s.kind ?? 'active') === 'active')
    .filter((s) => !s.effects?.some(hasSpawner))
    .map((s): SkillInput => {
      const { tree: _tree, cost: _cost, ...rest } = s;
      return {
        ...rest,
        id: `mimic.${s.id}`,
        description: `怪物學會的「${s.name}」。`,
        cooldown: Math.max(minCooldown + cooldownPerTier * (s.tree!.tier - 1), (s.cooldown ?? 0) * cooldownMultiplier),
        castTime: (s.castTime ?? 0.3) * castTimeMultiplier,
        range: s.range ?? reachOf(s),
        effects: (s.effects ?? []).map((e) => scaleEffect(e, damage)),
      };
    });
}

/** 召喚、機關不給怪物 */
function hasSpawner(effect: EffectInput): boolean {
  if (effect.type === 'summon' || effect.type === 'device') return true;
  return children(effect).some(hasSpawner);
}

function children(effect: EffectInput): EffectInput[] {
  switch (effect.type) {
    case 'projectile':
      return effect.onHit ?? [];
    case 'dash':
      return effect.onPath ?? [];
    case 'area':
    case 'chain':
    case 'zone':
    case 'delayed':
      return effect.effects ?? [];
    default:
      return [];
  }
}

/** 沒有寫 range 的技能：有投射物用飛行距離的一部分，其他（對自己、近身）用 CLOSE_REACH；對單一敵人的用怪物的攻擊距離 */
function reachOf(skill: SkillInput): number | undefined {
  if ((skill.targeting ?? 'enemy') === 'enemy') return undefined;
  const projectile = findProjectile(skill.effects ?? []);
  return projectile ? projectile.range * PROJECTILE_REACH : CLOSE_REACH;
}

/** 第一個投射物（可能包在延遲效果裡，例如連射） */
function findProjectile(effects: readonly EffectInput[]): Extract<EffectInput, { type: 'projectile' }> | null {
  for (const e of effects) {
    if (e.type === 'projectile') return e;
    const inner = findProjectile(children(e));
    if (inner) return inner;
  }
  return null;
}

const scaleRank = (value: RankNumber | undefined, factor: number): RankNumber =>
  Array.isArray(value) ? (value.map((v) => v * factor) as RankNumber) : (value ?? 1) * factor;

/** 傷害倍率、燃燒 / 中毒 / 流血的強度乘上 factor */
function scaleEffect(effect: EffectInput, factor: number): EffectInput {
  switch (effect.type) {
    case 'damage':
      return {
        ...effect,
        // 怪物沒有法術強度與盾牌：一律用怪物的傷害
        scaling: effect.scaling === 'spell' || effect.scaling === 'shield' ? 'weapon' : effect.scaling,
        multiplier: scaleRank(effect.multiplier, factor),
      };
    case 'status':
      if (effect.status !== 'burn' && effect.status !== 'poison' && effect.status !== 'bleed') return effect;
      return { ...effect, magnitude: scaleRank(effect.magnitude, factor), burnScaling: 'attack' };
    case 'projectile':
      return { ...effect, onHit: (effect.onHit ?? []).map((e) => scaleEffect(e, factor)) };
    case 'dash':
      return { ...effect, onPath: (effect.onPath ?? []).map((e) => scaleEffect(e, factor)) };
    case 'area':
    case 'chain':
    case 'zone':
    case 'delayed':
      return { ...effect, effects: effect.effects.map((e) => scaleEffect(e, factor)) };
    default:
      return effect;
  }
}
