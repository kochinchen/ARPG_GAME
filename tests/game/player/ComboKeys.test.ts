import { describe, expect, it } from 'vitest';
import { migrate } from '../../../src/save/migrations';
import { createWorld, run } from '../helpers';

/** Q / W / E / R / A / S / D 七組連段：依等級解鎖（1 / 3 / 6 / 10 / 15 / 20 / 25） */
describe('七組連段按鍵', () => {
  const setup = (level: number) => {
    const ctx = createWorld();
    ctx.world.progress.level = level;
    const send = (c: Parameters<typeof ctx.commands.push>[0]) => {
      ctx.commands.push(c);
      run(ctx.world, 1 / 60);
    };
    return { ...ctx, send };
  };

  it('解鎖等級：Lv1 只有 Q；Lv10 到 R；Lv25 全部', () => {
    expect(setup(1).world.comboKeysUnlocked).toBe(1);
    expect(setup(6).world.comboKeysUnlocked).toBe(3);
    expect(setup(10).world.comboKeysUnlocked).toBe(4);
    expect(setup(25).world.comboKeysUnlocked).toBe(7);
  });

  it('未解鎖的按鍵不能選、不能放技能；解鎖後可以', () => {
    const { world, send } = setup(9);
    send({ type: 'SelectRightSlot', slot: 3 });
    expect(world.loadout.activeCombo).toBe(0);
    send({ type: 'SetComboSlot', combo: 3, step: 0, skillId: 'magic.fireball' });
    expect(world.loadout.combos[3]![0]).toBeNull();
    world.progress.level = 25;
    send({ type: 'SetComboSlot', combo: 6, step: 0, skillId: 'magic.fireball' });
    send({ type: 'SelectRightSlot', slot: 6 });
    expect(world.loadout.combos[6]![0]).toBe('magic.fireball');
    expect(world.loadout.activeCombo).toBe(6);
  });

  it('新角色：左鍵重砍、Q 火球（兩個起始技能一開始都能用）', () => {
    const { world } = setup(1);
    expect(world.loadout.left).toBe('melee.heavy_slash');
    expect(world.loadout.combos).toHaveLength(7);
    expect(world.loadout.combos[0]![0]).toBe('magic.fireball');
  });

  it('存檔 v12 → v13：原本三組保留，新增四組空的連段', () => {
    const q = ['melee.heavy_slash', null, null];
    const v13 = migrate({ loadout: { left: 'melee.heavy_slash', combos: [q, [null, null, null], [null, null, null]], activeCombo: 2, supports: [null, null, null] } }, 12) as {
      loadout: { combos: unknown[]; activeCombo: number };
    };
    expect(v13.loadout.combos).toHaveLength(7);
    expect(v13.loadout.combos[0]).toEqual(q);
    expect(v13.loadout.combos[6]).toEqual([null, null, null]);
    expect(v13.loadout.activeCombo).toBe(2);
  });
});
