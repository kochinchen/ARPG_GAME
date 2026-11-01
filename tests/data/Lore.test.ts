import { describe, expect, it } from 'vitest';
import LORE from '../../src/data/lore.json';
import NOTEBOOK from '../../src/data/notebook.json';
import SOULS from '../../src/data/souls.json';

describe('遺物文字（data/lore.json）', () => {
  it('第 1～34 層各一件；ID 不重複、英中文都有', () => {
    for (let floor = 1; floor <= 34; floor++) expect(LORE.filter((l) => l.floor === floor)).toHaveLength(1);
    expect(LORE).toHaveLength(34);
    expect(new Set(LORE.map((l) => l.id)).size).toBe(LORE.length);
    for (const l of LORE) expect(l.object && l.en && l.zh).toBeTruthy();
  });
  it('筆記：十頁散布在第 35 層以外的不同樓層', () => {
    expect(NOTEBOOK).toHaveLength(10);
    expect(new Set(NOTEBOOK.map((n) => n.floor)).size).toBe(10);
    for (const n of NOTEBOOK) expect(n.floor).toBeLessThan(35);
  });

  it('魂魄：每位魔王一個（5、10…30、31～35 層）', () => {
    expect(SOULS.map((s) => s.floor)).toEqual([5, 10, 15, 20, 25, 30, 31, 32, 33, 34, 35]);
  });
});
