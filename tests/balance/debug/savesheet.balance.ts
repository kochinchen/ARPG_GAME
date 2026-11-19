import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { defenseMitigation } from '../../../src/game/combat/DamagePipeline';
import { affixLineTexts } from '../../../src/game/items/ItemDescriber';
import { EQUIPMENT_SLOTS } from '../../../src/game/items/ItemInstance';
import { StatIdSchema } from '../../../src/data/schema/common';
import { applySave, loadSave } from '../sim/fromSave';
import { data, makeWorld } from '../sim/run';

/** 除錯用：存檔角色的體檢表（SAVE=存檔路徑、F=樓層、OUT=輸出檔）：屬性、技能、裝備、最終數值、該層怪物的數值 */
it('savesheet', () => {
  const save = loadSave(process.env.SAVE!, data);
  const floor = Number(process.env.F ?? save.data.floor.current);
  const { world } = makeWorld(1, save.data.meta.runSeed);
  applySave(world, data, save.data, floor, 1);
  const p = world.player;
  const s = p.stats;
  const out: string[] = [];
  out.push(`Lv ${world.progress.level}，存檔在第 ${save.data.floor.current} 層（最深 ${save.data.floor.highest}），遊玩 ${(save.data.meta.playTimeSec / 3600).toFixed(1)} 小時`);
  out.push(`屬性點：${JSON.stringify(save.data.attributes.allocated)}`);
  out.push(`技能：${Object.entries(save.data.skills.ranks).map(([id, r]) => `${data.skills.get(id).name}${r}`).join('、')}`);
  out.push(`左鍵：${data.skills.get(save.data.loadout.left).name}；連段：${save.data.loadout.combos.map((c) => c.map((id) => (id ? data.skills.get(id).name : '-')).join('→')).join(' | ')}`);
  out.push('— 裝備 —');
  for (const slot of EQUIPMENT_SLOTS) {
    const item = world.equipment.get(slot);
    if (!item) continue;
    const base = data.items.get(item.baseId);
    const cores = item.sockets?.cores.map((c) => `${c.types.join('+')} T${c.tier} ${c.rarity}`).join('、') ?? '';
    out.push(`${slot}: ${base.name}（階 ${base.tier ?? '-'}）${item.rarity} iLv${item.itemLevel} 主倍率 +${Math.round((item.quality ?? 0) * 100)}%${item.legendaryId ? ` ${data.legendaries.get(item.legendaryId).name}` : ''} 孔 ${item.sockets?.cores.length ?? 0}/${item.sockets?.max ?? 0} [${cores}]`);
    for (const line of affixLineTexts(item, data)) out.push(`    ${line}`);
  }
  out.push('— 最終數值 —');
  for (const id of StatIdSchema.options) {
    const v = s.get(id);
    if (v !== 0) out.push(`${id}: ${Math.abs(v) < 5 ? v.toFixed(3) : Math.round(v)}`);
  }
  out.push(`防禦減傷：${(defenseMitigation(s.get('defense'), data.balance.combat.defenseConstant) * 100).toFixed(1)}%`);
  out.push(`— 第 ${floor} 層的怪物（一般怪，同種取平均） —`);
  const groups = new Map<string, { n: number; hp: number; min: number; max: number; speed: number; range: number; def: number }>();
  for (const a of world.actors) {
    if (a.faction !== 'enemy' || a.isBoss || a.elite) continue;
    const g = groups.get(a.name) ?? { n: 0, hp: 0, min: 0, max: 0, speed: 0, range: 0, def: 0 };
    g.n++;
    g.hp += a.maxHp;
    g.min += a.stats.get('damageMin');
    g.max += a.stats.get('damageMax');
    g.speed += a.stats.get('moveSpeed');
    g.range += a.stats.get('attackRange');
    g.def += a.stats.get('defense');
    groups.set(a.name, g);
  }
  for (const [name, g] of [...groups].sort((a, b) => b[1].n - a[1].n))
    out.push(`${name} ×${g.n}：HP ${Math.round(g.hp / g.n)}、傷害 ${Math.round(g.min / g.n)}～${Math.round(g.max / g.n)}、速度 ${(g.speed / g.n).toFixed(1)}、攻擊距離 ${(g.range / g.n).toFixed(1)}、防禦 ${Math.round(g.def / g.n)}`);
  writeFileSync(process.env.OUT!, out.join('\n'));
});
