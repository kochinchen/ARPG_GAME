import { describe, expect, it } from 'vitest';
import { distance } from '../../../src/core/math/Vec2';
import { migrate } from '../../../src/save/migrations';
import type { GameEvents } from '../../../src/game/GameEvents';
import type { GameWorld } from '../../../src/game/GameWorld';
import { describeSkill } from '../../../src/game/skills/SkillDescriber';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

/** 盾擊（取代雙重斬）：傷害以盾牌本身的防禦計算，沒有盾牌不能用；衝擊波、暈眩、擊退 */
const ROOM = ['############', '#S.........#', '#..........#', '#..........#', '############'];
const SKILL = 'melee.shield_bash';

function setup(enemyId = 'enemy.training_dummy') {
  const ctx = createWorldWithMap(ROOM, [{ enemyId, at: [3, 1.5] }]);
  const { world } = ctx;
  world.progress.level = 10;
  world.player.stats.setBase('critChance', 0);
  world.player.stats.setBase('maxMana', 999);
  world.player.mana = 999;
  const target = enemiesOf(world)[0]!;
  target.stats.setBase('maxHp', 1e9);
  target.stats.setBase('defense', 0);
  target.hp = 1e9;
  world.player.skillRanks.set(SKILL, 1);
  world.loadout.combos[0] = [SKILL, null, null];
  world.loadout.select(0);
  const failures: GameEvents['SkillFailed'][] = [];
  ctx.events.on('SkillFailed', (e) => failures.push(e));
  const damage: number[] = [];
  ctx.events.on('ActorDamaged', (e) => {
    if (e.targetId === target.id) damage.push(e.amount);
  });
  const cast = () => {
    ctx.commands.push({ type: 'CastRight', worldPos: target.position, targetId: target.id });
    run(world, 1);
  };
  return { ...ctx, target, failures, damage, cast };
}

const gear = (world: GameWorld, baseId: string, quality = 0) =>
  world.equipment.equip({ uid: baseId, baseId, rarity: quality > 0 ? 'epic' : 'normal', itemLevel: 40, quality, affixes: [] });

describe('盾擊', () => {
  it('沒有裝備盾牌時不能用：整組連段不施放，提示「需要裝備盾牌」', () => {
    const { world, failures, damage, cast } = setup();
    gear(world, 'weapon.short_sword');
    cast();
    expect(world.player.castCount).toBe(0);
    expect(damage).toHaveLength(0);
    expect(failures.at(-1)).toMatchObject({ reason: 'weapon', skillId: SKILL, text: '需要裝備盾牌' });
    expect(world.weaponDenial(SKILL)).toBe('需要裝備盾牌');
  });

  it('傷害 = 盾牌本身的防禦（含主倍率）× 110%（Lv1）±10% × 近戰加成，不吃其他部位的防禦', () => {
    const { world, damage, cast } = setup();
    gear(world, 'weapon.short_sword');
    gear(world, 'shield.abyss', 3); // 深淵魔顎盾：防禦 62 × (1 + 3) = 248
    gear(world, 'armor.abyss'); // 盔甲防禦 98 只加角色防禦，不影響盾擊
    expect(world.player.stats.get('shieldDefense')).toBe(248);
    // 盾擊是近戰技能：吃近戰傷害加成（劍的內建 +8%）
    const melee = 1 + world.player.stats.get('meleeDamageBonus');
    cast();
    expect(world.player.castCount).toBe(1);
    expect(damage).toHaveLength(1);
    expect(damage[0]!).toBeGreaterThanOrEqual(Math.floor(248 * 1.1 * 0.9 * melee));
    expect(damage[0]!).toBeLessThanOrEqual(Math.ceil(248 * 1.1 * 1.1 * melee));
  });

  it('命中後暈眩並擊退 1 格；換掉盾牌後又不能用', () => {
    const { world, target, cast } = setup('enemy.skeleton');
    target.stats.setBase('moveSpeed', 0.01);
    gear(world, 'weapon.short_sword');
    gear(world, 'shield.wood');
    const before = distance(world.player.position, target.position);
    cast();
    expect(target.hasStatus('stun')).toBe(true);
    expect(distance(world.player.position, target.position)).toBeGreaterThan(before + 0.5);
    world.equipment.unequip('shield');
    expect(world.weaponDenial(SKILL)).toBe('需要裝備盾牌');
  });

  it('技能說明：近身、傷害以盾牌防禦計算、暈眩與擊退', () => {
    const { data } = setup();
    const lines = describeSkill(data.skills.get(SKILL), 1, 4);
    expect(lines[0]).toMatch(/^近身 · /);
    expect(lines).toContain('物理傷害 110% 盾牌防禦');
    expect(lines.some((l) => l.startsWith('暈眩 0.6 秒'))).toBe(true);
  });
});

describe('存檔 v13 → v14：雙重斬換成盾擊', () => {
  it('技能等級、左鍵與連段格轉給盾擊；組合表裡含雙重斬的組合移除', () => {
    const v14 = migrate(
      {
        skills: { ranks: { 'melee.heavy_slash': 2, 'melee.double_slash': 3 }, unspentPoints: 0, t4Charges: 0, t4Unlocked: [] },
        loadout: { left: 'melee.double_slash', combos: [['melee.quick_slash', 'melee.double_slash', null]], activeCombo: 0, supports: [null, null, null] },
        codex: [
          { comboId: 'a', ruleId: 'r', skills: ['melee.double_slash', 'melee.double_slash', 'melee.heavy_slash'], order: 0, timesUsed: 1 },
          { comboId: 'b', ruleId: 'r', skills: ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'], order: 1, timesUsed: 1 },
        ],
      },
      13,
    ) as { skills: { ranks: Record<string, number> }; loadout: { left: string; combos: unknown[][] }; codex: { comboId: string }[] };
    expect(v14.skills.ranks).toEqual({ 'melee.heavy_slash': 2, 'melee.shield_bash': 3 });
    expect(v14.loadout.left).toBe('melee.shield_bash');
    expect(v14.loadout.combos[0]).toEqual(['melee.quick_slash', 'melee.shield_bash', null]);
    expect(v14.codex.map((e) => e.comboId)).toEqual(['b']);
  });
});
