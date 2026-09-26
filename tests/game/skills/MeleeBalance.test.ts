import { describe, expect, it } from 'vitest';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { ComboResolver } from '../../../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../../../src/game/combo/ComboSkillIndex';
import type { GameWorld } from '../../../src/game/GameWorld';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** M7.5 近戰平衡：扇形範圍、MP / 吸血倍率、「近 → 近 → 遠」回報 */

const ROOM = [
  '##################',
  '#S...............#',
  '#................#',
  '#................#',
  '#................#',
  '##################',
];
const PLAYER = vec2(5.5, 2.5);
const dummy = (x: number, y: number) => ({ enemyId: 'enemy.training_dummy', at: [x, y] as [number, number] });

function setup(spawns: ReturnType<typeof dummy>[]) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const player = ctx.world.player;
  player.position = PLAYER;
  player.prevPosition = PLAYER;
  player.stats.setBase('critChance', 0);
  player.stats.setBase('damageMin', 20);
  player.stats.setBase('damageMax', 20);
  for (const e of enemiesOf(ctx.world)) makeInvulnerable(e);
  return ctx;
}

function castQ(world: GameWorld, commands: ReturnType<typeof setup>['commands'], skillId: string, targetIndex = 0) {
  world.player.skillRanks.set(skillId, 1);
  world.loadout.combos[0] = [skillId, null, null];
  world.loadout.select(0);
  const target = enemiesOf(world)[targetIndex]!;
  commands.push({ type: 'CastRight', worldPos: target.position, targetId: target.id });
}

/** 施放一招後，被打到的木樁索引 */
function hitIndices(skillId: string, spawns: ReturnType<typeof dummy>[], beforeHit?: (world: GameWorld) => void): number[] {
  const { world, commands, events } = setup(spawns);
  const enemies = enemiesOf(world);
  const hit = new Set<number>();
  events.on('ActorDamaged', (e) => {
    const i = enemies.findIndex((a) => a.id === e.targetId);
    if (i >= 0) hit.add(i);
  });
  events.on('SkillCast', () => beforeHit?.(world));
  castQ(world, commands, skillId);
  run(world, 1);
  return [...hit].sort();
}

describe('近戰揮砍自帶扇形範圍', () => {
  // 目標在正前方（+x），側前方約 48°，正後方
  const front = dummy(6.6, 2.5);
  const side = dummy(6.3, 3.4);
  const behind = dummy(4.4, 2.5);

  it('重砍（110°）：打到正前方與側前方，打不到後方', () => {
    expect(hitIndices('melee.heavy_slash', [front, side, behind])).toEqual([0, 1]);
  });

  it('快斬（80°）：側前方 48° 在範圍外', () => {
    expect(hitIndices('melee.quick_slash', [front, side, behind])).toEqual([0]);
  });

  it('主要目標一定命中：出招途中目標退出範圍也不會落空', () => {
    const hits = hitIndices('melee.heavy_slash', [front], (world) => {
      const target = enemiesOf(world)[0]!;
      target.position = vec2(9.5, 2.5);
    });
    expect(hits).toEqual([0]);
  });
});

describe('技能類型倍率', () => {
  const data = DataRegistry.load(gameData);

  it('MP：近戰 ×0.85，遠程與魔法 ×1', () => {
    const { world } = setup([dummy(8.5, 2.5)]);
    const cost = (id: string) => world.skills.manaCost(data.skills.get(id), 1, world.player);
    expect(cost('melee.heavy_slash')).toBeCloseTo(2 * 0.85);
    expect(cost('melee.armor_break')).toBeCloseTo(4 * 0.85);
    expect(cost('ranged.charge_shot')).toBeCloseTo(4);
    expect(cost('magic.fireball')).toBeCloseTo(2);
  });

  it('吸血：近戰 ×1.3、遠程 ×1.0、魔法 ×0.8', () => {
    const ratio = (skillId: string) => {
      const { world, commands, events } = setup([dummy(7.5, 2.5)]);
      const player = world.player;
      player.stats.setBase('lifeSteal', 0.1);
      player.hp = 10;
      let dealt = 0;
      events.on('ActorDamaged', (e) => {
        if (e.sourceId === player.id) dealt += e.amount;
      });
      castQ(world, commands, skillId);
      run(world, 2);
      return (player.hp - 10) / dealt;
    };
    expect(ratio('melee.heavy_slash')).toBeCloseTo(0.13);
    expect(ratio('ranged.quick_shot')).toBeCloseTo(0.1);
    expect(ratio('magic.fireball')).toBeCloseTo(0.08);
  });
});

describe('「近 → 近 → 遠」的 Combo：第三招額外加成', () => {
  const data = DataRegistry.load(gameData);
  const index = new ComboSkillIndex(data.skills);
  const plain = new ComboResolver(data.comboRules, index);
  const rewarded = new ComboResolver(data.comboRules, index, data.balance.combo.nearNearFarBonus);
  const rank1 = () => 1;

  it('重砍 → 重砍 → 火球：第三招傷害與範圍各 +10%，說明中註明', () => {
    const steps = ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'];
    const a = plain.resolve(steps, rank1);
    const b = rewarded.resolve(steps, rank1);
    if (a.status !== 'combo' || b.status !== 'combo') throw new Error('expected combo');
    expect(b.modifiers.steps[2].damage - a.modifiers.steps[2].damage).toBeCloseTo(0.1);
    expect(b.modifiers.steps[2].aoeRadius - a.modifiers.steps[2].aoeRadius).toBeCloseTo(0.1);
    expect(b.modifiers.steps[0]).toEqual(a.modifiers.steps[0]);
    expect(b.description.at(-1)).toContain('近身回報');
  });

  it('其他距離排列的 Combo 沒有這個加成', () => {
    const actives = data.skills.all.filter((s) => s.tree && s.kind === 'active').map((s) => s.id);
    let checked = 0;
    for (const x of actives)
      for (const y of actives)
        for (const z of actives) {
          const ranges = [x, y, z].map((id) => index.get(id)?.range).join(',');
          if (ranges === 'Near,Near,Far') continue;
          const a = plain.resolve([x, y, z], rank1);
          const b = rewarded.resolve([x, y, z], rank1);
          if (a.status !== 'combo' || b.status !== 'combo') continue;
          expect(b.modifiers).toEqual(a.modifiers);
          checked++;
        }
    expect(checked).toBeGreaterThan(10);
  });
});
