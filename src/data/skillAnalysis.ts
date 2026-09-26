import type { EffectDef } from './schema/effects';
import type { SkillDef } from './schema/skill';

/**
 * 由技能效果推導的資訊（不手填，避免與效果脫節）。資料驗證與遊戲共用。
 */

/** 一次施放的總命中段數（Combo 規則的 Hits 條件、MultiHit 標籤檢查使用） */
export function countHits(effects: readonly EffectDef[]): number {
  let hits = 0;
  for (const e of effects) {
    switch (e.type) {
      case 'damage':
        hits += e.hits;
        break;
      case 'projectile':
        hits += e.count * countHits(e.onHit);
        break;
      case 'area':
        hits += countHits(e.effects);
        break;
      case 'chain':
        hits += (e.jumps + 1) * countHits(e.effects);
        break;
      case 'zone':
        hits += Math.max(1, Math.round(e.duration / e.interval)) * countHits(e.effects);
        break;
      case 'delayed':
        hits += e.repeat * countHits(e.effects);
        break;
      default:
        break;
    }
  }
  return hits;
}

/** 攤平所有巢狀效果 */
export function flattenEffects(effects: readonly EffectDef[]): EffectDef[] {
  return effects.flatMap((e) => {
    const nested = e.type === 'projectile' ? e.onHit : 'effects' in e ? e.effects : [];
    return [e, ...flattenEffects(nested)];
  });
}

const ELEMENT_OF = { Physical: 'physical', Fire: 'fire', Ice: 'cold', Lightning: 'lightning' } as const;

/**
 * Combo 標籤與實際效果的一致性檢查：標籤宣稱的特性，效果裡必須找得到。
 * 回傳問題清單（空陣列 = 一致）。
 */
export function checkComboTags(skill: SkillDef): string[] {
  const info = skill.combo;
  if (!info) return [];
  const all = flattenEffects(skill.effects);
  const statuses = new Set(all.flatMap((e) => (e.type === 'status' ? [e.status] : [])));
  const dashes = all.flatMap((e) => (e.type === 'dash' ? [e.direction] : []));
  const projectiles = all.flatMap((e) => (e.type === 'projectile' ? [e] : []));
  const damages = all.flatMap((e) => (e.type === 'damage' ? [e] : []));
  const problems: string[] = [];
  const need = (ok: boolean, tag: string, evidence: string) => {
    if (!ok) problems.push(`標籤 ${tag} 需要${evidence}`);
  };

  for (const tag of info.action) {
    if (tag === 'Projectile') need(projectiles.length > 0, tag, '投射物');
    if (tag === 'Pierce') need(projectiles.some((p) => p.pierce > 0), tag, '可穿透的投射物');
    if (tag === 'MultiHit') need(countHits(skill.effects) >= 2, tag, '至少 2 段命中');
    if (tag === 'AoE') {
      need(all.some((e) => e.type === 'area' || e.type === 'zone' || e.type === 'chain') || projectiles.some((p) => p.count > 1), tag, '範圍、地面區域、連鎖或多發投射物');
    }
    if (tag === 'Execute') need(damages.some((d) => d.bonus && 'hpBelow' in d.bonus.when), tag, '對低血量目標的加成');
    if (tag === 'Counter') need(statuses.has('counter'), tag, '反擊狀態');
    if (tag === 'Guard') need(statuses.has('guard') || statuses.has('ironWill'), tag, '防禦類狀態');
  }
  for (const tag of info.control) {
    if (tag === 'Knockback') need(all.some((e) => e.type === 'knockback'), tag, '擊退效果');
    if (tag === 'Shield') need(statuses.has('guard') || statuses.has('ironWill'), tag, '防禦類狀態');
    const status = { Slow: 'slow', Freeze: 'freeze', Stun: 'stun', ArmorBreak: 'armorBreak', Mark: 'weakPoint' }[tag as string];
    if (status) need(statuses.has(status as never), tag, `${status} 狀態`);
  }
  for (const tag of info.movement) {
    if (tag === 'Advance') need(dashes.includes('forward'), tag, '向前位移');
    if (tag === 'Retreat') need(dashes.includes('backward'), tag, '向後位移');
    if (tag === 'Roll' || tag === 'Dash') need(dashes.length > 0, tag, '位移');
  }
  for (const tag of info.damage) {
    const element = ELEMENT_OF[tag];
    // 反擊的傷害在觸發時才計算
    need(damages.some((d) => d.element === element) || (tag === 'Physical' && statuses.has('counter')), tag, `${element} 傷害`);
  }
  for (const tag of info.element) need(info.damage.includes(tag), tag, '對應的 DamageTag');
  return problems;
}
