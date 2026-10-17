import { describe, expect, it } from 'vitest';
import { createWorld, run } from '../helpers';

/** 洗點：花金幣重置技能點 / 屬性點，費用隨等級提高 */
describe('洗點', () => {
  const setup = () => {
    const ctx = createWorld();
    const { world } = ctx;
    world.progress.level = 20;
    world.progress.skillPoints = 10;
    world.progress.attributePoints = 30;
    world.wallet.gold = 1e6;
    const send = (c: Parameters<typeof ctx.commands.push>[0]) => {
      ctx.commands.push(c);
      run(world, 1 / 60);
    };
    return { ...ctx, send };
  };

  it('費用隨等級提高', () => {
    const { world } = setup();
    const at20 = world.respecCost('skills');
    world.progress.level = 40;
    expect(world.respecCost('skills')).toBeGreaterThan(at20 * 2);
    expect(world.respecCost('attributes')).toBeLessThan(world.respecCost('skills'));
  });

  it('重置屬性點：點數全部退回、加成移除、扣金幣', () => {
    const { world, send } = setup();
    const hp = world.player.maxHp;
    send({ type: 'AllocateAttribute', attribute: 'vitality', count: 10 });
    expect(world.player.maxHp).toBeGreaterThan(hp);
    const cost = world.respecCost('attributes');
    send({ type: 'Respec', kind: 'attributes' });
    expect(world.progress.attributePoints).toBe(30);
    expect(world.player.maxHp).toBe(hp);
    expect(world.wallet.gold).toBe(1e6 - cost);
  });

  it('重置技能點：起始技能回到 1 級、其他忘記、點數退回；連段裡沒學的技能清空', () => {
    const { world, send } = setup();
    send({ type: 'LearnSkill', skillId: 'melee.heavy_slash' });
    send({ type: 'LearnSkill', skillId: 'melee.quick_slash' });
    send({ type: 'SetComboSlot', combo: 0, step: 1, skillId: 'melee.quick_slash' });
    expect(world.progress.skillPoints).toBe(8);
    send({ type: 'Respec', kind: 'skills' });
    expect(world.progress.skillPoints).toBe(10);
    expect(world.player.skillRanks.get('melee.heavy_slash')).toBe(1);
    expect(world.player.skillRanks.has('melee.quick_slash')).toBe(false);
    expect(world.loadout.combos[0]![1]).toBeNull();
  });

  it('金幣不足或沒有點數可以重置：不變', () => {
    const { world, send, events } = setup();
    const failed: string[] = [];
    events.on('RespecFailed', (e) => failed.push(e.reason));
    send({ type: 'Respec', kind: 'attributes' });
    send({ type: 'AllocateAttribute', attribute: 'vitality', count: 5 });
    world.wallet.gold = 0;
    send({ type: 'Respec', kind: 'attributes' });
    expect(failed).toEqual(['nothing', 'gold']);
    expect(world.progress.attributePoints).toBe(25);
  });
});
