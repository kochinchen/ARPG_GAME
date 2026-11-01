import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { EquipmentSlot } from '../../../src/game/items/ItemInstance';
import { BUILDS, PRESET, setupCharacter, type Preset } from '../sim/character';
import { data, makeWorld, xpTable } from '../sim/run';

/** 除錯用：預設角色（B=流派）的等級、裝備、孔與熔核、主要屬性，寫到 OUT */
it('preset', () => {
  const build = BUILDS.find((b) => b.id === (process.env.B ?? 'melee'))!;
  const floor = Number(process.env.F ?? 20);
  const { world } = makeWorld(floor, Number(process.env.SEED ?? 4242));
  setupCharacter(world, data, floor, build, xpTable(), { ...PRESET, ...(process.env.LV ? { level: Number(process.env.LV), itemLevel: Number(process.env.LV) } : {}), ...(process.env.R ? { rarity: process.env.R as Preset['rarity'] } : {}) });
  const s = world.player.stats;
  const lines = [`Lv ${world.progress.level}  HP ${Math.round(s.get('maxHp'))}（actor ${Math.round(world.player.maxHp)}）  防禦 ${Math.round(s.get('defense'))}  魔力 ${Math.round(s.get('maxMana'))}`];
  const slots: EquipmentSlot[] = ['weapon', 'shield', 'helmet', 'armor', 'gloves', 'boots', 'ring1', 'ring2', 'amulet'];
  for (const slot of slots) {
    const item = world.equipment.get(slot);
    if (!item) continue;
    const cores = item.sockets?.cores.map((c) => `${c.types.join('+')} T${c.tier} ${c.rarity}${c.pure ? ' 純' : ''}`).join('、') ?? '';
    lines.push(`${slot}: ${item.baseId} ${item.rarity} iLv${item.itemLevel} 孔 ${item.sockets?.max ?? 0} [${cores}]`);
  }
  writeFileSync(process.env.OUT!, lines.join('\n'));
});
