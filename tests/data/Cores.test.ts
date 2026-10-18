import { describe, expect, it } from 'vitest';
import { DataRegistry, DataValidationError, type RawGameData } from '../../src/data/DataRegistry';
import { gameData } from '../../src/data';
import { cores } from '../../src/data/cores';
import { CORE_SLOTS } from '../../src/data/schema/core';

/** 熔核資料（v0.5.0 鑲嵌與融合，SPEC §1.6、§3、§7.2） */
const data = DataRegistry.load(gameData);

function problemsWith(patch: unknown): string[] {
  const raw: RawGameData = { ...gameData, cores: patch };
  try {
    DataRegistry.load(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(DataValidationError);
    return (error as DataValidationError).problems;
  }
  throw new Error('expected DataValidationError');
}

const clone = () => structuredClone(cores) as { types: { id: string; enabled: boolean; weapon?: string; slots: Record<string, unknown[]> }[]; shared: { id: string; type: string; stat?: string }[] };

describe('熔核資料', () => {
  it('四種攻核各對應一種武器；四種護核各對應防具部位（盔甲與盾牌都是壁核），全部啟用', () => {
    const attack = data.cores.types.all.filter((t) => t.family === 'attack');
    expect(attack.map((t) => [t.id, t.weapon, t.enabled])).toEqual([
      ['sharp', 'sword', true],
      ['heavy', 'axe', true],
      ['pierce', 'bow', true],
      ['arcane', 'staff', true],
    ]);
    expect(data.cores.types.all.filter((t) => t.family === 'defense').map((t) => [t.id, t.sourceSlots, t.enabled])).toEqual([
      ['wall', ['armor', 'shield'], true],
      ['swift', ['boots'], true],
      ['grip', ['gloves'], true],
      ['crown', ['helmet'], true],
    ]);
    // 護核的手套、鞋子欄（2026-10-18）與冠核武器欄 4～6%
    expect(data.cores.lines.get('core.wall.block')).toMatchObject({ stat: 'blockChance', value: [0.02, 0.04] });
    expect(data.cores.lines.get('core.grip.crit')).toMatchObject({ stat: 'critChance', value: [0.015, 0.03] });
    expect(data.cores.lines.get('core.crown.damage')).toMatchObject({ stat: 'damageBonus', value: [0.04, 0.06] });
  });

  it('所有核種五個部位都有主屬性（武器、頭盔、衣裝、手套、鞋子），每格 1～2 條', () => {
    for (const type of data.cores.types.all.filter((t) => t.enabled)) {
      for (const slot of CORE_SLOTS) {
        const lines = type.slots[slot]!;
        expect(lines.length, `${type.id}.${slot}`).toBeGreaterThanOrEqual(1);
        expect(lines.length, `${type.id}.${slot}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('SPEC §3.1 的代表數值：重擊技傷、射擊距離（T5 另有範圍）、穿透 +1 固定且紫以上', () => {
    const heavy = data.cores.lines.get('core.heavy.heavy_damage');
    expect(heavy).toMatchObject({ type: 'mods', mod: 'damage', value: [0.08, 0.12], when: { tags: ['Heavy'] } });
    expect(data.cores.lines.get('core.pierce.range')).toMatchObject({ type: 'stat', stat: 'projectileRange', value: [0.5, 1], t5Value: [1.5, 2] });
    expect(data.cores.lines.get('core.pierce.pierce')).toMatchObject({ mod: 'pierce', value: [1, 1], scaling: 'none', minRarity: 'epic' });
    expect(data.cores.lines.get('core.arcane.element_damage')).toMatchObject({ type: 'element', kind: 'damage', value: [0.06, 0.1] });
  });

  it('通用副屬性池 5 條：生命、防禦、所有傷害、暴擊傷害、藥水效果', () => {
    expect(data.cores.shared.map((l) => (l.type === 'stat' ? l.stat : l.type))).toEqual(['maxHp', 'defense', 'damageBonus', 'critDamageBonus', 'potionEffect']);
  });

  it('balance：孔數 5/4/3/2/1/0、融合 2～4 把、核階倍率 T5 ×1.75、印記 35% / 上限 85% / ×0.7', () => {
    const { sockets, fusion } = data.balance;
    expect(sockets.max).toEqual({ normal: 5, magic: 4, rare: 3, epic: 2, legendary: 1, mythic: 0 });
    expect(sockets.bodyCap).toBe(1.5);
    expect(fusion.inputs).toEqual({ min: 2, max: 4 });
    expect(fusion.tierMultiplier).toEqual([1, 1.15, 1.32, 1.52, 1.75]);
    expect(fusion.tierMultiplier).toHaveLength(data.balance.affixPower.maxTier);
    expect(fusion.brand).toEqual({ chance: 0.35, chanceCap: 0.85, valueMultiplier: 0.7 });
  });
});

describe('熔核資料驗證', () => {
  it('屬性 ID 重複', () => {
    const c = clone();
    c.shared.push({ ...c.shared[0]! });
    expect(problemsWith(c)).toContain(`熔核屬性 ID 重複：'core.shared.max_hp'（shared）`);
  });

  it('啟用的核種缺部位', () => {
    const c = clone();
    delete c.types[0]!.slots.boots;
    expect(problemsWith(c)).toContain(`熔核 'sharp' 已啟用，但沒有「boots」部位的屬性`);
  });

  it('不可使用吸血 / 回魔', () => {
    const c = clone();
    c.shared.push({ id: 'core.shared.steal', type: 'stat', stat: 'lifeSteal', value: [0.001, 0.002] } as never);
    expect(problemsWith(c)).toContain(`熔核屬性 'core.shared.steal' 不可使用 lifeSteal`);
  });

  it('每種武器剛好一種啟用的攻核', () => {
    const c = clone();
    c.types[0]!.enabled = false;
    expect(problemsWith(c)).toContain(`武器 'sword' 應剛好對應一種啟用的攻核（目前 0 種）`);
  });
});
