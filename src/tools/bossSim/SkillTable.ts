import { rankRange, rankValue, type Element } from '../../data/schema/common';
import type { StatId } from '../../data/schema/common';
import type { DataRegistry } from '../../data/DataRegistry';
import type { EffectDef } from '../../data/schema/effects';
import type { EnemyDef } from '../../data/schema/enemy';
import type { SkillDef } from '../../data/schema/skill';
import { mitigationMultiplier } from '../../game/combat/DamagePipeline';
import type { Actor } from '../../game/entities/Actor';
import { SPELL_SPREAD } from '../../game/skills/effects/DamageEffect';
import { StatBlock } from '../../game/stats/StatBlock';

export interface DamageLine {
  element: Element;
  /** 未計主角減傷 */
  rawMin: number;
  rawMax: number;
  /** 打在主角身上 */
  min: number;
  max: number;
  /** 站著全吃時的命中次數（投射物發數、地面區域的跳數…） */
  count: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  /** 哪些階段會用（0 = 初始）；空陣列 = 被動 */
  phases: number[];
  passive: boolean;
  /** 收爪時連發（站著不動，不看冷卻） */
  barrage: boolean;
  castTime: number;
  cooldown: number;
  range: number;
  telegraph: boolean;
  lines: DamageLine[];
  /** 一次全部命中的傷害合計 */
  fullHit: number;
  extras: string[];
}

const STATUS_NAMES: Record<string, string> = {
  slow: '緩速', freeze: '冰凍', stun: '暈眩', burn: '燃燒', armorBreak: '破甲', weakPoint: '弱點', airborne: '浮空',
  marked: '標記', poison: '中毒', bleed: '流血', expose: '弱化',
};

/** 把巢狀效果攤平成傷害行；count = 外層造成的命中次數 */
function walk(effects: readonly EffectDef[], count: number, caster: Actor, target: Actor, data: Pick<DataRegistry, 'balance' | 'enemies'>, info: SkillInfo): void {
  for (const e of effects) {
    switch (e.type) {
      case 'damage': {
        const stats = caster.stats;
        const multiplier = rankValue(e.multiplier, 1) * (1 + stats.get('damageBonus'));
        const [baseMin, baseMax]: [number, number] =
          e.scaling === 'weapon'
            ? [stats.get('damageMin'), stats.get('damageMax')]
            : e.scaling === 'spell'
              ? [stats.get('spellPower') * (1 - SPELL_SPREAD), stats.get('spellPower') * (1 + SPELL_SPREAD)]
              : e.base
                ? rankRange(e.base, 1)
                : [0, 0];
        const taken = mitigationMultiplier(target, e.element, 0, data.balance);
        const line = {
          element: e.element,
          rawMin: baseMin * multiplier,
          rawMax: baseMax * multiplier,
          min: Math.max(1, Math.round(baseMin * multiplier * taken)),
          max: Math.max(1, Math.round(baseMax * multiplier * taken)),
          count: count * e.hits,
        };
        const same = info.lines.find((l) => l.element === line.element && l.min === line.min && l.max === line.max);
        if (same) same.count += line.count;
        else info.lines.push(line);
        break;
      }
      case 'status':
        if (e.target === 'target' && STATUS_NAMES[e.status]) info.extras.push(`${STATUS_NAMES[e.status]} ${rankValue(e.duration, 1)} 秒`);
        break;
      case 'seal':
        info.extras.push(`奪取一個技能 ${rankValue(e.duration, 1)} 秒`);
        break;
      case 'summon':
        info.extras.push(`召喚 ${data.enemies.get(e.enemyId).name} ×${e.count}`);
        break;
      case 'knockback':
        info.extras.push(rankValue(e.distance, 1) < 0 ? '拉近' : '擊退');
        break;
      case 'projectile':
        // 迴旋的飛斧：去程、回程各打一次
        walk(e.onHit, count * rankValue(e.count, 1) * (e.returns ? 2 : 1), caster, target, data, info);
        break;
      case 'delayed':
        walk(e.effects, count * e.repeat, caster, target, data, info);
        break;
      case 'zone':
        walk(e.effects, count * Math.max(1, Math.round(rankValue(e.duration, 1) / e.interval)), caster, target, data, info);
        break;
      case 'dash':
        walk(e.onPath, count, caster, target, data, info);
        break;
      case 'area':
      case 'chain':
      case 'leap':
        walk(e.effects, count, caster, target, data, info);
        break;
      default:
        break;
    }
  }
}

/** 每個階段會用的招式（沒有另外指定就沿用上一階段；含收爪時連發的招式） */
function phaseSkillSets(def: EnemyDef): readonly string[][] {
  const sets = [def.skills];
  let skills = def.skills;
  for (const phase of def.phases) {
    skills = phase.skills ?? skills;
    sets.push([...skills, ...(phase.clawCycle?.closedBarrage.skills ?? [])]);
  }
  return sets;
}

/** 階段對照表的一欄 */
export interface PhaseColumn {
  label: string;
  /** 血量低於這個比例時進入（第一階段是 1） */
  hpBelow: number;
  /** 累計到這個階段的屬性 */
  stats: StatBlock;
  added: string[];
  removed: string[];
  mechanics: string[];
}

/** 階段會改到的屬性之外，每一欄都列出來的屬性 */
const PHASE_STATS: readonly StatId[] = ['damageMin', 'damageMax', 'damageBonus', 'attackSpeed', 'moveSpeed'];

/** 階段要改的屬性（對照表的列） */
export function phaseStatIds(def: EnemyDef): StatId[] {
  return [...new Set(def.phases.flatMap((p) => p.modifiers.map((m) => m.stat)))].filter((stat) => !PHASE_STATS.includes(stat));
}

/** 每個階段的屬性、招式增減與機制。不必真的打到那個階段就能比較（和 BossSystem 用同樣的 Modifier） */
export function buildPhaseTable(def: EnemyDef, enemy: Actor, data: Pick<DataRegistry, 'enemies' | 'skills'>): PhaseColumn[] {
  const name = (id: string) => data.skills.get(id).name;
  const statIds = [...PHASE_STATS, ...phaseStatIds(def)];
  const sets = phaseSkillSets(def);
  const modifiers: EnemyDef['phases'][number]['modifiers'] = [];
  return sets.map((set, i) => {
    const phase = i === 0 ? null : def.phases[i - 1]!;
    modifiers.push(...(phase?.modifiers ?? []));
    const stats = new StatBlock(Object.fromEntries(statIds.map((stat) => [stat, enemy.stats.getBase(stat)])));
    modifiers.forEach((m, n) => stats.addModifier({ stat: m.stat, kind: m.kind, value: m.value, source: `phase-${n}` }));
    const before = i === 0 ? set : sets[i - 1]!;
    const mechanics: string[] = [];
    if (phase?.pause !== undefined) mechanics.push(`進入時停住 ${phase.pause} 秒（任何攻擊無效）`);
    if (phase?.clawCycle) {
      const c = phase.clawCycle;
      mechanics.push(`爪子收合 ${c.closedFor} 秒（減傷 ${Math.round(c.reduction * 100)}%、站著不動、連發 ${c.closedBarrage.skills.map(name).join('、')}）／張開 ${c.openFor[0]}～${c.openFor[1]} 秒`);
    }
    if (phase?.detach) mechanics.push(`脫離出${data.enemies.get(phase.detach.enemyId).name}（牠死掉時本體僵直 ${phase.detach.stagger} 秒）`);
    return {
      label: phase?.label ?? '初始',
      hpBelow: phase?.hpBelow ?? 1,
      stats,
      added: i === 0 ? [] : [...new Set(set)].filter((id) => !before.includes(id)).map(name),
      removed: i === 0 ? [] : [...new Set(before)].filter((id) => !set.includes(id)).map(name),
      mechanics,
    };
  });
}

/** 這隻敵人的所有技能，用牠目前的屬性（含階段加成）與主角目前的防禦計算 */
export function buildSkillTable(def: EnemyDef, caster: Actor, target: Actor, data: Pick<DataRegistry, 'balance' | 'enemies' | 'skills'>): SkillInfo[] {
  const sets = phaseSkillSets(def);
  const ids = [...new Set(sets.flat())];
  const barrage = def.phases.flatMap((p) => p.clawCycle?.closedBarrage.skills ?? []);
  const passives = def.passives.map((p) => p.skill).filter((id) => !ids.includes(id));
  return [...ids, ...passives].map((id) => {
    const base = data.skills.get(id);
    // 隱藏魔王：實際出招用屬性版本
    const variant = caster.innateElements ? `${id}.${caster.innateElements[0]}` : null;
    const skill: SkillDef = variant && data.skills.has(variant) ? data.skills.get(variant) : base;
    const info: SkillInfo = {
      id,
      name: base.name,
      description: base.description,
      phases: sets.flatMap((set, i) => (set.includes(id) ? [i] : [])),
      passive: passives.includes(id),
      barrage: barrage.includes(id),
      castTime: skill.useAttackSpeed ? 1 / caster.stats.get('attackSpeed') : skill.castTime,
      cooldown: skill.cooldown,
      range: skill.range ?? caster.stats.get('attackRange'),
      telegraph: skill.telegraph,
      lines: [],
      fullHit: 0,
      extras: [],
    };
    walk(skill.effects, 1, caster, target, data, info);
    if (skill.minRange !== undefined) info.extras.unshift(`目標 ${skill.minRange} 格外才用`);
    info.extras = [...new Set(info.extras)];
    info.fullHit = info.lines.reduce((s, l) => s + ((l.min + l.max) / 2) * l.count, 0);
    return info;
  });
}
