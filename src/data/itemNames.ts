import type { StatId } from './schema/common';
import type { EquipSlot, WeaponType } from './schema/item';

/**
 * 裝備命名用的名稱池（ItemNamer 依物品 uid 固定挑選，不存檔）：
 * - 普通（白）：樸素的材質 / 品質詞 + 基底名稱，例如「鐵製短劍」「破舊手斧」
 * - 魔法（藍）：第一個詞綴的名稱 + 基底，例如「鋒利的短劍」
 * - 稀有（黃）：依主要詞綴決定主題前綴 + 基底，例如「裂骨戰斧」「霜牙・獵弓」；飾品用神秘名稱
 * - 史詩（紫）：特殊名稱，例如「夜行者」，下方再顯示「史詩 短劍」
 * - 傳奇（橘）/ 神話（紅）：全部人工命名（第二批），不隨機產生
 */

/** 普通裝備的品質詞（依部位；空字串 = 只顯示基底名稱） */
export const COMMON_WORDS: Record<WeaponType | Exclude<EquipSlot, 'weapon'>, readonly string[]> = {
  sword: ['', '', '鐵製', '破舊', '生鏽的', '粗製'],
  axe: ['', '', '鐵製', '破舊', '缺口的', '粗製'],
  bow: ['', '', '木製', '粗製', '破舊', '獵人的'],
  staff: ['', '', '木製', '粗製', '破舊', '橡木'],
  helmet: ['', '', '破舊', '粗製', '凹陷的'],
  armor: ['', '', '破舊', '粗製', '補丁的'],
  gloves: ['', '', '破舊', '粗製', '磨損的'],
  boots: ['', '', '破舊', '粗製', '磨損的'],
  ring: ['', '', '黯淡的', '樸素的'],
  amulet: ['', '', '黯淡的', '樸素的'],
};

/** 稀有裝備的主題前綴：依主要詞綴的屬性挑選，名稱會反映裝備的路線 */
export const RARE_PREFIXES: Partial<Record<StatId, readonly string[]>> = {
  damageMin: ['裂骨', '血痕', '鋒刃', '斷鋼'],
  damageMax: ['裂骨', '碎顱', '血痕', '裂地'],
  meleeDamageBonus: ['狂戰', '碎骨', '血怒', '裂山'],
  rangedDamageBonus: ['鷹眼', '霜牙', '疾矢', '獵影'],
  spellDamageBonus: ['星火', '烈焰', '寒霜', '雷鳴'],
  spellPower: ['星火', '秘紋', '烈焰', '寒霜'],
  castSpeed: ['星火', '流光', '迅咒'],
  defense: ['鐵壁', '黑鐵', '深岩', '守誓'],
  damageReduction: ['鐵壁', '不屈', '深岩'],
  maxHp: ['血誓', '不屈', '巨人', '獸心'],
  maxMana: ['星輝', '寒霜', '秘紋', '深淵'],
  manaRegen: ['深淵', '星輝', '湧泉'],
  attackSpeed: ['迅捷', '風暴', '疾風'],
  moveSpeed: ['風行', '影行', '疾風'],
  critChance: ['幽影', '霜牙', '致命'],
  lifeSteal: ['血牙', '吸魂', '血痕'],
  fireDamagePct: ['烈焰', '灼熱', '熔火'],
  coldDamagePct: ['寒霜', '霜牙', '冰脈'],
  lightningDamagePct: ['雷鳴', '風暴', '電光'],
  poisonDamagePct: ['毒牙', '腐蝕', '瘴氣'],
  fireResist: ['灰燼', '炎盾', '熔岩'],
  coldResist: ['冬眠', '霜盾', '極地'],
  lightningResist: ['絕緣', '避雷', '靜默'],
  poisonResist: ['淨化', '解毒', '聖泉'],
  hpRegenPct: ['再生', '生機', '不死'],
  dodgeChance: ['影行', '幻步', '靈巧'],
  thorns: ['荊棘', '尖刺', '棘甲'],
  potionEffect: ['煉金', '藥師', '秘藥'],
};
/** 沒有對應主題時使用 */
export const RARE_FALLBACK_PREFIXES: readonly string[] = ['幽影', '深淵', '黑鐵', '風暴', '烈焰', '寒霜'];

/** 稀有飾品：直接使用神秘的名稱 */
export const RARE_JEWELRY_NAMES: Record<'ring' | 'amulet', readonly string[]> = {
  ring: ['火紋戒', '寒晶戒', '裂骨指環', '風暴印記', '深淵之環', '虛空戒指', '血誓指環', '星輝戒'],
  amulet: ['獵者護符', '血牙護符', '星火之心', '霜月護符', '深淵之眼', '遠古核心', '狼首墜飾', '黑曜護符'],
};

/**
 * 史詩裝備的特殊名稱與它的強屬性：名稱決定那一條強屬性，讓名字和最強的屬性對得上
 * （例如「霜脈」→ 寒霜附加傷害、「血握」→ 嗜血、「灰燼之履」→ 火焰抗性）。
 */
export const EPIC_NAMES: Record<WeaponType | Exclude<EquipSlot, 'weapon'>, readonly (readonly [name: string, affixId: string])[]> = {
  sword: [
    ['夜行者', 'strong.crit'],
    ['寒月', 'strong.cold'],
    ['裂風', 'strong.haste'],
    ['斷魂', 'strong.bloodthirst'],
    ['霜脈', 'strong.cold'],
    ['灼痕', 'strong.fire'],
    ['銀誓', 'strong.melee'],
    ['無名者', 'strong.crit_damage'],
  ],
  axe: [
    ['碎骨者', 'strong.crit_damage'],
    ['黑牙', 'strong.poison'],
    ['裂顱', 'strong.melee'],
    ['血月', 'strong.bloodthirst'],
    ['狼王', 'strong.haste'],
    ['斷山', 'strong.melee'],
  ],
  bow: [
    ['追影', 'strong.ranged'],
    ['霜牙', 'strong.cold'],
    ['鷹之淚', 'strong.crit'],
    ['寂靜', 'strong.poison'],
    ['暮光', 'strong.lightning'],
    ['穿雲', 'strong.haste'],
  ],
  staff: [
    ['灼痕', 'strong.fire'],
    ['星語', 'strong.magic'],
    ['寒脈', 'strong.cold'],
    ['雷心', 'strong.lightning'],
    ['餘燼', 'strong.fire'],
    ['虛空低語', 'strong.efficiency'],
  ],
  helmet: [
    ['獸王之顱', 'strong.giant'],
    ['守夜人', 'strong.bulwark'],
    ['鐵誓頭冠', 'strong.fortress'],
    ['暗月冠', 'strong.sage'],
  ],
  armor: [
    ['不屈壁壘', 'strong.bulwark'],
    ['黑曜戰衣', 'strong.fortress'],
    ['血誓鎧甲', 'strong.undying'],
    ['夜幕', 'strong.phantom'],
  ],
  gloves: [
    ['鐵爪', 'strong.melee'],
    ['血握', 'strong.bloodthirst'],
    ['影觸', 'strong.crit'],
    ['霜指', 'strong.cold'],
  ],
  boots: [
    ['風行者', 'strong.windwalk'],
    ['無聲步', 'strong.phantom'],
    ['灰燼之履', 'strong.ashen'],
    ['疾影', 'strong.windwalk'],
  ],
  ring: [
    ['深淵之環', 'strong.sage'],
    ['虛空之眼', 'strong.crit'],
    ['燃誓', 'strong.fire'],
    ['霜冠', 'strong.cold'],
  ],
  amulet: [
    ['星火之心', 'strong.magic'],
    ['遠古核心', 'strong.giant'],
    ['亡者之淚', 'strong.undying'],
    ['夜鴉', 'strong.crit_damage'],
  ],
};
