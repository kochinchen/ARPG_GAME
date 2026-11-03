import { describe, expect, it } from 'vitest';
import { vec2 } from '../../../src/core/math/Vec2';
import { createSim, tickSim } from '../../../src/tools/bossSim/SimWorld';

const DT = 1 / 60;

/** 開打到魔王開始放這一招，移動主角，回傳這一招有沒有打中主角 */
function dodge(enemyId: string, skillId: string, floor: number, move: (p: { x: number; y: number }, boss: { x: number; y: number }) => { x: number; y: number }): boolean {
  // 從第一個會用這一招的階段開始
  const def = createSim({ enemyId, floor, level: 30, gear: 'none', phase: 1 }).data.enemies.get(enemyId);
  const phase = def.skills.includes(skillId) ? 1 : def.phases.findIndex((p) => p.skills?.includes(skillId)) + 2;
  const sim = createSim({ enemyId, floor, level: 30, gear: 'none', phase });
  let casting = false;
  let hit = false;
  sim.world.events.on('SkillCast', (e) => {
    if (e.actorId === sim.enemy.id && e.skillId === skillId) casting = true;
  });
  sim.world.events.on('SkillHit', (e) => {
    if (e.skillId === skillId) hit = true;
  });
  for (let i = 0; i < 60 * 60 && !casting; i++) {
    sim.world.player.hp = sim.world.player.maxHp;
    tickSim(sim, DT);
  }
  expect(casting).toBe(true);
  const p = move(sim.world.player.position, sim.enemy.position);
  sim.world.player.position = vec2(p.x, p.y);
  sim.world.player.prevPosition = sim.world.player.position;
  for (let i = 0; i < 3 * 60 && sim.enemy.cast?.skill.id === skillId; i++) tickSim(sim, DT);
  return hit;
}

describe('魔王有預警的招式：跑開就躲得掉', () => {
  const stay = (p: { x: number; y: number }) => p;
  const away = (p: { x: number; y: number }) => ({ x: p.x - 14, y: p.y });
  const sideways = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + 9 });

  it('墓穴守衛的衝鋒：站著會被打中', () => {
    expect(dodge('enemy.crypt_guardian', 'enemy.guardian_charge', 5, stay)).toBe(true);
  });

  it('墓穴守衛的衝鋒：往遠處跑、往旁邊閃都躲得掉', () => {
    expect(dodge('enemy.crypt_guardian', 'enemy.guardian_charge', 5, away)).toBe(false);
    expect(dodge('enemy.crypt_guardian', 'enemy.guardian_charge', 5, sideways)).toBe(false);
  });

  // 站到施放者背後：還在半徑內，但不在扇形預警裡
  const behind = (p: { x: number; y: number }, boss: { x: number; y: number }) => ({ x: boss.x * 2 - p.x, y: boss.y * 2 - p.y });

  it('走出扇形預警就躲得掉（就算離得很近）', () => {
    expect(dodge('enemy.fallen_knight', 'enemy.knight_combo', 20, stay)).toBe(true);
    expect(dodge('enemy.fallen_knight', 'enemy.knight_combo', 20, behind)).toBe(false);
    expect(dodge('enemy.fallen_knight', 'enemy.knight_fire_combo', 20, behind)).toBe(false);
  });

  it('其他魔王的衝鋒也一樣', () => {
    expect(dodge('enemy.fallen_knight', 'enemy.knight_dash', 20, stay)).toBe(true);
    expect(dodge('enemy.fallen_knight', 'enemy.knight_dash', 20, away)).toBe(false);
    expect(dodge('enemy.fallen_knight', 'enemy.knight_dash', 20, sideways)).toBe(false);
    expect(dodge('enemy.spider_queen', 'enemy.queen_pounce', 25, away)).toBe(false);
  });

  it('統御者的火冰彈幕只打 6 格外的目標，命中範圍 1 格', () => {
    const sim = createSim({ enemyId: 'enemy.abyss_sovereign', floor: 35, level: 60, gear: 'none', phase: 3 });
    const { world, enemy } = sim;
    const gaps: number[] = [];
    world.events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.sov_fire_volley' || e.skillId === 'enemy.sov_ice_volley') gaps.push(Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y));
    });
    // 前 30 秒貼著魔王：一發都不該出現
    for (let i = 0; i < 30 * 60; i++) {
      world.player.position = vec2(enemy.position.x - 2, enemy.position.y);
      world.player.prevPosition = world.player.position;
      tickSim(sim, DT);
    }
    expect(gaps).toEqual([]);
    // 拉開距離就會用
    for (let i = 0; i < 20 * 60; i++) {
      world.player.position = vec2(enemy.position.x - 8, enemy.position.y);
      world.player.prevPosition = world.player.position;
      tickSim(sim, DT);
    }
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(6);
    for (const id of ['enemy.sov_fire_volley', 'enemy.sov_ice_volley']) {
      const volley = sim.data.skills.get(id);
      expect(volley.fixedArea).toBe(true);
      const onHit = volley.effects.flatMap((e) => (e.type === 'projectile' ? e.onHit : []));
      for (const e of onHit) if (e.type === 'area' || e.type === 'zone') expect(e.radius).toBe(1);
    }
  });

  // 這幾招原本跑多遠都會被打中（設計者 2026-11-03）
  const NORMAL_DASHES: [string, string, number][] = [
    ['enemy.horned_brute', 'enemy.horn_charge', 20],
    ['enemy.burrower', 'enemy.burrow_strike', 25],
    ['enemy.chain_warden', 'enemy.chain_rush', 25],
    ['enemy.bone_hound', 'enemy.pounce', 15],
    ['enemy.shadow_panther', 'enemy.shadow_pounce', 20],
  ];
  it.each(NORMAL_DASHES)('一般怪 %s 的 %s：往遠處跑、往旁邊閃都躲得掉', (enemyId, skillId, floor) => {
    expect(dodge(enemyId, skillId, floor, away)).toBe(false);
    expect(dodge(enemyId, skillId, floor, sideways)).toBe(false);
  });

  it.each([...NORMAL_DASHES, ['enemy.hook_claw', 'enemy.hook_rend', 15], ['enemy.void_maw', 'enemy.maw_bite', 30]] as [string, string, number][])('一般怪 %s 的 %s：站著不動還是打得中', (enemyId, skillId, floor) => {
    expect(dodge(enemyId, skillId, floor, stay)).toBe(true);
  });

  it.each([['enemy.hook_claw', 'enemy.hook_rend', 15], ['enemy.void_maw', 'enemy.maw_bite', 30]] as [string, string, number][])('一般怪 %s 的近身招 %s：跑開就躲得掉', (enemyId, skillId, floor) => {
    expect(dodge(enemyId, skillId, floor, away)).toBe(false);
  });
});
