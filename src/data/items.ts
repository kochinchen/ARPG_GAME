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

/**
 * 武器與防具都分 8 階（等級需求 1 / 6 / 12 / 18 / 24 / 30 / 36 / 42），每階數值約 ×1.4～1.5，
 * 名稱也跟著進階（鐵製 → 騎士 → 符文 → 黑鋼 → 血紋 → 古代 → 深淵）。
 * 商人的「飛昇」可以把裝備的基底換成同種類的下一階。
 */
const TIER_LEVELS = [1, 6, 12, 18, 24, 30, 36, 42] as const;

/** [ID, 名稱, 最小傷害, 最大傷害, 其他屬性, 舊版 ID] */
type WeaponRow = [string, string, number, number, Record<string, number>?, string[]?];
const weapons = (type: 'sword' | 'axe' | 'bow' | 'staff', implicit: Record<string, number>, rows: WeaponRow[]): BaseInput[] =>
  rows.map(([id, name, damageMin, damageMax, extra, aliases], i) => ({
    id: `weapon.${id}`,
    name,
    slot: 'weapon',
    weaponType: type,
    tier: i + 1,
    levelReq: TIER_LEVELS[i]!,
    baseStats: { damageMin, damageMax, ...implicit, ...extra },
    aliases: (aliases ?? []).map((a) => `weapon.${a}`),
  }));

/** [ID, 名稱, 防禦, 舊版 ID] */
const armors = (slot: 'helmet' | 'armor' | 'gloves' | 'boots', rows: [string, string, number, string[]?][]): BaseInput[] =>
  rows.map(([id, name, defense, aliases], i) => ({
    id: `${slot}.${id}`,
    name,
    slot,
    tier: i + 1,
    levelReq: TIER_LEVELS[i]!,
    baseStats: { defense },
    aliases: (aliases ?? []).map((a) => `${slot}.${a}`),
  }));

/** 飾品：沒有基礎屬性，階級越高名稱越好（詞綴依物品等級） */
const jewelry = (slot: 'ring' | 'amulet', rows: [string, string, number][]): BaseInput[] => rows.map(([id, name, levelReq]) => ({ id: `${slot}.${id}`, name, slot, levelReq }));

/** 裝備基底。稀有度、詞綴與名稱由 ItemGenerator / ItemNamer 產生。 */
export const items: BaseInput[] = [
  // 劍：平衡（近戰 + 暴擊）
  ...weapons('sword', SWORD, [
    ['short_sword', '短劍', 3, 7],
    ['iron_longsword', '鐵製長劍', 6, 13, {}, ['long_sword', 'broad_sword']],
    ['knight_longsword', '騎士長劍', 10, 19, {}, ['war_sword']],
    ['rune_sword', '符文戰劍', 15, 27, {}, ['scimitar', 'heavy_sword']],
    ['blacksteel_sword', '黑鋼重劍', 21, 35, {}, ['bone_blade']],
    ['bloodmark_blade', '血紋之刃', 28, 45, {}, ['rift_blade']],
    ['ancient_king_sword', '古代王者劍', 36, 57, {}, ['knight_sword']],
    ['abyss_soul_sword', '深淵裂魂劍', 46, 72, {}, ['ancient_sword']],
  ]),
  // 斧：傷害最高、浮動大（沒有暴擊加成）
  ...weapons('axe', AXE, [
    ['hand_axe', '手斧', 3, 8],
    ['iron_war_axe', '鐵製戰斧', 5, 15, {}, ['war_axe']],
    ['moon_axe', '月刃斧', 9, 22],
    ['bonesplitter', '裂骨斧', 13, 31],
    ['blacksteel_axe', '黑鋼巨斧', 18, 40, {}, ['double_axe', 'great_axe']],
    ['bloodmark_cleaver', '血紋屠斧', 25, 51, {}, ['hook_axe']],
    ['ancient_fang_axe', '古代獸牙斧', 32, 64, {}, ['fang_axe']],
    ['abyss_devourer', '深淵噬魂斧', 41, 81],
  ]),
  // 弓：略低於劍（遠程安全）
  ...weapons('bow', BOW, [
    ['short_bow', '短弓', 3, 6],
    ['hunting_bow', '獵弓', 5, 12],
    ['long_bow', '長弓', 9, 17],
    ['rune_bow', '符文戰弓', 13, 24, {}, ['war_bow']],
    ['bone_bow', '複合骨弓', 19, 31, {}, ['composite_bow']],
    ['bloodmark_bow', '血紋刺弓', 25, 40, {}, ['thorn_bow']],
    ['ancient_eagle_bow', '古代鷹弓', 32, 51],
    ['abyss_bow', '深淵穿雲弓', 41, 64],
  ]),
  // 法杖：武器傷害低、法術強度高
  ...weapons('staff', STAFF, [
    ['short_staff', '短杖', 2, 4, { spellPower: 4 }],
    ['staff', '橡木法杖', 3, 6, { spellPower: 7 }],
    ['crystal_staff', '水晶杖', 5, 9, { spellPower: 11 }, ['battle_staff']],
    ['rune_staff', '符文杖', 7, 13, { spellPower: 16 }],
    ['bone_staff', '黑鋼骨杖', 10, 17, { spellPower: 22 }],
    ['elemental_staff', '血紋元素杖', 13, 22, { spellPower: 29 }],
    ['ancient_staff', '古代賢者杖', 17, 28, { spellPower: 37 }],
    ['abyss_staff', '深淵虛空杖', 22, 35, { spellPower: 47 }],
  ]),
  ...armors('helmet', [
    ['cap', '皮帽', 3],
    ['iron_helm', '鐵盔', 5],
    ['knight_helm', '騎士頭盔', 8, ['horned_helm']],
    ['rune_helm', '符文戰盔', 12, ['bone_helm']],
    ['blacksteel_helm', '黑鋼角盔', 17, ['war_helm']],
    ['bloodmark_helm', '血紋骨盔', 24],
    ['ancient_crown', '古代王冠盔', 33],
    ['abyss_helm', '深淵魔角盔', 45],
  ]),
  ...armors('armor', [
    ['quilted', '布甲', 8],
    ['chain', '鐵製鎖甲', 12, ['leather']],
    ['plate', '騎士板甲', 18, ['iron']],
    ['rune', '符文戰甲', 26],
    ['blacksteel', '黑鋼重甲', 37],
    ['bone', '血紋獸骨甲', 52],
    ['ancient', '古代王者鎧', 72, ['deep_rock']],
    ['abyss', '深淵甲殼鎧', 98],
  ]),
  ...armors('gloves', [
    ['leather', '皮手套', 2],
    ['iron', '鐵製護手', 4],
    ['chain', '騎士手甲', 6],
    ['plate', '符文護手', 9],
    ['blacksteel', '黑鋼爪手', 13],
    ['bone', '血紋骨爪', 18],
    ['ancient', '古代王者護手', 25],
    ['abyss', '深淵魔爪', 34],
  ]),
  ...armors('boots', [
    ['leather', '皮靴', 2],
    ['iron', '鐵靴', 4],
    ['chain', '騎士戰靴', 6],
    ['plate', '符文戰靴', 9],
    ['blacksteel', '黑鋼重靴', 13],
    ['shadow', '血紋影靴', 18],
    ['ancient', '古代王者靴', 25],
    ['abyss', '深淵踏界靴', 34],
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
    maxCarry: 20,
    cooldown: 1,
  },
];
