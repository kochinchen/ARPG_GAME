import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { ItemInstance } from '../../src/game/items/ItemInstance';
import { itemIcon, potionIcon } from '../../src/render/icons/ItemIcons';
import { itemEntryView } from '../../src/ui/bridge/InventoryView';

const data = DataRegistry.load(gameData);
const item = (baseId: string, rarity: ItemInstance['rarity'], affixIds: string[] = [], extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `${baseId}:${rarity}`,
  baseId,
  rarity,
  itemLevel: 10,
  affixes: affixIds.map((id) => ({ id, rolls: [0.5] })),
  ...extra,
});
const svg = (uri: string | null) => decodeURIComponent(uri!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

describe('物品圖示', () => {
  it('所有裝備、戒指、護符與藥水都有圖示（SVG）', () => {
    for (const id of ['weapon.short_sword', 'weapon.rune_sword', 'helmet.cap', 'armor.plate', 'gloves.leather', 'boots.leather', 'shield.kite', 'ring.plain', 'ring.rune', 'amulet.bone', 'amulet.silver']) {
      const uri = itemIcon(item(id, 'normal'), data);
      expect(uri, id).toMatch(/^data:image\/svg\+xml/);
      expect(svg(uri)).toContain('<path');
    }
    expect(svg(potionIcon(0.25, 0.25))).toContain('<path');
    // 每一種裝備基底都畫得出來
    expect(data.items.all.every((b) => itemIcon(item(b.id, 'normal'), data) !== null)).toBe(true);
  });

  it('同一個基底：詞綴與稀有度改變圖示；相同外觀共用同一張', () => {
    const plain = itemIcon(item('weapon.rune_sword', 'normal'), data);
    const fire = itemIcon(item('weapon.rune_sword', 'rare', ['affix.burning']), data);
    expect(fire).not.toBe(plain);
    expect(svg(fire)).toContain('radialGradient');
    expect(itemIcon({ ...item('weapon.rune_sword', 'rare', ['affix.burning']), uid: 'other' }, data)).toBe(fire);
  });

  it('每一件傳奇 / 神話裝備都有自己的圖示', () => {
    const uris = data.legendaries.all
      .map((d) => {
        const base = data.items.all.find((b) => b.slot === d.kind || b.weaponType === d.kind)!;
        return itemIcon(item(base.id, d.rarity, [], { legendaryId: d.id }), data);
      });
    expect(uris.every((u) => u !== null)).toBe(true);
    // 武器與防具都是專屬造型；飾品依主題色與外形，也大多不同
    const gear = uris.filter((_, i) => !['ring', 'amulet'].includes(data.legendaries.all[i]!.kind));
    expect(new Set(gear).size).toBe(gear.length);
    expect(new Set(uris).size).toBeGreaterThan(uris.length * 0.85);
  });

  it('背包的格子資料帶有圖示', () => {
    expect(itemEntryView(item('ring.gold', 'magic'), data).icon).toMatch(/^data:image\/svg\+xml/);
    expect(itemEntryView(item('gloves.abyss', 'epic', ['affix.burning']), data).icon).toMatch(/^data:image\/svg\+xml/);
  });
});
