import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { Rng } from '../../../src/core/Rng';
import { DamagePipeline } from '../../../src/game/combat/DamagePipeline';
import { StatusEffectSystem } from '../../../src/game/combat/StatusEffectSystem';
import { EventBus } from '../../../src/core/EventBus';
import type { GameEvents } from '../../../src/game/GameEvents';
import { createWorldWithMap, makeInvulnerable, run } from '../helpers';

/** 震地獸背上堡壘的三隻骷髏弓手（EnemyDef.riders，設計者 2026-11-19） */
const ROOM = [
  '##############################',
  '#S...........................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];

function setup() {
  const made = createWorldWithMap(ROOM, [{ enemyId: 'enemy.quake_beast', at: [20, 5] }]);
  const { world, data } = made;
  makeInvulnerable(world.player);
  const host = world.actors.find((a) => a.defId === 'enemy.quake_beast')!;
  const riders = world.actors.filter((a) => a.riding?.hostId === host.id);
  return { ...made, host, riders, config: data.enemies.get('enemy.quake_beast').riders! };
}

/** 同伴在平台的範圍裡 */
const onDeck = (r: { riding: { slot: { x: number; y: number }; deck: { center: { x: number; y: number }; half: { x: number; y: number } } } | null }) => {
  const d = r.riding!.deck;
  return Math.abs(r.riding!.slot.x - d.center.x) <= d.half.x + 1e-6 && Math.abs(r.riding!.slot.y - d.center.y) <= d.half.y + 1e-6;
};

/** 精英背上的骷髏法師：每隻隨機一種屬性 */
const MAGES = ['enemy.skeleton_mage_fire', 'enemy.skeleton_mage_frost', 'enemy.skeleton_mage'];

describe('背上的同伴（震地獸的骷髏弓手）', () => {
  it('和宿主一起生成三隻弓手，站在宿主背上的平台裡', () => {
    const { host, riders } = setup();
    expect(riders).toHaveLength(3);
    for (const r of riders) {
      expect(r.defId).toBe('enemy.skeleton_archer');
      expect(onDeck(r)).toBe(true);
      expect(distance(r.position, host.position)).toBeLessThan(2);
    }
  });

  it('在平台上走來走去，不會走出平台', () => {
    const { world, riders } = setup();
    const start = riders.map((r) => r.riding!.slot);
    let moved = false;
    run(world, 8, () => {
      for (const r of riders) expect(onDeck(r)).toBe(true);
    });
    riders.forEach((r, i) => {
      if (r.riding && distance(r.riding.slot, start[i]!) > 0.2) moved = true;
    });
    expect(moved).toBe(true);
  });

  it('精英震地獸更大，背上是三隻弓手和兩隻骷髏法師', () => {
    const { world, data } = setup();
    const normal = world.actors.find((a) => a.defId === 'enemy.quake_beast')!;
    const elite = world.spawnScaledEnemy('enemy.quake_beast', 20, vec2(8, 5), null, true);
    const crew = world.actors.filter((a) => a.riding?.hostId === elite.id).map((a) => a.defId);
    expect(crew.filter((id) => id === 'enemy.skeleton_archer')).toHaveLength(3);
    expect(crew.filter((id) => MAGES.includes(id!))).toHaveLength(2);
    expect(elite.visualRadius / normal.visualRadius).toBeCloseTo(data.balance.elite.radiusMultiplier * data.enemies.get('enemy.quake_beast').eliteSize, 2);
  });

  it('宿主移動、轉向時跟著走，自己不會走開', () => {
    const { world, host, riders } = setup();
    host.position = vec2(15, 6);
    host.facing = vec2(0, 1);
    run(world, 1);
    // 在宿主身上的位置照宿主最後的面向（宿主的 AI 可能已經轉向）
    for (const r of riders) {
      const ahead = (r.position.x - host.position.x) * host.facing.x + (r.position.y - host.position.y) * host.facing.y;
      expect(ahead).toBeCloseTo(r.riding!.slot.x, 2);
      expect(r.path).toHaveLength(0);
    }
  });

  it('精英背上的骷髏法師屬性是隨機的', () => {
    const { world } = setup();
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const elite = world.spawnScaledEnemy('enemy.quake_beast', 20, vec2(6 + i * 2, 3), null, true);
      for (const a of world.actors) if (a.riding?.hostId === elite.id && MAGES.includes(a.defId!)) seen.add(a.defId!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('站在背上也會朝主角射箭', () => {
    const { world, riders } = setup();
    world.player.position = vec2(12, 5);
    const casts = () => riders.reduce((n, r) => n + r.castCount, 0);
    run(world, 6);
    expect(casts()).toBeGreaterThan(0);
  });

  it('射程比地上的弓手多 rangeBonus 格', () => {
    const { world, riders, config } = setup();
    const ground = world.spawnScaledEnemy('enemy.skeleton_archer', 20, vec2(5, 7));
    expect(riders[0]!.stats.get('projectileRange') - ground.stats.get('projectileRange')).toBeCloseTo(config.rangeBonus);
  });

  it('城垛擋住一半的非近戰傷害，近戰照常', () => {
    const { riders, config } = setup();
    const rider = riders[0]!;
    const pipeline = new DamagePipeline(setup().data.balance, new Rng(1), new EventBus<GameEvents>(), new StatusEffectSystem(new EventBus<GameEvents>(), 0.5));
    rider.stats.setBase('dodgeChance', 0);
    rider.stats.setBase('blockChance', 0);
    rider.stats.setBase('maxHp', 1e6);
    rider.hp = 1e6;
    const before = rider.hp;
    pipeline.apply({ source: null, target: rider, min: 100, max: 100, element: 'fire', canCrit: false });
    const ranged = before - rider.hp;
    pipeline.apply({ source: null, target: rider, min: 100, max: 100, element: 'fire', canCrit: false, melee: true });
    const melee = before - ranged - rider.hp;
    expect(ranged / melee).toBeCloseTo(config.cover, 1);
  });

  it('宿主倒下時跌到身旁、暈眩，之後是一般的弓手', () => {
    const { world, host, riders } = setup();
    host.hp = 0;
    run(world, 0.1);
    for (const r of riders) {
      expect(r.riding).toBeNull();
      expect(r.cover).toBe(1);
      expect(r.hasStatus('stun')).toBe(true);
      expect(r.fall).not.toBeNull();
      expect(distance(r.position, host.position)).toBeGreaterThan(host.radius);
    }
    run(world, 2);
    for (const r of riders) {
      expect(r.hasStatus('stun')).toBe(false);
      expect(r.alive).toBe(true);
    }
  });
});
