import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { WeaponType } from '../../../src/data/schema/item';
import type { ActiveCategory } from '../../../src/data/schema/skill';
import type { GameEvents } from '../../../src/game/GameEvents';
import type { GameWorld } from '../../../src/game/GameWorld';
import { weaponDenial } from '../../../src/game/skills/skillCategory';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

/** v0.4.0 武器允許矩陣：劍斧＝近戰＋魔法、弓＝遠程＋魔法、法杖＝魔法；戰術任何武器都能用 */
const data = DataRegistry.load(gameData);

const ROOM = ['############', '#S.........#', '#..........#', '#..........#', '############'];
const T1: Record<Exclude<ActiveCategory, 'utility'>, string> = {
  melee: 'melee.heavy_slash',
  ranged: 'ranged.quick_shot',
  magic: 'magic.fireball',
};
const weaponOf = (type: WeaponType) => data.items.all.find((b) => b.weaponType === type && b.tier === 1)!.id;

function setup() {
  const ctx = createWorldWithMap(ROOM, [{ enemyId: 'enemy.training_dummy', at: [3.5, 1.5] }]);
  const p = ctx.world.player;
  p.stats.setBase('maxMana', 500);
  p.mana = 500;
  for (const d of enemiesOf(ctx.world)) {
    d.stats.setBase('maxHp', 99999);
    d.hp = 99999;
  }
  for (const id of Object.values(T1)) p.skillRanks.set(id, 1);
  const failures: GameEvents['SkillFailed'][] = [];
  ctx.events.on('SkillFailed', (e) => failures.push(e));
  return { ...ctx, failures };
}

const equip = (world: GameWorld, type: WeaponType) =>
  world.equipment.equip({ uid: type, baseId: weaponOf(type), rarity: 'normal', itemLevel: 1, affixes: [] });

describe('武器允許矩陣', () => {
  const ALLOWED: Record<WeaponType, Record<Exclude<ActiveCategory, 'utility'>, boolean>> = {
    sword: { melee: true, ranged: false, magic: true },
    axe: { melee: true, ranged: false, magic: true },
    bow: { melee: false, ranged: true, magic: true },
    staff: { melee: false, ranged: false, magic: true },
  };

  it('4 種武器 × 近戰 / 遠程 / 魔法；被禁用時回傳原因', () => {
    for (const [weapon, row] of Object.entries(ALLOWED) as [WeaponType, Record<string, boolean>][]) {
      for (const [category, allowed] of Object.entries(row)) {
        const skill = data.skills.get(T1[category as keyof typeof T1]);
        const denial = weaponDenial(skill, weapon, data.balance.weaponRules);
        expect(denial === null, `${weapon} × ${category}`).toBe(allowed);
      }
    }
    expect(weaponDenial(data.skills.get(T1.melee), 'staff', data.balance.weaponRules)).toBe('法杖無法使用近戰技能');
    expect(weaponDenial(data.skills.get(T1.ranged), 'sword', data.balance.weaponRules)).toBe('劍無法使用遠程技能');
  });

  it('戰術任何武器都能用；沒拿武器、Support 被動都不限制', () => {
    for (const weapon of Object.keys(ALLOWED) as WeaponType[]) expect(data.balance.weaponRules[weapon]).toContain('utility');
    for (const id of Object.values(T1)) expect(weaponDenial(data.skills.get(id), undefined, data.balance.weaponRules)).toBeNull();
    const support = data.skills.all.find((s) => s.tree?.category === 'support')!;
    expect(weaponDenial(support, 'staff', data.balance.weaponRules)).toBeNull();
  });

  it('武器內建不再扣近戰 / 遠程，只保留魔法：劍斧弓 −20%、法杖 +15%', () => {
    for (const type of ['sword', 'axe', 'bow', 'staff'] as const) {
      const stats = data.items.get(weaponOf(type)).baseStats;
      expect(stats.spellDamageBonus).toBe(type === 'staff' ? 0.15 : -0.2);
      expect((stats.meleeDamageBonus ?? 0) >= 0 && (stats.rangedDamageBonus ?? 0) >= 0, type).toBe(true);
    }
  });
});

describe('左鍵與連段被禁用', () => {
  it('左鍵：法杖拿著重砍不會出手，提示原因；換回劍就恢復（配置保留）', () => {
    const { world, commands, failures } = setup();
    const dummy = enemiesOf(world)[0]!;
    equip(world, 'staff');
    commands.push({ type: 'PrimaryAction', worldPos: dummy.position, targetId: dummy.id, held: false });
    run(world, 1);
    expect(world.player.castCount).toBe(0);
    expect(world.loadout.left).toBe(T1.melee);
    expect(failures.at(-1)).toMatchObject({ reason: 'weapon', skillId: T1.melee, text: '法杖無法使用近戰技能' });
    expect(world.weaponDenial(T1.melee)).toBe('法杖無法使用近戰技能');

    equip(world, 'sword');
    expect(world.weaponDenial(T1.melee)).toBeNull();
    commands.push({ type: 'PrimaryAction', worldPos: dummy.position, targetId: dummy.id, held: false });
    run(world, 1);
    expect(world.player.castCount).toBeGreaterThan(0);
  });

  it('連段：只要有一招被禁用，整組都不施放（連可以用的火球也不放）；換武器後恢復', () => {
    const { world, commands, failures } = setup();
    const dummy = enemiesOf(world)[0]!;
    world.progress.level = 10;
    world.loadout.combos[0] = [T1.magic, T1.melee, T1.magic];
    world.loadout.select(0);
    equip(world, 'bow');
    commands.push({ type: 'CastRight', worldPos: dummy.position, targetId: dummy.id });
    run(world, 2);
    expect(world.player.castCount).toBe(0);
    expect(world.loadout.combos[0]).toEqual([T1.magic, T1.melee, T1.magic]);
    expect(failures.at(-1)).toMatchObject({ reason: 'weapon', skillId: T1.melee, text: '弓無法使用近戰技能' });

    equip(world, 'axe');
    commands.push({ type: 'CastRight', worldPos: dummy.position, targetId: dummy.id });
    run(world, 3);
    expect(world.player.castCount).toBe(3);
  });
});
