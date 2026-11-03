import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { buildAreaTable, currentRadius, judgeArea, oldRadius } from '../../src/tools/bossSim/AreaTable';
import { createSim, tickSim } from '../../src/tools/bossSim/SimWorld';

const data = DataRegistry.load(gameData);
const table = buildAreaTable(data);
const row = (id: string) => table.find((s) => s.id === id)!;

describe('範圍表', () => {
  it('不列普通攻擊與固定範圍的招式', () => {
    expect(table.some((s) => s.id === 'basic.attack')).toBe(false);
    for (const s of table) expect(data.skills.get(s.id).fixedArea, s.id).toBe(false);
    expect(table.some((s) => s.id === 'enemy.eye_breath')).toBe(false);
  });

  it('被動技能不走 SkillSystem、不會放大，不列入', () => {
    expect(table.some((s) => s.id === 'enemy.lava_trail')).toBe(false);
  });

  it('招式會出現的樓層正確', () => {
    expect(row('enemy.sov_stomp').floors).toEqual([35]);
    expect(row('enemy.lord_domain').users).toContain('深淵魔王');
    expect(row('enemy.lord_domain').floors).toContain(30);
  });

  it('表上的半徑就是實際打下來的半徑', () => {
    const floor = 30;
    const sim = createSim({ enemyId: 'enemy.abyss_lord', floor, level: 43, gear: 'shield', phase: 2 });
    for (let i = 0; i < 25 * 60 && sim.world.scheduler.zones.length === 0; i++) tickSim(sim, 1 / 60);
    const zone = sim.world.scheduler.zones.find((z) => z.look === 'darkDomain')!;
    const skill = row('enemy.lord_domain');
    expect(zone.radius).toBeCloseTo(currentRadius(skill, skill.shapes[0]!, floor, data));
  });

  it('魔王：放大後不超過上限，本來就超過的不放大、也不比改動前大', () => {
    const cap = data.balance.difficulty.monsterBoost.bossSkillAreaCap;
    for (const s of table.filter((x) => x.boss)) {
      for (const floor of [1, 10, 20, 30, 35]) {
        const biggest = s.shapes.reduce((a, b) => (b.radius > a.radius ? b : a));
        const r = currentRadius(s, biggest, floor, data);
        expect(r).toBeLessThanOrEqual(Math.max(biggest.radius, cap) + 1e-9);
        expect(r).toBeGreaterThanOrEqual(biggest.radius);
        expect(r).toBeLessThanOrEqual(oldRadius(biggest.radius, floor, data));
      }
    }
  });

  it('一般怪與精英維持 ×1.5～3，沒有上限', () => {
    for (const s of table.filter((x) => !x.boss)) {
      const shape = s.shapes[0]!;
      expect(currentRadius(s, shape, 1, data)).toBeCloseTo(shape.radius * 1.5);
      expect(currentRadius(s, shape, 35, data)).toBeCloseTo(shape.radius * 3);
    }
  });

  it('實際生成的怪物：魔王與一般怪用各自的倍率', () => {
    const boss = createSim({ enemyId: 'enemy.crypt_guardian', floor: 35, level: 40, gear: 'none', phase: 1 }).enemy;
    const normal = createSim({ enemyId: 'enemy.armored_skeleton', floor: 35, level: 40, gear: 'none', phase: 1 }).enemy;
    expect(boss.skillArea).toBeCloseTo(1.5);
    expect(boss.skillAreaCap).toBe(8);
    expect(normal.skillArea).toBeCloseTo(3);
    expect(normal.skillAreaCap).toBe(Infinity);
  });

  it('沒有招式同時給魔王與一般怪用（否則表上的半徑會不準）', () => {
    for (const s of table) {
      const bosses = data.enemies.all.filter((e) => e.boss).map((e) => e.name);
      expect(new Set(s.users.map((u) => bosses.includes(u))).size, s.id).toBe(1);
    }
  });

  it('魔王散落的招式不會把落點範圍鋪滿', () => {
    for (const s of table.filter((x) => x.boss)) {
      for (const shape of s.shapes) {
        const r = currentRadius(s, shape, s.floors[s.floors.length - 1]!, data);
        if (shape.scatter > 0 && shape.repeat > 1) expect(judgeArea(shape, r, s.windup), s.id).toBe('ok');
      }
    }
  });

  it('預警和實際範圍一樣大：施放時的 aoeRadius 就是實際的倍率', () => {
    const sim = createSim({ enemyId: 'enemy.abyss_lord', floor: 30, level: 43, gear: 'shield', phase: 2 });
    let aoe: number | null = null;
    sim.world.events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.lord_domain') aoe = sim.enemy.cast?.mods.aoeRadius ?? null;
    });
    for (let i = 0; i < 25 * 60 && aoe === null; i++) tickSim(sim, 1 / 60);
    const skill = row('enemy.lord_domain');
    expect(skill.shapes[0]!.radius * (1 + aoe!)).toBeCloseTo(currentRadius(skill, skill.shapes[0]!, 30, data));
  });

  it('長條招式：預設不列（不會放大），範圍圖列出來；長寬和資料相同、樓層不影響', () => {
    expect(table.some((s) => s.id === 'enemy.sov_charge')).toBe(false);
    const charge = buildAreaTable(data, true).find((s) => s.id === 'enemy.sov_charge')!;
    expect(charge.scales).toBe(false);
    const shape = charge.shapes.find((s) => s.line)!;
    expect(shape.line).toMatchObject({ length: 30, width: 7 });
    expect(currentRadius(charge, shape, 35, data)).toBe(30);
    expect(buildAreaTable(data, true).find((s) => s.id === 'enemy.sov_fan_slash')!.shapes.filter((s) => s.line)).toHaveLength(5);
    expect(judgeArea(shape, 30, 0.1)).toBe('noEscape');
    expect(judgeArea(shape, 30, 2)).toBe('ok');
  });

  it('判定：跑不掉、鋪滿、窄扇形與地面區域不判定跑不掉', () => {
    const circle = { kind: 'area', radius: 5, angleDeg: 360, duration: 0, delay: 0, repeat: 1, scatter: 0, line: null } as const;
    expect(judgeArea(circle, 3, 1)).toBe('ok');
    expect(judgeArea(circle, 10, 1)).toBe('noEscape');
    expect(judgeArea({ ...circle, angleDeg: 16 }, 22, 1)).toBe('ok');
    expect(judgeArea({ ...circle, kind: 'zone' }, 22, 1)).toBe('ok');
    expect(judgeArea({ ...circle, repeat: 24, scatter: 10 }, 4, 0.5)).toBe('blanket');
    expect(judgeArea({ ...circle, repeat: 3, scatter: 10 }, 2, 0.5)).toBe('ok');
  });
});
