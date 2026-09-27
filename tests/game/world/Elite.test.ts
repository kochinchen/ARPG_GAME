import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { EnemyFactory } from '../../../src/game/enemies/EnemyFactory';
import { NavGrid } from '../../../src/game/movement/NavGrid';
import { SpawnSystem } from '../../../src/game/world/SpawnSystem';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

/** 精英怪（怪物第二批） */
const data = DataRegistry.load(gameData);
const config = data.balance.elite;

function world(floor: number, seed = 1) {
  return new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
}
const enemies = (w: GameWorld) => w.actors.filter((a) => a.faction === 'enemy');
const elitesOn = (floor: number, seeds = 15) => {
  let count = 0;
  for (let seed = 1; seed <= seeds; seed++) count += enemies(world(floor, seed)).filter((e) => e.elite).length;
  return count;
};

describe('精英怪出現規則', () => {
  it('第 3 層之前不會出現；第 3 層起每群隊長有機率成為精英', () => {
    expect(elitesOn(1)).toBe(0);
    expect(elitesOn(2)).toBe(0);
    expect(elitesOn(3)).toBeGreaterThan(0);
    expect(elitesOn(6)).toBeGreaterThan(0);
  });

  it('加入精英不會改變原本怪物的位置與種類（精英用獨立亂數）', () => {
    const map = data.maps.get('map.crypt_a');
    const floorDef = data.floors.get('floor.crypt_1');
    const avoid = [vec2(3.5, 3.5)];
    const plain = new SpawnSystem(NavGrid.fromMap(map), new Rng(9)).planMonsters(floorDef, 1, avoid.map((center) => ({ center, radius: 7 })));
    const withElites = new SpawnSystem(NavGrid.fromMap(map), new Rng(9)).planMonsters(floorDef, 1, avoid.map((center) => ({ center, radius: 7 })), {
      chance: 1,
      count: [1, 2],
      pool: data.eliteAffixes.all,
      rng: new Rng(123),
    });
    expect(withElites.map(({ enemyId, position }) => ({ enemyId, position }))).toEqual(plain);
    expect(withElites.some((r) => r.eliteAffixes)).toBe(true);
  });

  it('精英詞綴不重複；「吸血的」第 6 層起才出現', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const e of enemies(world(3, seed)).filter((a) => a.elite)) {
        expect(e.name).not.toContain('吸血的');
      }
      for (const e of enemies(world(8, seed)).filter((a) => a.elite)) {
        const words = e.name.split(' ').slice(0, -1);
        expect(new Set(words).size).toBe(words.length);
      }
    }
  });
});

describe('精英怪的強化', () => {
  const factory = new EnemyFactory();
  const skeleton = data.enemies.get('enemy.skeleton');
  const normal = factory.create(skeleton, 1, vec2(0, 0));

  it('HP ×3、傷害 ×1.3、經驗 ×3、體型較大，名稱加上詞綴', () => {
    const elite = factory.create(skeleton, 2, vec2(0, 0), undefined, { config, affixes: [data.eliteAffixes.get('elite.berserk')] });
    expect(elite.elite).toBe(true);
    expect(elite.maxHp).toBeCloseTo(normal.maxHp * config.hpMultiplier);
    expect(elite.stats.get('damageMax')).toBeCloseTo(normal.stats.get('damageMax') * config.damageMultiplier);
    expect(elite.xpReward).toBe(Math.round(skeleton.xp * config.xpMultiplier));
    expect(elite.radius).toBeGreaterThan(normal.radius);
    expect(elite.radius).toBeLessThanOrEqual(0.5);
    expect(elite.name).toBe('狂暴的 骷髏戰士');
    expect(elite.stats.get('damageBonus')).toBeCloseTo(0.4);
  });

  it('詞綴疊加：強壯的（HP +100%）+ 迅捷的（移動 / 攻速）', () => {
    const elite = factory.create(skeleton, 3, vec2(0, 0), undefined, {
      config,
      affixes: [data.eliteAffixes.get('elite.mighty'), data.eliteAffixes.get('elite.swift')],
    });
    expect(elite.maxHp).toBeCloseTo(normal.maxHp * config.hpMultiplier * 2);
    expect(elite.hp).toBeCloseTo(elite.maxHp);
    expect(elite.moveSpeed).toBeCloseTo(normal.moveSpeed * 1.35);
    expect(elite.name).toBe('強壯的 迅捷的 骷髏戰士');
  });
});

describe('精英怪的掉落與存檔', () => {
  it('擊殺精英：原本的掉落之外，至少再掉 2 樣（精英掉落表沒有「什麼都沒有」）', () => {
    let found: GameWorld | null = null;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const w = world(3, seed);
      if (enemies(w).some((e) => e.elite)) found = w;
    }
    const w = found!;
    const elite = enemies(w).find((e) => e.elite)!;
    elite.lastDamagedBy = w.player.id;
    elite.hp = 0;
    run(w, 1 / 60);
    expect(w.groundItems.length).toBeGreaterThanOrEqual(2);
  });

  it('讀檔後精英怪相同（同一個世界種子）', () => {
    let w: GameWorld | null = null;
    for (let seed = 1; seed <= 30 && !w; seed++) {
      const candidate = world(4, seed);
      if (enemies(candidate).some((e) => e.elite)) w = candidate;
    }
    const save = SaveMapper.capture(w!, 'T');
    const fresh = world(1, save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    const names = (x: GameWorld) => enemies(x).map((e) => `${e.name}@${e.maxHp}`);
    expect(names(fresh)).toEqual(names(w!));
  });

  it('資料驗證：精英掉落表不存在時報錯', () => {
    const balance = { ...(gameData.balance as object), elite: { ...config, lootTable: 'loot.missing' } };
    expect(() => DataRegistry.load({ ...gameData, balance })).toThrow(/loot\.missing/);
  });
});
