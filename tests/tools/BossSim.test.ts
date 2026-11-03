import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { scaleForFloor } from '../../src/game/world/DifficultyScaler';
import { SimRecorder } from '../../src/tools/bossSim/SimRecorder';
import { createSim, tickSim, type SimConfig } from '../../src/tools/bossSim/SimWorld';
import { buildPhaseTable, buildSkillTable } from '../../src/tools/bossSim/SkillTable';

const DT = 1 / 60;
const data = DataRegistry.load(gameData);
const bosses = data.enemies.all.filter((e) => e.boss);

function run(config: SimConfig, seconds: number) {
  const sim = createSim(config);
  const recorder = new SimRecorder(sim.world, sim.data, sim.enemy);
  for (let i = 0; i < seconds * 60; i++) {
    tickSim(sim, DT);
    recorder.flush();
  }
  return { sim, recorder };
}

describe('魔王模擬器', () => {
  it.each(bosses.map((b) => b.id))('%s 會主動攻擊，主角不會倒下，傷害都記錄到', (enemyId) => {
    const { sim, recorder } = run({ enemyId, floor: 20, level: 30, gear: 'shield', phase: 1 }, 30);
    expect(sim.world.player.alive).toBe(true);
    expect(recorder.summary.total).toBeGreaterThan(0);
    expect(recorder.table.some((r) => r.casts > 0)).toBe(true);
  });

  it('紀錄的總傷害等於事件裡的每一筆，招式統計也加得起來', () => {
    const sim = createSim({ enemyId: 'enemy.lava_behemoth', floor: 15, level: 20, gear: 'none', phase: 1 });
    const recorder = new SimRecorder(sim.world, sim.data, sim.enemy);
    let total = 0;
    sim.world.events.on('ActorDamaged', (e) => {
      if (e.targetId === sim.world.player.id) total += e.amount;
    });
    for (let i = 0; i < 30 * 60; i++) {
      tickSim(sim, DT);
      recorder.flush();
    }
    expect(recorder.summary.total).toBe(total);
    expect(recorder.table.reduce((s, r) => s + r.total, 0)).toBe(total);
    expect(recorder.summary.burst1s).toBeLessThanOrEqual(recorder.summary.burst5s);
    expect(recorder.summary.maxHit).toBeLessThanOrEqual(recorder.summary.burst1s);
  });

  it('清空紀錄後重新累計', () => {
    const { sim, recorder } = run({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 8, gear: 'none', phase: 1 }, 15);
    expect(recorder.hits.length).toBeGreaterThan(0);
    recorder.reset();
    expect(recorder.summary.total).toBe(0);
    expect(recorder.table).toEqual([]);
    expect(sim.world.player.alive).toBe(true);
  });

  it('敵人的數值套用該層的倍率', () => {
    const def = data.enemies.get('enemy.crypt_guardian');
    const scaling = scaleForFloor(20, data.balance.difficulty);
    const { enemy } = createSim({ enemyId: def.id, floor: 20, level: 30, gear: 'none', phase: 1 });
    expect(enemy.maxHp).toBeCloseTo(def.hp * scaling.bossHp);
    expect(enemy.stats.get('damageMin')).toBeCloseTo(def.damage[0] * scaling.damage);
  });

  it('主角等級與裝備會改變生命與防禦', () => {
    const low = createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 1, gear: 'none', phase: 1 }).world.player;
    const high = createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 40, gear: 'none', phase: 1 }).world.player;
    const geared = createSim({ enemyId: 'enemy.crypt_guardian', floor: 20, level: 40, gear: 'shield', phase: 1 }).world.player;
    expect(high.maxHp).toBe(low.maxHp + 39 * data.balance.statsPerLevel.maxHp!);
    expect(geared.maxHp).toBeGreaterThan(high.maxHp);
    expect(geared.stats.get('defense')).toBeGreaterThan(0);
  });

  it('技能表的預估涵蓋實際打到裸身主角的傷害', () => {
    const { sim, recorder } = run({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 8, gear: 'none', phase: 1 }, 40);
    const table = buildSkillTable(sim.data.enemies.get(sim.enemy.defId!), sim.enemy, sim.world.player, sim.data);
    for (const row of recorder.table) {
      const info = table.find((s) => s.name === row.skill);
      if (!info || row.source !== sim.enemy.name || row.hits === 0) continue;
      const top = Math.max(...info.lines.map((l) => l.max));
      expect(row.max).toBeLessThanOrEqual(top + 1);
    }
  });

  it.each(bosses.filter((b) => b.phases.length > 0).flatMap((b) => b.phases.map((_, i) => [b.id, i + 2] as const)))('%s 可以直接從第 %i 階段開始，對照表的屬性和實際相同', (enemyId, phase) => {
    const sim = createSim({ enemyId, floor: 20, level: 30, gear: 'shield', phase });
    const recorder = new SimRecorder(sim.world, sim.data, sim.enemy);
    tickSim(sim, DT);
    recorder.flush();
    expect(sim.world.bosses.phaseOf(sim.enemy)).toBe(phase - 1);
    const def = sim.data.enemies.get(enemyId);
    const column = buildPhaseTable(def, sim.enemy, sim.data)[phase - 1]!;
    expect(column.label).toBe(def.phases[phase - 2]!.label);
    for (const stat of ['damageBonus', 'attackSpeed', 'moveSpeed', 'damageMin'] as const) {
      expect(column.stats.get(stat)).toBeCloseTo(sim.enemy.stats.get(stat));
    }
    // 繼續打不會出錯，也不會超過這個階段
    for (let i = 0; i < 20 * 60; i++) {
      tickSim(sim, DT);
      recorder.flush();
    }
    expect(sim.world.player.alive).toBe(true);
    expect(sim.world.bosses.phaseOf(sim.enemy)).toBe(phase - 1);
  });

  it('沒有選階段時從滿血的初始階段開始', () => {
    const sim = createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 8, gear: 'none', phase: 1 });
    tickSim(sim, DT);
    expect(sim.world.bosses.phaseOf(sim.enemy)).toBe(0);
    expect(sim.enemy.hp).toBe(sim.enemy.maxHp);
  });

  it('招式表列出噬界足眼收爪時連發的招式', () => {
    const sim = createSim({ enemyId: 'enemy.abyss_dragon', floor: 24, level: 34, gear: 'shield', phase: 2 });
    const table = buildSkillTable(sim.data.enemies.get('enemy.abyss_dragon'), sim.enemy, sim.world.player, sim.data);
    expect(table.filter((s) => s.barrage).length).toBeGreaterThan(0);
  });

  it('主角可以被移動指令走動', () => {
    const sim = createSim({ enemyId: 'enemy.crypt_guardian', floor: 5, level: 8, gear: 'none', phase: 1 });
    const from = sim.world.player.position;
    sim.commands.push({ type: 'PrimaryAction', worldPos: vec2(from.x - 5, from.y), targetId: null, interactId: null, held: false });
    for (let i = 0; i < 30; i++) tickSim(sim, DT);
    expect(sim.world.player.position.x).toBeLessThan(from.x);
  });
});
