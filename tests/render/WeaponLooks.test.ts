import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { tierLook, UNIQUE_WEAPON_IDS, uniqueLook, weaponLookFor } from '../../src/render/figure/weapons/WeaponLooks';

const data = DataRegistry.load(gameData);

describe('手上的武器造型', () => {
  it('每種武器的 8 階基底造型都不同；弓在左手，其他在右手', () => {
    for (const kind of ['sword', 'axe', 'bow', 'staff'] as const) {
      const looks = [1, 2, 3, 4, 5, 6, 7, 8].map((t) => tierLook(kind, t));
      expect(new Set(looks).size, kind).toBe(8);
      for (const look of looks) {
        expect(look.meshes.length).toBeGreaterThan(2);
        expect(look.hand).toBe(kind === 'bow' ? 'left' : 'right');
      }
    }
  });

  it('每一件橘 / 紅武器都有專屬造型與光芒，彼此不重複', () => {
    const weapons = data.legendaries.all.filter((d) => ['sword', 'axe', 'bow', 'staff'].includes(d.kind));
    expect(weapons.map((d) => d.id).sort()).toEqual([...UNIQUE_WEAPON_IDS].sort());
    const glows = new Set<string>();
    for (const d of weapons) {
      const look = uniqueLook(d.id)!;
      expect(look.glow, d.id).toBeDefined();
      glows.add(JSON.stringify(look.glow) + look.meshes.length);
    }
    expect(glows.size).toBe(weapons.length);
  });

  it('裝備的武器 → 造型：傳奇用專屬造型、一般依基底階級；防具與空手沒有', () => {
    const base = { uid: 'x', rarity: 'rare' as const, itemLevel: 1, affixes: [] };
    expect(weaponLookFor({ ...base, baseId: 'weapon.rune_sword' }, data)!.look).toBe(tierLook('sword', 4));
    expect(weaponLookFor({ ...base, baseId: 'weapon.abyss_soul_sword', rarity: 'mythic', legendaryId: 'mythic.world_rift' }, data)!.look).toBe(uniqueLook('mythic.world_rift'));
    expect(weaponLookFor({ ...base, baseId: 'armor.quilted' }, data)).toBeNull();
    expect(weaponLookFor(undefined, data)).toBeNull();
  });
});
