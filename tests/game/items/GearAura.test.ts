import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { Rarity } from '../../../src/data/schema/item';
import { gearAura } from '../../../src/game/items/GearAura';

/** 裝備光芒：稀有度分數加總決定強度，顏色用最高稀有度 */
const config = DataRegistry.load(gameData).balance.gearAura;
const gear = (...rarities: Rarity[]) => rarities.map((rarity, i) => ({ uid: `${i}`, baseId: 'ring.plain', rarity, itemLevel: 1, affixes: [] }));

describe('Gear Aura Score', () => {
  it('只穿一件傳奇不會發光（7 分 = 微弱）；整身好裝才明顯', () => {
    expect(gearAura(gear('normal', 'magic', 'magic'), config)).toEqual({ score: 2, level: 0, rarity: 'magic' });
    expect(gearAura(gear('legendary'), config).level).toBe(1);
    // 規劃書的例子：傳奇劍 7 + 稀有甲 2 + 魔法靴 1 + 稀有戒 2 = 12 → 中等
    expect(gearAura(gear('legendary', 'rare', 'magic', 'rare'), config)).toEqual({ score: 12, level: 2, rarity: 'legendary' });
    // 4 件史詩 + 2 件稀有 = 20 → 強
    expect(gearAura(gear('epic', 'epic', 'epic', 'epic', 'rare', 'rare'), config).level).toBe(3);
    expect(gearAura(gear('mythic', 'legendary', 'legendary', 'epic', 'epic', 'rare'), config).level).toBe(4);
  });

  it('沒有裝備時無光', () => {
    expect(gearAura([undefined, undefined], config)).toEqual({ score: 0, level: 0, rarity: 'normal' });
  });
});
