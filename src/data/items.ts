import type { z } from 'zod';
import type { ItemBaseDefSchema, PotionDefSchema } from './schema/item';

type BaseInput = z.input<typeof ItemBaseDefSchema>;

/**
 * 武器種類的內建加成（不限制技能，只讓對應類別更強）：
 * 劍 近戰 +8%、暴擊 +2%；斧 近戰 +12%；弓 遠程 +15%；法杖 法術 +15%（另有法術強度）。
 */
const SWORD = { meleeDamageBonus: 0.08, critChance: 0.02 };
const AXE = { meleeDamageBonus: 0.12 };
const BOW = { rangedDamageBonus: 0.15 };
const STAFF = { spellDamageBonus: 0.15 };

/** [ID, 名稱, 等級需求, 最小傷害, 最大傷害, 其他屬性] */
type WeaponRow = [string, string, number, number, number, Record<string, number>?];
const weapons = (type: 'sword' | 'axe' | 'bow' | 'staff', implicit: Record<string, number>, rows: WeaponRow[]): BaseInput[] =>
  rows.map(([id, name, levelReq, damageMin, damageMax, extra]) => ({
    id: `weapon.${id}`,
    name,
    slot: 'weapon',
    weaponType: type,
    levelReq,
    baseStats: { damageMin, damageMax, ...implicit, ...extra },
  }));

/** [ID, 名稱, 等級需求, 防禦] */
const armors = (slot: 'helmet' | 'armor' | 'gloves' | 'boots', rows: [string, string, number, number][]): BaseInput[] =>
  rows.map(([id, name, levelReq, defense]) => ({ id: `${slot}.${id}`, name, slot, levelReq, baseStats: { defense } }));

/** 飾品：沒有基礎屬性，階級越高名稱越好（詞綴依物品等級） */
const jewelry = (slot: 'ring' | 'amulet', rows: [string, string, number][]): BaseInput[] => rows.map(([id, name, levelReq]) => ({ id: `${slot}.${id}`, name, slot, levelReq }));

/** 裝備基底。稀有度、詞綴與名稱由 ItemGenerator / ItemNamer 產生。 */
export const items: BaseInput[] = [
  ...weapons('sword', SWORD, [
    ['short_sword', '短劍', 1, 2, 5],
    ['long_sword', '長劍', 4, 3, 7],
    ['broad_sword', '闊劍', 8, 4, 9],
    ['war_sword', '戰劍', 12, 5, 11],
    ['scimitar', '彎刃', 16, 6, 13, { critChance: 0.04 }],
    ['heavy_sword', '重劍', 20, 8, 16],
    ['bone_blade', '骨刃', 25, 9, 18],
    ['rift_blade', '裂刃', 30, 11, 21],
    ['knight_sword', '騎士劍', 35, 12, 24],
    ['ancient_sword', '古代劍', 40, 14, 28],
  ]),
  ...weapons('axe', AXE, [
    ['hand_axe', '手斧', 1, 3, 7],
    ['war_axe', '戰斧', 5, 4, 9],
    ['moon_axe', '月刃斧', 10, 5, 12],
    ['bonesplitter', '裂骨斧', 15, 7, 15],
    ['double_axe', '雙刃斧', 20, 9, 18],
    ['great_axe', '巨斧', 26, 11, 22],
    ['hook_axe', '鉤刃斧', 32, 13, 26],
    ['fang_axe', '獸牙斧', 38, 15, 30],
  ]),
  ...weapons('bow', BOW, [
    ['short_bow', '短弓', 1, 2, 5],
    ['hunting_bow', '獵弓', 5, 3, 8],
    ['long_bow', '長弓', 10, 4, 10],
    ['war_bow', '戰弓', 15, 6, 13],
    ['composite_bow', '複合弓', 20, 7, 16],
    ['bone_bow', '骨弓', 26, 9, 19],
    ['thorn_bow', '刺弓', 32, 11, 23],
    ['abyss_bow', '深淵弓', 38, 13, 27],
  ]),
  ...weapons('staff', STAFF, [
    ['short_staff', '短杖', 1, 1, 3, { spellPower: 3 }],
    ['staff', '法杖', 5, 2, 4, { spellPower: 5 }],
    ['battle_staff', '戰杖', 10, 3, 6, { spellPower: 7 }],
    ['crystal_staff', '水晶杖', 15, 3, 7, { spellPower: 10 }],
    ['bone_staff', '骨杖', 20, 4, 8, { spellPower: 13 }],
    ['rune_staff', '符文杖', 26, 5, 10, { spellPower: 17 }],
    ['elemental_staff', '元素杖', 32, 6, 12, { spellPower: 21 }],
    ['abyss_staff', '深淵杖', 38, 7, 14, { spellPower: 26 }],
  ]),
  ...armors('helmet', [
    ['cap', '皮帽', 1, 3],
    ['iron_helm', '鐵盔', 6, 6],
    ['horned_helm', '角盔', 12, 9],
    ['bone_helm', '骨盔', 18, 12],
    ['war_helm', '戰盔', 25, 16],
    ['ancient_crown', '古代頭冠', 32, 20],
  ]),
  ...armors('armor', [
    ['quilted', '布甲', 1, 8],
    ['leather', '皮甲', 4, 12],
    ['chain', '鎖甲', 9, 17],
    ['iron', '鐵甲', 14, 23],
    ['plate', '板甲', 20, 30],
    ['bone', '獸骨戰甲', 26, 38],
    ['deep_rock', '深岩鎧甲', 33, 47],
  ]),
  ...armors('gloves', [
    ['leather', '皮手套', 1, 2],
    ['iron', '鐵製護手', 7, 4],
    ['chain', '鎖鏈手套', 13, 6],
    ['plate', '板甲護手', 20, 8],
    ['bone', '骨爪手套', 28, 11],
  ]),
  ...armors('boots', [
    ['leather', '皮靴', 1, 2],
    ['iron', '鐵靴', 7, 4],
    ['chain', '鎖鏈戰靴', 13, 6],
    ['plate', '板甲戰靴', 20, 8],
    ['shadow', '影行長靴', 28, 11],
  ]),
  ...jewelry('ring', [
    ['plain', '銅戒', 1],
    ['silver', '銀戒', 8],
    ['gold', '金戒', 16],
    ['rune', '符文戒', 26],
  ]),
  ...jewelry('amulet', [
    ['plain', '木製護符', 1],
    ['bone', '骨製護符', 8],
    ['silver', '銀護符', 16],
    ['rune', '符文護符', 26],
  ]),
];

export const potions: z.input<typeof PotionDefSchema>[] = [
  {
    id: 'potion.rejuvenation',
    name: '回復藥水',
    hpPct: 0.35,
    mpPct: 0.35,
    maxStack: 20,
    cooldown: 1,
  },
];
