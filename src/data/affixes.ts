import type { z } from 'zod';
import type { AffixDefSchema } from './schema/item';

const ARMOR = ['helmet', 'armor', 'gloves', 'boots'] as const;
const JEWELRY = ['ring', 'amulet'] as const;
/** 防具與飾品（抗性、藥水效果） */
const DEFENSIVE = [...ARMOR, ...JEWELRY] as const;

/**
 * 成長率（growth）：每提高一個階級（每 10 層）數值增加的比例。
 * 固定值類（傷害、防禦、生命）成長快；百分比類成長慢，避免深層的紅裝數值破表。
 */
const FLAT = 0.5;
const PERCENT = 0.15;
const BONUS = 0.25;

/** 物品詞綴（精英怪詞綴見 eliteAffixes.ts）。value 為 T1、稀有度倍率 100% 時的擲骰範圍。 */
export const affixes: z.input<typeof AffixDefSchema>[] = [
  // ── 攻擊 ──
  { id: 'affix.sharp', name: '鋒利的', kind: 'item', stat: 'damageMin', value: [1, 3], minItemLevel: 1, weight: 10, growth: FLAT, slots: ['weapon'] },
  { id: 'affix.brutal', name: '殘暴的', kind: 'item', stat: 'damageMax', value: [2, 5], minItemLevel: 1, weight: 10, growth: FLAT, slots: ['weapon'] },
  { id: 'affix.fervor', name: '狂熱的', kind: 'item', stat: 'attackSpeed', modifier: 'increased', value: [0.05, 0.15], minItemLevel: 1, weight: 6, growth: PERCENT, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'affix.precise', name: '精準的', kind: 'item', stat: 'critChance', value: [0.02, 0.05], minItemLevel: 1, weight: 6, growth: PERCENT, slots: ['weapon', ...JEWELRY] },
  { id: 'affix.arcane', name: '奧術的', kind: 'item', stat: 'spellPower', value: [2, 6], minItemLevel: 1, weight: 7, growth: FLAT, slots: ['weapon', 'amulet', 'helmet'] },
  { id: 'affix.warrior', name: '戰士的', kind: 'item', stat: 'meleeDamageBonus', value: [0.04, 0.1], minItemLevel: 3, weight: 6, growth: BONUS, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'affix.hunter', name: '獵手的', kind: 'item', stat: 'rangedDamageBonus', value: [0.04, 0.1], minItemLevel: 3, weight: 6, growth: BONUS, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'affix.mystic', name: '秘法的', kind: 'item', stat: 'spellDamageBonus', value: [0.04, 0.1], minItemLevel: 3, weight: 6, growth: BONUS, slots: ['weapon', 'helmet', 'amulet'] },
  { id: 'affix.focus', name: '專注的', kind: 'item', stat: 'castSpeed', value: [0.04, 0.1], minItemLevel: 3, weight: 5, growth: PERCENT, slots: ['weapon', 'gloves', 'amulet'] },
  { id: 'affix.vampiric', name: '吸血的', kind: 'item', stat: 'lifeSteal', value: [0.01, 0.03], minItemLevel: 6, weight: 4, growth: PERCENT, slots: ['weapon', 'ring'] },
  // 元素附加傷害：每次命中額外造成該次傷害一定比例的元素傷害
  { id: 'affix.burning', name: '灼熱的', kind: 'item', stat: 'fireDamagePct', value: [0.05, 0.1], minItemLevel: 5, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'affix.frozen', name: '寒霜的', kind: 'item', stat: 'coldDamagePct', value: [0.05, 0.1], minItemLevel: 5, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'affix.thunder', name: '雷鳴的', kind: 'item', stat: 'lightningDamagePct', value: [0.05, 0.1], minItemLevel: 5, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'affix.venom', name: '劇毒的', kind: 'item', stat: 'poisonDamagePct', value: [0.05, 0.1], minItemLevel: 5, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },

  // ── 生存 ──
  { id: 'affix.sturdy', name: '堅固的', kind: 'item', stat: 'defense', value: [3, 8], minItemLevel: 1, weight: 10, growth: FLAT, slots: [...ARMOR] },
  { id: 'affix.vital', name: '活力的', kind: 'item', stat: 'maxHp', value: [5, 15], minItemLevel: 1, weight: 8, growth: FLAT },
  { id: 'affix.mind', name: '睿智的', kind: 'item', stat: 'maxMana', value: [5, 12], minItemLevel: 1, weight: 8, growth: FLAT },
  { id: 'affix.flow', name: '湧泉的', kind: 'item', stat: 'manaRegen', value: [0.5, 1.5], minItemLevel: 1, weight: 6, growth: 0.3, slots: [...JEWELRY] },
  { id: 'affix.warded', name: '守護的', kind: 'item', stat: 'damageReduction', value: [0.02, 0.05], minItemLevel: 6, weight: 4, growth: PERCENT, slots: ['armor', 'helmet', 'amulet'] },
  { id: 'affix.regen', name: '再生的', kind: 'item', stat: 'hpRegenPct', value: [0.003, 0.006], minItemLevel: 3, weight: 5, growth: PERCENT, slots: ['armor', 'helmet', ...JEWELRY] },
  { id: 'affix.nimble', name: '靈巧的', kind: 'item', stat: 'dodgeChance', value: [0.02, 0.05], minItemLevel: 3, weight: 5, growth: PERCENT, slots: ['armor', 'gloves', 'boots'] },
  { id: 'affix.thorned', name: '荊棘的', kind: 'item', stat: 'thorns', value: [2, 6], minItemLevel: 1, weight: 5, growth: 0.6, slots: [...ARMOR] },
  { id: 'affix.alchemy', name: '煉金的', kind: 'item', stat: 'potionEffect', value: [0.08, 0.2], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['armor', 'boots', ...JEWELRY] },
  { id: 'affix.fireproof', name: '抗火的', kind: 'item', stat: 'fireResist', value: [0.05, 0.12], minItemLevel: 1, weight: 5, growth: PERCENT, slots: [...DEFENSIVE] },
  { id: 'affix.coldproof', name: '抗寒的', kind: 'item', stat: 'coldResist', value: [0.05, 0.12], minItemLevel: 1, weight: 5, growth: PERCENT, slots: [...DEFENSIVE] },
  { id: 'affix.grounded', name: '絕緣的', kind: 'item', stat: 'lightningResist', value: [0.05, 0.12], minItemLevel: 1, weight: 5, growth: PERCENT, slots: [...DEFENSIVE] },
  { id: 'affix.antidote', name: '抗毒的', kind: 'item', stat: 'poisonResist', value: [0.05, 0.12], minItemLevel: 1, weight: 5, growth: PERCENT, slots: [...DEFENSIVE] },

  // ── 控制抗性（上限 balance.combat.maxControlResist）──
  { id: 'affix.unhindered', name: '自在的', kind: 'item', stat: 'slowResist', value: [0.08, 0.2], minItemLevel: 3, weight: 5, growth: PERCENT, slots: ['boots', 'gloves', 'amulet'] },
  { id: 'affix.steadfast', name: '穩健的', kind: 'item', stat: 'knockbackResist', value: [0.1, 0.25], minItemLevel: 3, weight: 5, growth: PERCENT, slots: ['armor', 'boots', 'ring'] },
  { id: 'affix.lucid', name: '清醒的', kind: 'item', stat: 'stunResist', value: [0.08, 0.2], minItemLevel: 6, weight: 5, growth: PERCENT, slots: ['helmet', 'armor', 'amulet'] },

  // ── 移動 ──
  { id: 'affix.swift', name: '迅捷的', kind: 'item', stat: 'moveSpeed', modifier: 'increased', value: [0.05, 0.1], minItemLevel: 1, weight: 6, growth: PERCENT, slots: ['boots'] },

  // ═══════════════ 強屬性（紫 1 條、橘 2 條、紅 3 條）═══════════════
  // 改變 Build 的能力；依部位分池：武器偏攻擊、防具偏防禦、飾品攻守與資源混合。
  // 數值同樣套用階級成長與稀有度倍率（紫 ×1.2～1.5），T1 紫裝約為規劃的數值。
  // 攻擊
  { id: 'strong.crit', name: '致命', kind: 'strong', stat: 'critChance', value: [0.06, 0.08], minItemLevel: 1, weight: 5, growth: PERCENT, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.crit_damage', name: '毀滅', kind: 'strong', stat: 'critDamageBonus', value: [0.22, 0.3], minItemLevel: 1, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.haste', name: '狂風', kind: 'strong', stat: 'attackSpeed', modifier: 'increased', value: [0.12, 0.16], minItemLevel: 1, weight: 5, growth: PERCENT, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'strong.melee', name: '戰神', kind: 'strong', stat: 'meleeDamageBonus', value: [0.18, 0.24], minItemLevel: 1, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', 'helmet', ...JEWELRY] },
  { id: 'strong.ranged', name: '神射', kind: 'strong', stat: 'rangedDamageBonus', value: [0.18, 0.24], minItemLevel: 1, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', 'helmet', ...JEWELRY] },
  { id: 'strong.magic', name: '大法師', kind: 'strong', stat: 'spellDamageBonus', value: [0.18, 0.24], minItemLevel: 1, weight: 5, growth: BONUS, slots: ['weapon', 'gloves', 'helmet', ...JEWELRY] },
  { id: 'strong.fire', name: '烈焰', kind: 'strong', stat: 'fireDamagePct', value: [0.16, 0.22], minItemLevel: 1, weight: 4, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.cold', name: '寒霜', kind: 'strong', stat: 'coldDamagePct', value: [0.16, 0.22], minItemLevel: 1, weight: 4, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.lightning', name: '雷霆', kind: 'strong', stat: 'lightningDamagePct', value: [0.16, 0.22], minItemLevel: 1, weight: 4, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.poison', name: '劇毒', kind: 'strong', stat: 'poisonDamagePct', value: [0.16, 0.22], minItemLevel: 1, weight: 4, growth: BONUS, slots: ['weapon', 'gloves', ...JEWELRY] },
  { id: 'strong.bloodthirst', name: '嗜血', kind: 'strong', stat: 'lifeSteal', value: [0.035, 0.05], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['weapon', 'gloves', 'ring'] },
  // 防禦
  { id: 'strong.bulwark', name: '堅壁', kind: 'strong', stat: 'damageReduction', value: [0.05, 0.07], minItemLevel: 1, weight: 5, growth: PERCENT, slots: ['armor', 'helmet', 'boots', 'amulet'] },
  { id: 'strong.giant', name: '巨人', kind: 'strong', stat: 'maxHp', modifier: 'increased', value: [0.22, 0.28], minItemLevel: 1, weight: 5, growth: PERCENT, slots: ['armor', 'helmet', 'boots', ...JEWELRY] },
  { id: 'strong.fortress', name: '要塞', kind: 'strong', stat: 'defense', modifier: 'increased', value: [0.2, 0.26], minItemLevel: 1, weight: 5, growth: PERCENT, slots: [...ARMOR] },
  { id: 'strong.undying', name: '不朽', kind: 'strong', stat: 'hpRegenPct', value: [0.008, 0.012], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['armor', 'helmet', 'amulet'] },
  { id: 'strong.phantom', name: '幻影', kind: 'strong', stat: 'dodgeChance', value: [0.07, 0.1], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['armor', 'gloves', 'boots'] },
  { id: 'strong.ashen', name: '灰燼', kind: 'strong', stat: 'fireResist', value: [0.2, 0.28], minItemLevel: 1, weight: 3, growth: PERCENT, slots: ['armor', 'helmet', 'boots'] },
  // 資源與移動
  { id: 'strong.efficiency', name: '節能', kind: 'strong', stat: 'manaCostReduction', value: [0.12, 0.16], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['weapon', 'helmet', ...JEWELRY] },
  { id: 'strong.soul_drain', name: '汲魂', kind: 'strong', stat: 'manaSteal', value: [0.03, 0.04], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['weapon', 'ring'] },
  { id: 'strong.sage', name: '賢者', kind: 'strong', stat: 'maxMana', modifier: 'increased', value: [0.2, 0.25], minItemLevel: 1, weight: 4, growth: PERCENT, slots: ['armor', 'helmet', ...JEWELRY] },
  { id: 'strong.windwalk', name: '疾行', kind: 'strong', stat: 'moveSpeed', modifier: 'increased', value: [0.12, 0.16], minItemLevel: 1, weight: 5, growth: PERCENT, slots: ['boots'] },
  // 控制抗性：一條強屬性約等於兩條一般詞綴；T5 紫裝約 45%～65%（上限 75%）
  { id: 'strong.unbound', name: '無羈', kind: 'strong', stat: 'slowResist', value: [0.25, 0.35], minItemLevel: 1, weight: 3, growth: PERCENT, slots: ['boots', 'amulet'] },
  { id: 'strong.bedrock', name: '山岳', kind: 'strong', stat: 'knockbackResist', value: [0.3, 0.4], minItemLevel: 1, weight: 3, growth: PERCENT, slots: ['armor', 'boots'] },
  { id: 'strong.clarity', name: '明心', kind: 'strong', stat: 'stunResist', value: [0.25, 0.35], minItemLevel: 1, weight: 3, growth: PERCENT, slots: ['helmet', 'amulet'] },
];
