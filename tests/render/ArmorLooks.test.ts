import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { EquipmentSlot, ItemInstance } from '../../src/game/items/ItemInstance';
import { armorSpec, heroineOutfit, outfitFor, specForItem, UNIQUE_ARMOR_IDS } from '../../src/render/figure/gear/ArmorLooks';
import { itemThemes, THEMES } from '../../src/render/figure/gear/GearTheme';
import { themedLook, tierLook, weaponLookFor } from '../../src/render/figure/weapons/WeaponLooks';

const data = DataRegistry.load(gameData);
const item = (baseId: string, rarity: ItemInstance['rarity'], affixIds: string[] = [], extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `${baseId}:${rarity}:${affixIds.join(',')}`,
  baseId,
  rarity,
  itemLevel: 10,
  affixes: affixIds.map((id) => ({ id, rolls: [0.5] })),
  ...extra,
});
const equip = (items: Partial<Record<EquipmentSlot, ItemInstance>>) => (slot: EquipmentSlot) => items[slot];

describe('主角身上的頭盔、盔甲、靴子', () => {
  it('沒穿的部位保留原本外觀；穿上後換掉對應的關節', () => {
    expect(outfitFor(equip({}), data).size).toBe(0);
    const parts = outfitFor(equip({ helmet: item('helmet.cap', 'normal'), boots: item('boots.leather', 'normal') }), data);
    expect([...parts.keys()].sort()).toEqual(['footL', 'footR', 'head', 'shinL', 'shinR', 'thighL', 'thighR']);
    const withArmor = outfitFor(equip({ armor: item('armor.plate', 'normal') }), data);
    expect(withArmor.has('chest') && withArmor.has('torso') && withArmor.has('upperArmL') && withArmor.has('upperArmR')).toBe(true);
  });

  it('同一組裝備重複使用同一份網格（換裝時才重建）', () => {
    const items = equip({ helmet: item('helmet.iron_helm', 'magic') });
    expect(outfitFor(items, data)).toBe(outfitFor(items, data));
  });

  it('8 階造型各不相同', () => {
    for (const slot of ['helmet', 'armor', 'gloves', 'boots', 'shield'] as const) {
      const looks = [1, 2, 3, 4, 5, 6, 7, 8].map((tier) => JSON.stringify(armorSpec(slot, tier, 'normal', [])));
      expect(new Set(looks).size, slot).toBe(8);
    }
  });

  it('全罩頭盔蓋住臉；帽子與開放式頭盔露出臉', () => {
    // AI 版身體：頭盔都會收起頭髮；只有全罩頭盔把臉也藏起來
    const open = heroineOutfit({ helmet: armorSpec('helmet', 1, 'normal', []) });
    const closed = heroineOutfit({ helmet: { ...armorSpec('helmet', 1, 'normal', []), style: 'closed' } });
    expect(open.get('head')!.length).toBeGreaterThan(0);
    expect(open.hideSkin?.has('hair')).toBe(true);
    expect(open.hideSkin?.has('head')).toBe(false);
    expect(closed.hideSkin?.has('head')).toBe(true);
    expect(armorSpec('helmet', 3, 'normal', []).style).toBe('closed');
  });

  it('詞綴主題：強屬性優先；抗火 → 火焰色的寶石與符文；普通裝備不變色', () => {
    const helm = item('helmet.rune_helm', 'rare', ['affix.sturdy', 'strong.ashen']);
    expect(itemThemes(helm, data)).toEqual(['fire', 'guard']);
    const spec = specForItem('helmet', helm, data);
    expect(spec.gem).toBe(THEMES.fire.color);
    expect(spec.runes).toBe(THEMES.fire.color);
    expect(spec.mat).not.toEqual(armorSpec('helmet', 4, 'normal', []).mat);
    expect(specForItem('helmet', item('helmet.rune_helm', 'normal', ['affix.fireproof']), data)).toEqual(armorSpec('helmet', 4, 'normal', []));
    // 魔法（藍）沒有發光符文
    expect(specForItem('helmet', item('helmet.rune_helm', 'magic', ['affix.fireproof']), data).runes).toBeUndefined();
  });

  it('形狀主題：防禦 → 全罩、加大肩甲；敏捷 → 靴子長翅膀；荊棘 → 尖刺', () => {
    expect(specForItem('helmet', item('helmet.cap', 'rare', ['affix.sturdy']), data).style).toBe('closed');
    expect(specForItem('armor', item('armor.quilted', 'rare', ['affix.sturdy']), data).pauldron).toBeGreaterThanOrEqual(1);
    expect(specForItem('boots', item('boots.leather', 'rare', ['affix.swift']), data).wings).toBeDefined();
    expect(specForItem('boots', item('boots.leather', 'rare', ['affix.thorned']), data).spikes).toBeGreaterThanOrEqual(4);
  });

  it('手套：換掉前臂與手；指節甲、爪、尖刺只在放大時畫（LOD 2）', () => {
    const parts = outfitFor(equip({ gloves: item('gloves.blacksteel', 'normal') }), data);
    expect([...parts.keys()].sort()).toEqual(['forearmL', 'forearmR', 'handL', 'handR']);
    const hand = parts.get('handR')!;
    const details = hand.filter((m) => m.lod === 2);
    expect(details.length).toBeGreaterThan(0);
    // 手掌與手指本身一定畫
    expect(hand.some((m) => m.lod === undefined)).toBe(true);
    // 換手套會重建外觀
    expect(outfitFor(equip({ gloves: item('gloves.abyss', 'normal') }), data)).not.toBe(parts);
  });

  it('盾牌拿在左手；每一件橘 / 紅頭盔、盔甲、手套、靴子、盾牌都有專屬外觀', () => {
    const parts = outfitFor(equip({ weapon: item('weapon.short_sword', 'normal'), shield: item('shield.kite', 'normal') }), data);
    expect([...parts.keys()]).toEqual(['weaponL']);
    const ids = data.legendaries.all.filter((d) => ['helmet', 'armor', 'gloves', 'boots', 'shield'].includes(d.kind)).map((d) => d.id);
    expect([...UNIQUE_ARMOR_IDS].sort()).toEqual(ids.sort());
  });
});

describe('手上武器的詞綴主題', () => {
  it('普通或沒有詞綴：基底造型；有詞綴：主題造型與主題色光芒', () => {
    expect(weaponLookFor(item('weapon.rune_sword', 'rare'), data)!.look).toBe(tierLook('sword', 4));
    expect(weaponLookFor(item('weapon.rune_sword', 'normal', ['affix.burning']), data)!.look).toBe(tierLook('sword', 4));
    const fire = weaponLookFor(item('weapon.rune_sword', 'rare', ['affix.burning']), data)!.look;
    expect(fire).not.toBe(tierLook('sword', 4));
    expect(fire.glow).toEqual({ color: THEMES.fire.color, particle: THEMES.fire.particle });
    // 同一組合只建一次；不同主題造型不同
    expect(themedLook('sword', 4, 'rare', ['fire'])).toBe(fire);
    expect(themedLook('sword', 4, 'rare', ['cold'])).not.toBe(fire);
  });
});
