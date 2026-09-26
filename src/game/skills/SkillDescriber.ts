import { rankValue } from '../../data/schema/common';
import type { EffectDef, StatusKind } from '../../data/schema/effects';
import type { SkillDef, TargetType } from '../../data/schema/skill';
import { formatValue, STAT_LABELS } from '../items/ItemDescriber';

const ELEMENT_LABELS: Record<string, string> = {
  physical: '物理',
  fire: '火焰',
  cold: '冰霜',
  lightning: '雷電',
  poison: '毒素',
};

const TARGETING_LABELS: Record<TargetType, string> = {
  enemy: '單體',
  direction: '方向',
  ground: '地面',
  self: '自身',
};

const pctText = (v: number) => `${Math.round(v * 1000) / 10}%`;

function statusText(kind: StatusKind, duration: number, magnitude: number, chance: number): string {
  const chanceText = chance < 1 ? `（機率 ${pctText(chance)}）` : '';
  switch (kind) {
    case 'slow':
      return `緩速 ${pctText(magnitude)}，${duration} 秒${chanceText}`;
    case 'freeze':
      return `冰凍 ${duration} 秒${chanceText}（Boss 改為強力緩速）`;
    case 'stun':
      return `暈眩 ${duration} 秒${chanceText}`;
    case 'burn':
      return magnitude > 0 ? `燃燒：每秒 ${pctText(magnitude)} 法術強度，${duration} 秒` : `使目標燃燒 ${duration} 秒`;
    case 'armorBreak':
      return `破甲：防禦 -${pctText(magnitude)}，${duration} 秒`;
    case 'weakPoint':
      return `弱點：受到的暴擊傷害 +${pctText(magnitude)}，${duration} 秒`;
    case 'guard':
      return `下一次受到的傷害 -${pctText(magnitude)}（${duration} 秒內）`;
    case 'counter':
      return `反擊：${pctText(magnitude)} 武器傷害（${duration} 秒內）`;
    case 'ironWill':
      return `減傷 ${pctText(magnitude)} 並免疫擊退，${duration} 秒`;
    case 'unstoppable':
      return `免疫擊退，${duration} 秒`;
  }
}

function effectLines(effects: readonly EffectDef[], rank: number): string[] {
  const lines: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case 'damage': {
        const m = rankValue(e.multiplier, rank);
        const scale = e.scaling === 'weapon' ? '武器傷害' : e.scaling === 'spell' ? '法術強度' : '';
        const amount = e.scaling === 'flat' ? `${e.base?.[0]}–${e.base?.[1]}` : `${pctText(m)}${e.hits > 1 ? ` × ${e.hits}` : ''} ${scale}`;
        lines.push(`${ELEMENT_LABELS[e.element]}傷害 ${amount}`);
        if (e.bonus) {
          const when = 'status' in e.bonus.when ? `對${statusName(e.bonus.when.status)}目標` : `對 HP < ${pctText(e.bonus.when.hpBelow)} 的目標`;
          if (e.bonus.damagePct > 0) lines.push(`${when}傷害 +${pctText(e.bonus.damagePct)}`);
          if (e.bonus.critChance > 0) lines.push(`${when}暴擊率 +${pctText(e.bonus.critChance)}`);
        }
        break;
      }
      case 'status':
        lines.push(
          (e.target === 'self' ? '自身：' : '') +
            statusText(e.status, rankValue(e.duration, rank), rankValue(e.magnitude, rank), rankValue(e.chance, rank)),
        );
        break;
      case 'knockback':
        lines.push(`擊退 ${e.distance} 格`);
        break;
      case 'dash':
        lines.push(`${e.direction === 'forward' ? '向前' : '向後'}位移 ${e.distance} 格`);
        break;
      case 'projectile': {
        const parts = [e.count > 1 ? `${e.count} 發投射物` : '投射物'];
        if (e.pierce > 0) parts.push(`穿透 ${e.pierce}`);
        if (e.aimAssistDeg > 0) parts.push('自動修正方向');
        lines.push(parts.join('，'), ...effectLines(e.onHit, rank));
        break;
      }
      case 'area':
        lines.push(`範圍 ${e.radius} 格${e.angleDeg !== undefined && e.angleDeg < 360 ? `（${e.angleDeg}° 扇形）` : ''}`, ...effectLines(e.effects, rank));
        break;
      case 'chain':
        lines.push(`連鎖跳躍 ${e.jumps} 次`, ...effectLines(e.effects, rank));
        break;
      case 'zone':
        lines.push(`地面效果持續 ${e.duration} 秒，每 ${e.interval} 秒：`, ...effectLines(e.effects, rank));
        break;
      case 'delayed':
        lines.push(e.repeat > 1 ? `共 ${e.repeat} 次：` : e.delay > 0 ? `${e.delay} 秒後：` : '', ...effectLines(e.effects, rank));
        break;
    }
  }
  return lines.filter((l) => l !== '');
}

function statusName(kind: StatusKind): string {
  return { slow: '緩速', freeze: '冰凍', stun: '暈眩', burn: '燃燒', armorBreak: '破甲', weakPoint: '弱點', guard: '防禦', counter: '反擊', ironWill: '鋼鐵意志', unstoppable: '不動' }[kind];
}

/** 技能在某等級的說明（技能頁的資訊欄使用） */
export function describeSkill(skill: SkillDef, rank: number, manaCost: number): string[] {
  const r = Math.max(rank, 1);
  if (skill.kind === 'passive') {
    return skill.passive.map((b) => `${STAT_LABELS[b.stat]} ${formatValue(b.stat, b.modifier, rankValue(b.values, r), true)}`);
  }
  const header = [`${TARGETING_LABELS[skill.targeting]} · 魔力 ${Math.round(manaCost * 10) / 10}`];
  if (skill.cooldown > 0) header.push(`冷卻 ${skill.cooldown} 秒`);
  return [header.join(' · '), ...effectLines(skill.effects, r)];
}
