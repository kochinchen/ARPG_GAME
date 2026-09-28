import type { Element } from '../data/schema/common';
import type { EffectDef } from '../data/schema/effects';
import type { SkillDef } from '../data/schema/skill';
import type { SfxName } from './Sfx';

/**
 * 技能的聲音：由技能資料（標籤、效果種類、元素）推導，新技能只改 src/data/ 也會自動有聲音。
 * - windup：開始施放時（法術的蓄力）
 * - release：效果觸發時（揮下、放箭、發射）
 * - impact：範圍效果落地 / 連鎖閃電（AreaTriggered / ChainTriggered）
 */
export interface SkillSound {
  windup?: SfxName;
  release: SfxName[];
  impact?: SfxName;
}

interface Traits {
  types: Set<EffectDef['type']>;
  element: Element;
  multiShot: boolean;
}

function collect(effects: readonly EffectDef[], out: Traits): Traits {
  for (const e of effects) {
    out.types.add(e.type);
    if (e.type === 'damage' && e.element !== 'physical' && out.element === 'physical') out.element = e.element;
    if (e.type === 'projectile' && Math.max(...[e.count].flat()) > 1) out.multiShot = true;
    if ('effects' in e) collect(e.effects, out);
    if ('onHit' in e) collect(e.onHit, out);
  }
  return out;
}

const SPELL: Record<Element, { cast: SfxName; bolt: SfxName; burst: SfxName }> = {
  physical: { cast: 'summon', bolt: 'arcaneBolt', burst: 'slam' },
  fire: { cast: 'fireCast', bolt: 'fireBolt', burst: 'fireBurst' },
  cold: { cast: 'coldCast', bolt: 'coldBolt', burst: 'coldBurst' },
  lightning: { cast: 'lightningCast', bolt: 'zap', burst: 'thunder' },
  poison: { cast: 'poisonCast', bolt: 'poisonBolt', burst: 'poisonBurst' },
};

export function skillSound(skill: SkillDef): SkillSound {
  const tags = new Set(skill.tags);
  const t = collect(skill.effects, { types: new Set(), element: 'physical', multiShot: false });
  const has = (type: EffectDef['type']) => t.types.has(type);
  const spell = SPELL[t.element];

  if (has('summon')) return { release: ['summon'] };
  if (tags.has('defense')) return { release: ['parry'] };
  if (has('chain')) return { windup: 'lightningCast', release: ['zap'], impact: 'zap' };

  // 近戰：揮砍的輕重 + 突進 + 元素附魔
  if (tags.has('melee')) {
    const heavy = tags.has('heavy');
    const swing: SfxName = heavy ? 'swingHeavy' : tags.has('combo') ? 'swingQuick' : 'swing';
    const release: SfxName[] = has('dash') ? ['dash', swing] : [swing];
    if (t.element !== 'physical') release.push(spell.bolt);
    // 大範圍的重擊（震地、裂地）落地時再加一聲撞擊
    const impact: SfxName | undefined = heavy && tags.has('area') ? (has('knockback') || has('status') ? 'quake' : 'slam') : undefined;
    return impact ? { release, impact } : { release };
  }

  // 弓箭
  if (tags.has('ranged')) {
    if (tags.has('area')) return { release: [t.multiShot ? 'bowMulti' : 'bowHeavy'], impact: has('knockback') ? 'fireBurst' : 'arrowRain' };
    if (t.multiShot || has('delayed')) return { release: ['bowMulti'] };
    return { release: [has('knockback') ? 'bowHeavy' : 'bow'] };
  }

  // 法術：投射物在發射時出聲；範圍法術先蓄力，落地時爆開
  if (has('projectile')) {
    const release: SfxName[] = [spell.bolt];
    return has('area') || has('zone') ? { release, impact: spell.burst } : { release };
  }
  if (has('area')) return { windup: spell.cast, release: [], impact: spell.burst };
  // 只有持續區域（火牆）：沒有 AreaTriggered，出現時就爆開
  if (has('zone')) return { windup: spell.cast, release: [spell.burst] };
  return { release: [spell.bolt] };
}
