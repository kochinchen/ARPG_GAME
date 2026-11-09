import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { flattenEffects } from '../../src/data/skillAnalysis';
import { createSim, tickSim } from '../../src/tools/bossSim/SimWorld';
import { vec2 } from '../../src/core/math/Vec2';

const data = DataRegistry.load(gameData);

describe('暗黑領域的外觀', () => {
  it('魔王的暗黑領域用 darkDomain', () => {
    const zones = flattenEffects(data.skills.get('enemy.lord_domain').effects).filter((e) => e.type === 'zone');
    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) expect(zone.type === 'zone' && zone.look).toBe('darkDomain');
  });

  it('裝備說明寫「展開暗黑領域」而且在地上放區域的，都用同一個外觀', () => {
    const lines = data.legendaries.all.flatMap((item) => item.lines).filter((line) => JSON.stringify(line).includes('暗黑領域') && JSON.stringify(line).includes('"type":"zone"'));
    expect(lines.length).toBe(3);
    for (const line of lines) expect(JSON.stringify(line)).toContain('"look":"darkDomain"');
  });

  it('魔王放出來的區域帶著外觀（Render 依這個畫）', () => {
    const sim = createSim({ enemyId: 'enemy.abyss_lord', floor: 30, level: 43, gear: 'shield', phase: 2 });
    for (let i = 0; i < 20 * 60 && !sim.world.scheduler.zones.some((z) => z.look === 'darkDomain'); i++) tickSim(sim, 1 / 60);
    expect(sim.world.scheduler.zones.some((z) => z.look === 'darkDomain')).toBe(true);
  });

  const wearing = (id: string) => createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 40, gear: 'none', phase: 1, wear: [id] });

  it('頭盔：3 格內有敵人才出現，離開就消失', () => {
    const { world, enemy } = wearing('mythic.helmet_abyss_lord');
    enemy.position = vec2(world.player.position.x + 8, world.player.position.y);
    world.itemEffects.update(0);
    expect(world.itemEffects.activeAuraRadius).toBeNull();
    enemy.position = vec2(world.player.position.x + 1, world.player.position.y);
    world.itemEffects.update(0);
    expect(world.itemEffects.activeAuraRadius).toBe(3);
  });

  it('手套：「深淵」滿 5 層才出現', () => {
    const { world } = wearing('mythic.gloves_abyss_lord');
    const complete = () =>
      world.events.emit('ComboCompleted', { comboId: 'x', ruleId: 'x', name: 'x', skills: ['a', 'b', 'c'], description: [], slot: 0, ruleTier: 0 });
    // 裝備效果在第一次 update 才生效
    world.itemEffects.update(0);
    for (let i = 0; i < 4; i++) complete();
    world.itemEffects.update(0);
    expect(world.itemEffects.activeAuraRadius).toBeNull();
    complete();
    world.itemEffects.update(0);
    expect(world.itemEffects.activeAuraRadius).toBe(3);
  });

  it('沒穿這兩件時沒有外觀', () => {
    const { world, enemy } = createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 40, gear: 'shield', phase: 1 });
    enemy.position = vec2(world.player.position.x + 1, world.player.position.y);
    world.itemEffects.update(0);
    expect(world.itemEffects.activeAuraRadius).toBeNull();
  });

  it('其他區域不受影響', () => {
    const zones = data.skills.all.filter((s) => s.id !== 'enemy.lord_domain').flatMap((s) => flattenEffects(s.effects)).filter((e) => e.type === 'zone');
    for (const zone of zones) expect(zone.type === 'zone' && zone.look).not.toBe('darkDomain');
  });
});
