import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { HOLD, mountFor, tierLook, UNIQUE_WEAPON_IDS, uniqueLook, weaponLookFor } from '../../src/render/figure/weapons/WeaponLooks';
import { HEROINE } from '../../src/render/figure/Heroine';
import { solveJoints } from '../../src/render/figure/FigureModel';
import { apply, jointRotation } from '../../src/render/figure/Poly3D';

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

  it('平常拿法：劍照握點角度；斧柄朝前、斧刃朝下；法杖前傾、弓直立（攻擊時轉回）', () => {
    expect(mountFor(tierLook('sword', 3)).rest).toBeUndefined();
    // 待機姿勢下斧頭的世界方向：斧柄（握點空間 -Y）朝前、斧刃（+Z）朝下
    const rest = mountFor(tierLook('axe', 3)).rest!;
    const base = HEROINE.poses.ready(0);
    const w = base.angles.weapon ?? [0, 0, 0];
    const m = solveJoints(HEROINE.parts, HEROINE.hipHeight, { ...base, angles: { ...base.angles, weapon: [w[0] + rest[0], w[1] + rest[1], w[2] + rest[2]] } }).get('weapon')!.m;
    const hold = jointRotation(HOLD.axe);
    const haft = apply(m, apply(hold, [0, -1, 0]));
    const edge = apply(m, apply(hold, [0, 0, 1]));
    expect(haft[2]).toBeGreaterThan(0.9);
    expect(edge[1]).toBeLessThan(-0.9);
    expect(mountFor(tierLook('staff', 3)).rest![0]).toBeGreaterThan(0);
    expect(mountFor(tierLook('bow', 3))).toMatchObject({ joint: 'weaponL', rest: [expect.any(Number), 0, 0] });
  });
});
