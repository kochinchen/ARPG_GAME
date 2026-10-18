import { describe, expect, it } from 'vitest';
import { coreGem, coreIcon, coreSvg, coreTypeColor, CORE_TYPE_COLORS, hexColor } from '../../src/render/icons/CoreIcons';
import { RARITY_COLORS } from '../../src/render/palette';

/** 熔核圖示：六角鑽石（SPEC §3.5） */
const gem = (over: Partial<Parameters<typeof coreGem>[0]> = {}) => coreGem({ types: ['sharp'], tier: 1, rarity: 'epic', ...over });

describe('熔核圖示', () => {
  it('外框 = 核色；核階越高切工越細（刻面數遞增）、星芒越多', () => {
    expect(gem().frame.color).toBe(hexColor(RARITY_COLORS.epic));
    const counts = [1, 2, 3, 4, 5].map((tier) => gem({ tier }).facets.length);
    expect(counts.every((c, i) => i === 0 || c > counts[i - 1]!)).toBe(true);
    expect(counts[0]).toBeGreaterThanOrEqual(18);
    expect(counts[4]).toBeGreaterThan(100);
    expect([1, 2, 3, 4, 5].map((tier) => gem({ tier }).sparkles.length)).toEqual([1, 2, 3, 4, 5]);
  });

  it('刻面有深有亮（反光對比），揭曉順序 0～5 都有', () => {
    const g = gem({ tier: 4 });
    const lightness = g.facets.map((f) => Number(f.color.match(/ ([\d.]+)%\)$/)![1]));
    expect(Math.min(...lightness)).toBeLessThan(15);
    expect(Math.max(...lightness)).toBeGreaterThan(65);
    expect(new Set(g.facets.map((f) => f.order))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  it('混核左右兩半各一種核種的顏色；印記在頂點加亮點', () => {
    const hues = (g: ReturnType<typeof gem>) => new Set(g.facets.map((f) => Math.round(Number(f.color.match(/^hsl\((-?[\d.]+)/)![1]) / 40)));
    expect(hues(gem({ types: ['sharp', 'heavy'], tier: 4 })).size).toBeGreaterThan(hues(gem({ tier: 4 })).size);
    expect(gem().brand).toBeNull();
    const brand = gem({ brand: { legendaryId: 'x', line: 0 } }).brand!;
    expect(brand[0]).toBeCloseTo(50);
    expect(brand[1]).toBeCloseTo(6);
  });

  it('核光顏色：靈核依元素，其他依核種', () => {
    expect(coreTypeColor('heavy')).toBe(CORE_TYPE_COLORS.heavy);
    expect(coreTypeColor('arcane', 'fire')).not.toBe(CORE_TYPE_COLORS.arcane);
  });

  it('SVG 與 data URI；同一種外觀只產生一次', () => {
    expect(coreSvg({ types: ['pierce'], tier: 3, rarity: 'rare' })).toMatch(/^<svg[^>]*viewBox="0 0 100 100"/);
    const a = coreIcon({ types: ['pierce'], tier: 3, rarity: 'rare' });
    expect(a.startsWith('data:image/svg+xml')).toBe(true);
    expect(coreIcon({ types: ['pierce'], tier: 3, rarity: 'rare' })).toBe(a);
  });
});
