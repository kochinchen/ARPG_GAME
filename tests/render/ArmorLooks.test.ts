import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { EquipmentSlot, ItemInstance } from '../../src/game/items/ItemInstance';
import { armorSpec, heroineOutfit, outfitFor, specForItem, UNIQUE_ARMOR_IDS, uniqueArmorSpec } from '../../src/render/figure/gear/ArmorLooks';
import { itemThemes, THEMES } from '../../src/render/figure/gear/GearTheme';
import { themedLook, tierLook, weaponLookFor } from '../../src/render/figure/weapons/WeaponLooks';
import { AI_BOOT_FACES, aiBootShape, HEROINE_AI } from '../../src/render/figure/HeroineAI';

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
    // 靴子是身體的一部分：換成裝備的顏色（skinColors），尖刺等裝飾掛在小腿
    expect([...parts.keys()].sort()).toEqual(['head', 'shinL', 'shinR']);
    expect(parts.skinColors!.size).toBeGreaterThan(200);
    const withArmor = outfitFor(equip({ armor: item('armor.plate', 'normal') }), data);
    // 一般盔甲貼身、腰露出來
    expect(withArmor.has('chest') && withArmor.has('upperArmL') && withArmor.has('upperArmR')).toBe(true);
  });

  it('靴子：AI 版身上的皮靴拆成 bootL / bootR，穿上時換色且不藏起來；裝飾貼在靴子表面外', () => {
    const regions = new Set(HEROINE_AI.skin!.faces.map((f) => f.region));
    expect(regions.has('bootL') && regions.has('bootR')).toBe(true);
    const boots = heroineOutfit({ boots: armorSpec('boots', 5, 'normal', []) });
    expect([...(boots.hideSkin ?? [])].some((r) => r.startsWith('boot') || r.startsWith('shin') || r.startsWith('foot'))).toBe(false);
    for (const i of AI_BOOT_FACES.map((f) => f.index)) expect(HEROINE_AI.skin!.faces[i]!.region).toMatch(/^boot[LR]$/);
    // T5 的尖刺：根部在靴子正面附近（不埋在裡面、也不浮在外面）
    const spikes = boots.get('shinL')!;
    expect(spikes.length).toBe(3);
    for (const m of spikes) {
      const back = Math.min(...m.verts.map((v) => v[2]));
      const y = m.verts.reduce((s, v) => s + v[1], 0) / m.verts.length;
      expect(Math.abs(back - aiBootShape(y).front)).toBeLessThan(1.5);
    }
  });

  it('橘 / 紅靴子：每一件都有專屬裝飾，貼在靴子附近（不飄走）', () => {
    const ids = UNIQUE_ARMOR_IDS.filter((id) => uniqueArmorSpec('boots', id) && data.legendaries.get(id).kind === 'boots');
    expect(ids.length).toBe(18);
    const looks = new Set<string>();
    for (const id of ids) {
      const outfit = heroineOutfit({ boots: uniqueArmorSpec('boots', id)! });
      const shin = outfit.get('shinL') ?? [];
      const foot = outfit.get('footL') ?? [];
      expect(shin.length + foot.length, id).toBeGreaterThan(0);
      looks.add(JSON.stringify(uniqueArmorSpec('boots', id)));
      // 小腿的裝飾在膝蓋到腳底之間、離小腿中心 12 單位以內（凌雲的大羽翼最遠）；腳掌的裝飾在腳掌附近
      for (const m of shin) for (const v of m.verts) expect(Math.hypot(v[0], v[2]) < 12 && v[1] < 9 && v[1] > -20, id).toBe(true);
      for (const m of foot) for (const v of m.verts) expect(Math.hypot(v[0], v[2] - 3) < 10 && v[1] < 6 && v[1] > -6, id).toBe(true);
    }
    expect(looks.size).toBe(18);
  });

  it('橘 / 紅盔甲：熔岩巨甲用 AI 模型，其他都有專屬造型（9 種），藏起原本的胸口與裙子，零件不飄走', () => {
    const ids = UNIQUE_ARMOR_IDS.filter((id) => data.legendaries.get(id).kind === 'armor');
    const looks = new Set<string>();
    for (const id of ids) {
      const spec = uniqueArmorSpec('armor', id)!;
      if (id === 'mythic.armor_lava_behemoth') {
        expect(spec.model).toBe('lava_behemoth');
        continue;
      }
      expect(spec.look, id).toBeDefined();
      looks.add(spec.look!);
      const outfit = heroineOutfit({ armor: spec });
      for (const region of ['chest', 'cloth', 'clothBack']) expect(outfit.hideSkin?.has(region), id).toBe(true);
      for (const j of ['chest', 'root', 'cloth', 'clothBack', 'upperArmL', 'upperArmR'] as const) {
        const meshes = outfit.get(j) ?? [];
        expect(meshes.length, `${id} ${j}`).toBeGreaterThan(0);
        // 長袍下擺、胸口的光環、蜘蛛腳最遠；都在關節 22 單位以內
        for (const m of meshes) for (const v of m.verts) expect(Math.hypot(...v) < 22, `${id} ${j}`).toBe(true);
      }
    }
    expect(looks.size).toBe(9);
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
    const closed = heroineOutfit({ helmet: armorSpec('helmet', 5, 'normal', []) });
    expect(open.get('head')!.length).toBeGreaterThan(0);
    expect(open.hideSkin?.has('hair')).toBe(true);
    expect(open.hideSkin?.has('face')).toBe(false);
    expect(closed.hideSkin?.has('face')).toBe(true);
    expect(armorSpec('helmet', 5, 'normal', []).style).toBe('closed');
    // T3 是露臉的鋼盔
    expect(armorSpec('helmet', 3, 'normal', []).style).toBe('open');
  });

  it('詞綴主題：強屬性優先；抗火 → 火焰色的寶石與符文；普通裝備不變色', () => {
    const helm = item('helmet.rune_helm', 'rare', ['affix.sturdy', 'strong.ashen']);
    expect(itemThemes(helm, data)).toEqual(['fire', 'guard']);
    const spec = specForItem('helmet', helm, data);
    expect(spec.gem).toBe(THEMES.fire.color);
    // 一般裝備不再有符文，只有小寶石
    expect(spec.runes).toBeUndefined();
    expect(spec.mat).not.toEqual(armorSpec('helmet', 4, 'normal', []).mat);
    expect(specForItem('helmet', item('helmet.rune_helm', 'normal', ['affix.fireproof']), data)).toEqual(armorSpec('helmet', 4, 'normal', []));
    // 魔法（藍）沒有發光符文
    expect(specForItem('helmet', item('helmet.rune_helm', 'magic', ['affix.fireproof']), data).runes).toBeUndefined();
  });

  it('形狀主題：防禦 → 全罩、加大肩甲；敏捷 → 靴子長翅膀；荊棘 → 尖刺', () => {
    expect(specForItem('helmet', item('helmet.cap', 'rare', ['affix.sturdy']), data).style).toBe('closed');
    expect(specForItem('armor', item('armor.quilted', 'rare', ['affix.sturdy']), data).pauldron).toBeGreaterThanOrEqual(1);
    expect(specForItem('boots', item('boots.leather', 'rare', ['affix.swift']), data).wings).toBeDefined();
    // 一般靴子的荊棘只有兩根小尖刺
    expect(specForItem('boots', item('boots.leather', 'rare', ['affix.thorned']), data).spikes).toBe(2);
  });

  it('手套：換掉前臂與手，藏起被蓋住的手與護腕', () => {
    const parts = outfitFor(equip({ gloves: item('gloves.blacksteel', 'normal') }), data);
    expect([...parts.keys()].sort()).toEqual(['forearmL', 'forearmR', 'handL', 'handR']);
    expect([...parts.hideSkin!].sort()).toEqual(['bracerL', 'bracerR', 'handL', 'handR']);
    // 手掌與手指本身一定畫
    expect(parts.get('handR')!.some((m) => m.lod === undefined)).toBe(true);
    // 換手套會重建外觀
    expect(outfitFor(equip({ gloves: item('gloves.abyss', 'normal') }), data)).not.toBe(parts);
  });

  it('紅手套：藏起被蓋住的手與護腕，手肘的皮膚還在；前臂的外殼依手臂形狀放樣，左右不同', () => {
    for (const id of ['mythic.gloves_abyss_lord', 'mythic.gloves_crypt_guardian', 'mythic.gloves_lava_behemoth', 'mythic.gloves_spider_queen', 'mythic.god_hunter_hands', 'mythic.titan_grip']) {
      const parts = heroineOutfit({ gloves: uniqueArmorSpec('gloves', id)! });
      expect([...parts.hideSkin!].sort()).toEqual(['bracerL', 'bracerR', 'handL', 'handR']);
      expect([...parts.keys()].sort()).toEqual(['forearmL', 'forearmR', 'handL', 'handR']);
      expect(parts.get('forearmL')![0]!.verts[0]).not.toEqual(parts.get('forearmR')![0]!.verts[0]);
    }
  });

  it('每一件橘 / 紅手套都有專屬造型（包住手與護腕）', () => {
    const ids = data.legendaries.all.filter((d) => d.kind === 'gloves').map((d) => d.id);
    expect(ids).toHaveLength(18);
    for (const id of ids) {
      expect(uniqueArmorSpec('gloves', id)!.look, id).toBeDefined();
      expect([...heroineOutfit({ gloves: uniqueArmorSpec('gloves', id)! }).hideSkin!].sort(), id).toEqual(['bracerL', 'bracerR', 'handL', 'handR']);
    }
  });

  it('一般裝備：頭盔、盔甲、手套都貼合女主角；詞條只淡淡染色，多一顆小寶石，不長翅膀', () => {
    const plain = heroineOutfit({ helmet: armorSpec('helmet', 3, 'normal', []), armor: armorSpec('armor', 3, 'normal', []), gloves: armorSpec('gloves', 3, 'normal', []) });
    expect([...plain.hideSkin!].sort()).toEqual(['bracerL', 'bracerR', 'chest', 'hair', 'handL', 'handR', 'head', 'pauldronL', 'pauldronR']);
    const fire = armorSpec('armor', 3, 'epic', ['fire']);
    const steel = armorSpec('armor', 3, 'normal', []);
    const channel = (c: number) => (c >> 16) & 0xff;
    expect(Math.abs(channel(fire.mat[0]!) - channel(steel.mat[0]!))).toBeLessThan(40);
    expect(fire.emblem).toBeDefined();
    expect(heroineOutfit({ helmet: armorSpec('helmet', 3, 'epic', ['fire']) }).get('head')!.length).toBe(heroineOutfit({ helmet: armorSpec('helmet', 3, 'normal', []) }).get('head')!.length + 1);
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
