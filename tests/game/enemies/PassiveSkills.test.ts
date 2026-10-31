import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { makeInvulnerable, run } from '../helpers';

/** 怪物的被動技能（EnemyDef.passives）：熔岩巨獸走過留下岩漿、身上的噴孔不定時噴發；只在戰鬥中發動 */
const data = DataRegistry.load(gameData);

function setup() {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor: 15, commands, events, seed: 1 });
  const boss = world.actors.find((a) => a.defId === 'enemy.lava_behemoth')!;
  // 只測被動技能：魔王不出招、不走動，由測試移動
  boss.ai!.skillId = 'basic.attack';
  boss.ai!.specialSkills = [];
  boss.stats.setBase('moveSpeed', 0);
  makeInvulnerable(world.player);
  const areas: string[] = [];
  events.on('AreaTriggered', (e) => areas.push(e.skillId));
  return { world, boss, areas };
}
const trailZones = (w: GameWorld) => w.scheduler.zones.filter((z) => z.ctx.skill.id === 'enemy.lava_trail').length;

describe('被動技能', () => {
  it('沒有目標（閒置）時不發動', () => {
    const { world, boss, areas } = setup();
    boss.ai!.targetId = null;
    boss.ai!.detectRange = 0;
    run(world, 12, () => (boss.position = vec2(boss.position.x + 0.02, boss.position.y)));
    expect(trailZones(world)).toBe(0);
    expect(areas.filter((id) => id === 'enemy.lava_vent')).toHaveLength(0);
  });

  it('戰鬥中走過留下岩漿（每 1.2 格一灘），噴孔約每 6 秒噴 3 處熔岩', () => {
    const { world, boss, areas } = setup();
    // 每幀往前 0.02 格：3.2 秒走 3.84 格 → 3 灘岩漿
    run(world, 3.2, () => {
      boss.ai!.targetId = world.player.id;
      boss.position = vec2(boss.position.x + 0.02, boss.position.y);
    });
    expect(trailZones(world)).toBe(3);
    run(world, 11.8, () => (boss.ai!.targetId = world.player.id));
    // 15 秒內噴發 2～3 次（每次間隔 4.2～7.8 秒），每次 3 處
    const vents = areas.filter((id) => id === 'enemy.lava_vent').length;
    expect(vents).toBeGreaterThanOrEqual(6);
    expect(vents).toBeLessThanOrEqual(9);
  });
});
