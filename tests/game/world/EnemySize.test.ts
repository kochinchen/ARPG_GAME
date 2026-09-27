import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { rollSize } from '../../../src/game/enemies/EnemyFactory';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';

/** 怪物的隨機體型（常態分佈）：近戰差異大且越大越強；遠程 / 法術差異小、數值不變 */
const data = DataRegistry.load(gameData);
const config = data.balance.enemySize;

function world(floor: number, seed = 3) {
  return new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
}
const monsters = (w: GameWorld) => w.actors.filter((a) => a.faction === 'enemy' && !a.isBoss && !a.elite);

describe('隨機體型', () => {
  it('近戰 100%～200%、HP 最多 150%；遠程 100%～130%、HP 不變', () => {
    const rng = new Rng(1);
    const melee = data.enemies.get('enemy.skeleton');
    const ranged = data.enemies.get('enemy.skeleton_mage');
    const meleeRolls = Array.from({ length: 2000 }, () => rollSize(melee, config, rng));
    const rangedRolls = Array.from({ length: 2000 }, () => rollSize(ranged, config, rng));
    for (const r of meleeRolls) {
      expect(r.scale).toBeGreaterThanOrEqual(1);
      expect(r.scale).toBeLessThanOrEqual(2);
      expect(r.stat).toBeCloseTo(1 + (r.scale - 1) * 0.5);
    }
    for (const r of rangedRolls) {
      expect(r.scale).toBeGreaterThanOrEqual(1);
      expect(r.scale).toBeLessThanOrEqual(1.3);
      expect(r.stat).toBe(1);
    }
    // 常態分佈：大多數接近平均，少數很大
    const mean = meleeRolls.reduce((s, r) => s + r.scale, 0) / meleeRolls.length;
    expect(mean).toBeGreaterThan(1.15);
    expect(mean).toBeLessThan(1.3);
    const huge = meleeRolls.filter((r) => r.scale > 1.6).length / meleeRolls.length;
    expect(huge).toBeGreaterThan(0.005);
    expect(huge).toBeLessThan(0.1);
  });

  it('Boss 與訓練木樁固定 100%', () => {
    const rng = new Rng(2);
    expect(rollSize(data.enemies.get('enemy.crypt_guardian'), config, rng)).toEqual({ scale: 1, stat: 1 });
    expect(rollSize(data.enemies.get('enemy.training_dummy'), config, rng)).toEqual({ scale: 1, stat: 1 });
  });

  it('樓層上的怪物：外觀大小與 HP 依體型；碰撞半徑不超過 0.5', () => {
    const w = world(12);
    const scaling = scaleForFloor(12, data.balance.difficulty);
    const sizes = new Set<number>();
    for (const m of monsters(w)) {
      const def = data.enemies.get(m.defId!);
      const scale = m.visualRadius / (def.radius * def.size);
      sizes.add(Math.round(scale * 100));
      expect(m.radius).toBeLessThanOrEqual(0.5);
      const stat = def.ai === 'melee' ? 1 + (scale - 1) * 0.5 : 1;
      expect(m.maxHp).toBeCloseTo(def.hp * scaling.hp * stat);
    }
    expect(sizes.size).toBeGreaterThan(5);
  });

  it('讀檔後同一隻怪物的體型不變', () => {
    const w = world(12, 8);
    const before = monsters(w).map((m) => m.visualRadius);
    const save = SaveMapper.capture(w, 'T');
    const fresh = world(1, save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(monsters(fresh).map((m) => m.visualRadius)).toEqual(before);
  });
});
