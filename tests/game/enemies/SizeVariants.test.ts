import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { rollSize, rollVariant } from '../../../src/game/enemies/EnemyFactory';

/** 特化型（設計者 2026-11-08）：近戰一般怪特別大隻的變成特化型（約 20%，重甲約 30%），弓手與精英隨機；法師不走這套（依樓層） */
const data = DataRegistry.load(gameData);
const config = data.balance.enemySize;
const armored = data.enemies.get('enemy.armored_skeleton');
const roll = (floor: number, scale: number, elite: boolean, seed: number) => rollVariant(armored, floor, scale, elite, config, new Rng(seed));
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const seen = (floor: number, scale: number, elite: boolean) => new Set(SEEDS.map((s) => roll(floor, scale, elite, s)));

describe('體型決定特化型', () => {
  it('近戰約 20% 的個體是特化型、重甲約 30%', () => {
    const share = (id: string) => {
      const def = data.enemies.get(id);
      const rng = new Rng(7);
      const line = config.melee.mean * (def.variantScale ?? config.variantScale);
      const N = 20000;
      let over = 0;
      for (let i = 0; i < N; i++) if (rollSize(def, config, rng).scale > line) over++;
      return over / N;
    };
    expect(share('enemy.skeleton')).toBeCloseTo(0.2, 1);
    expect(share('enemy.armored_skeleton')).toBeCloseTo(0.3, 1);
  });

  it('體型沒超過門檻：一定是原版（重甲的門檻約 131%）', () => {
    expect([...seen(30, 1.3, false)]).toEqual([armored.id]);
  });

  it('超過門檻：只會是已解鎖的特化型，不會是原版', () => {
    expect([...seen(10, 1.5, false)]).toEqual(['enemy.rusted_knight']);
    expect(seen(17, 1.5, false).has('enemy.frost_armor')).toBe(false);
    expect([...seen(18, 1.5, false)].sort()).toEqual(['enemy.frost_armor', 'enemy.molten_armor', 'enemy.rusted_knight', 'enemy.storm_armor']);
    expect(seen(20, 1.5, false).has('enemy.axe_thrower')).toBe(true);
  });

  it('還沒有解鎖的特化型：維持原版', () => {
    expect([...seen(4, 1.5, false)]).toEqual([armored.id]);
  });

  it('精英不看體型：原版與已解鎖的特化型都可能', () => {
    expect([...seen(10, 1, true)].sort()).toEqual([armored.id, 'enemy.rusted_knight'].sort());
  });

  it('弓手的特化比例依樓層：10 樓前 15%、10～20 樓 25%、20 樓以後 35%；都看不到體型', () => {
    const archer = data.enemies.get('enemy.skeleton_archer');
    const many = Array.from({ length: 20000 }, (_, i) => i + 1);
    const rate = (floor: number, scale = 1) => many.filter((s) => rollVariant(archer, floor, scale, false, config, new Rng(s)) !== archer.id).length / many.length;
    expect(rate(3)).toBe(0);
    expect(rate(9)).toBeCloseTo(0.15, 1);
    expect(rate(10)).toBeCloseTo(0.25, 1);
    expect(rate(20)).toBeCloseTo(0.25, 1);
    expect(rate(21)).toBeCloseTo(0.35, 1);
    expect(rate(21, 1.3)).toBeCloseTo(0.35, 1);
    const kinds = new Set(many.map((s) => rollVariant(archer, 9, 1, false, config, new Rng(s))));
    expect([...kinds].sort()).toEqual([archer.id, 'enemy.ember_archer', 'enemy.frost_archer', 'enemy.venom_archer'].sort());
  });

  it('法師與沒有特化型的怪不受影響', () => {
    for (const id of ['enemy.skeleton_mage', 'enemy.storm_mage_gold', 'enemy.bone_hound']) {
      const def = data.enemies.get(id);
      expect(rollVariant(def, 30, 2, true, config, new Rng(1))).toBe(id);
    }
  });

  it('特化型不在樓層的怪物池裡，由原版決定', () => {
    const variants = new Set(data.enemies.all.flatMap((e) => e.variants.map((v) => v.enemyId)));
    expect(variants.size).toBe(12);
    for (const f of data.floors.all) for (const m of f.monsterPool) expect(variants.has(m.enemyId)).toBe(false);
  });
});
