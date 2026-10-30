import { balance } from '../../data/balance';
import { rankRange, rankValue } from '../../data/schema/common';
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
  enemy: '指定目標',
  direction: '指定方向',
  ground: '指定位置',
  self: '自身',
};

/** Combo 判定用的距離分類 */
const RANGE_LABELS: Record<'Near' | 'Mid' | 'Far', string> = { Near: '近身', Mid: '中距離', Far: '遠距離' };

/** 說明文字本身已講明對象的自身狀態，不加「自身：」 */
const SELF_EXPLAINED = new Set<StatusKind>(['meleeEmpower', 'rangedEmpower']);

const pctText = (v: number) => `${Math.round(v * 1000) / 10}%`;

function statusText(kind: StatusKind, duration: number, magnitude: number, chance: number, physical = 0): string {
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
    case 'airborne':
      return `命中使敵人浮空 ${duration} 秒`;
    case 'marked':
      return `標記 ${duration} 秒：對標記目標造成傷害 +${pctText(magnitude)}`;
    case 'meleeEmpower':
      return `命中後 ${duration} 秒內，下一個近戰技能傷害 +${pctText(magnitude)}`;
    case 'rangedEmpower':
      return `${duration} 秒內，下一個遠程技能傷害 +${pctText(magnitude)}`;
    case 'poison':
      return `中毒：${duration} 秒內共 ${pctText(magnitude)} 武器傷害（毒素，每秒結算，最多疊 3 層）${chanceText}`;
    case 'bleed':
      return `流血：${duration} 秒內共 ${pctText(magnitude)} 武器傷害（物理，每秒結算，可暴擊；重新命中刷新）${chanceText}`;
    case 'expose':
      return `弱化 ${duration} 秒：火焰 / 冰霜 / 雷電抗性 -${pctText(magnitude)}${physical > 0 ? `、物理抗性 -${pctText(physical)}` : ''}（直接相減，可以降到負數）`;
  }
}

function effectLines(effects: readonly EffectDef[], rank: number): string[] {
  const lines: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case 'damage': {
        const m = rankValue(e.multiplier, rank);
        const scale = e.scaling === 'weapon' ? '武器傷害' : e.scaling === 'spell' ? '法術強度' : e.scaling === 'shield' ? '盾牌防禦' : '';
        const flat = e.base ? rankRange(e.base, rank) : [0, 0];
        const amount = e.scaling === 'flat' ? `${flat[0]}–${flat[1]}` : `${pctText(m)}${e.hits > 1 ? ` × ${e.hits}` : ''} ${scale}`;
        lines.push(`${ELEMENT_LABELS[e.element]}傷害 ${amount}`);
        if (e.bonus) {
          const when = 'status' in e.bonus.when ? `對${statusName(e.bonus.when.status)}目標` : `目標生命低於 ${pctText(e.bonus.when.hpBelow)} 時，`;
          const bonusPct = rankValue(e.bonus.damagePct, rank);
          if (bonusPct > 0) lines.push(`${when}傷害 +${pctText(bonusPct)}`);
          if (e.bonus.critChance > 0) lines.push(`${when}暴擊率 +${pctText(e.bonus.critChance)}`);
        }
        break;
      }
      case 'status':
        // 指定等級才有的效果（機率 0 的等級不顯示）
        if (rankValue(e.chance, rank) <= 0) break;
        lines.push(
          (e.target === 'self' && !SELF_EXPLAINED.has(e.status) ? '自身：' : '') +
            statusText(e.status, rankValue(e.duration, rank), rankValue(e.magnitude, rank), rankValue(e.chance, rank), rankValue(e.physicalMagnitude, rank)),
        );
        break;
      case 'knockback':
        lines.push(`擊退 ${rankValue(e.distance, rank)} 格`);
        break;
      case 'dash':
        lines.push(`${e.direction === 'forward' ? (e.passThrough ? '穿越' : '突進') : '後跳'} ${e.distance} 格`, ...effectLines(e.onPath, rank));
        break;
      case 'projectile': {
        const count = rankValue(e.count, rank);
        const spread = rankValue(e.spreadDeg, rank);
        const parts = [count > 1 ? `${count} 發投射物` : '投射物'];
        if (count > 1 && spread > 0) parts.push(spread >= 360 ? '環狀' : `散射 ${spread}°`);
        const pierce = Math.round(rankValue(e.pierce, rank));
        if (pierce > 0) parts.push(pierce >= 99 ? '穿透所有敵人' : `穿透 ${pierce}`);
        if (e.aimAssistDeg > 0) parts.push('自動修正方向');
        lines.push(parts.join('，'), ...effectLines(e.onHit, rank));
        break;
      }
      case 'area':
        lines.push(`範圍 ${rankValue(e.radius, rank)} 格${e.angleDeg !== undefined && e.angleDeg < 360 ? `（${e.angleDeg}° 扇形）` : ''}`, ...effectLines(e.effects, rank));
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
      case 'summon':
        lines.push(`召喚 ${e.count} 隻（最多同時 ${e.maxAlive} 隻）`);
        break;
      case 'device': {
        // 有群組的（毒蛛）只看自己的上限與生命；戰術機關受全身上限、生命與防禦最高是主角的 statCap
        const { maxAlive: cap, statCap } = balance.devices!;
        const own = rankValue(e.maxAlive, rank);
        const maxAlive = e.group ? own : Math.min(own, cap);
        const hpPct = e.group ? rankValue(e.hpPct, rank) : Math.min(rankValue(e.hpPct, rank), statCap);
        lines.push(
          `機關：生命 ${pctText(hpPct)} 最大生命、防禦${e.group ? '同角色' : ` ${pctText(statCap)} 角色防禦`}，持續 ${rankValue(e.duration, rank)} 秒${maxAlive > 1 ? `，可同時 ${maxAlive} 個${e.group ? '' : '（所有機關合計）'}` : ''}`,
        );
        if (e.behavior === 'trip' && e.line) lines.push(`面前 ${e.forward ?? 0} 格橫放 ${e.line.length} 格寬；碰到的敵人各觸發一次（共 ${rankValue(e.triggers, rank)} 次）：`, ...effectLines(e.onTrigger, rank));
        if (e.behavior === 'proximity') lines.push(`${e.armDelay} 秒後待命，敵人進入 ${e.triggerRadius} 格內時觸發：`, ...effectLines(e.onTrigger, rank));
        if (e.behavior === 'turret') lines.push(`每 ${e.interval} 秒朝 ${e.range} 格內最近的敵人射擊，共 ${rankValue(e.shots, rank)} 發：`, ...effectLines(e.onShot, rank));
        const sameBlast = e.onDestroy.length > 0 && JSON.stringify(e.onDestroy) === JSON.stringify(e.onExpire);
        if (sameBlast) lines.push('被打壞或時間到時：', ...effectLines(e.onDestroy, rank));
        else {
          if (e.onDestroy.length > 0 && JSON.stringify(e.onDestroy) !== JSON.stringify(e.onTrigger)) lines.push('被打壞時：', ...effectLines(e.onDestroy, rank));
          else if (e.onDestroy.length > 0) lines.push('被打壞時也會觸發');
          if (e.onExpire.length > 0) lines.push('時間到時：', ...effectLines(e.onExpire, rank));
        }
        break;
      }
    }
  }
  return lines.filter((l) => l !== '');
}

function statusName(kind: StatusKind): string {
  return {
    slow: '緩速',
    freeze: '冰凍',
    stun: '暈眩',
    burn: '燃燒',
    armorBreak: '破甲',
    weakPoint: '弱點',
    guard: '防禦',
    counter: '反擊',
    ironWill: '鋼鐵意志',
    unstoppable: '不動',
    airborne: '浮空',
    marked: '標記',
    meleeEmpower: '近戰強化',
    rangedEmpower: '遠程強化',
    poison: '中毒',
    bleed: '流血',
    expose: '弱化',
  }[kind];
}

/** 技能在某等級的說明（技能頁的資訊欄使用） */
export function describeSkill(skill: SkillDef, rank: number, manaCost: number): string[] {
  const r = Math.max(rank, 1);
  if (skill.kind === 'passive') {
    return skill.passive.map((b) => `${STAT_LABELS[b.stat]} ${formatValue(b.stat, b.modifier, rankValue(b.values, r), true)}`);
  }
  // 距離分類（近 / 中 / 遠）：Combo 規則與裝備效果用它判定（例如「三招皆為近身」）
  const distance = skill.combo ? [`${RANGE_LABELS[skill.combo.range]}`] : [];
  const header = [...distance, `${TARGETING_LABELS[skill.targeting]} · 魔力 ${Math.round(manaCost * 10) / 10}`];
  if (skill.cooldown > 0) header.push(`冷卻 ${skill.cooldown} 秒`);
  const range = skill.range !== undefined && skill.targeting !== 'self' ? [`射程 ${skill.range} 格`] : [];
  const lines = effectLines(skill.effects, r);
  // 戰術技能：武器傷害與法術強度取較高者（攻擊力）
  if (skill.tree?.category === 'utility' && lines.some((l) => /武器傷害|法術強度/.test(l))) {
    return [header.join(' · '), ...range, '攻擊力 = 武器傷害與法術強度取較高者', ...lines.map((l) => l.replace(/武器傷害|法術強度/g, '攻擊力'))];
  }
  return [header.join(' · '), ...range, ...lines];
}
