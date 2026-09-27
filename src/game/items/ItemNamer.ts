import { COMMON_WORDS, EPIC_NAMES, RARE_FALLBACK_PREFIXES, RARE_JEWELRY_NAMES, RARE_PREFIXES } from '../../data/itemNames';
import type { AffixDef, ItemBaseDef } from '../../data/schema/item';
import type { ItemInstance } from './ItemInstance';

/**
 * 依稀有度產生裝備名稱（純函式）。名稱由物品 uid 決定挑哪一個，同一件物品永遠同名，不需要存檔。
 * - 普通：品質詞 + 基底（「鐵製短劍」）
 * - 魔法：第一個詞綴 + 基底（「鋒利的短劍」）
 * - 稀有：主要詞綴的主題前綴 + 基底（「裂骨戰斧」「霜牙・獵弓」）；飾品用神秘名稱（「火紋戒」）
 * - 史詩：特殊名稱（「夜行者」）
 * - 傳奇 / 神話：人工命名（第二批）；尚未定義時顯示基底名稱
 */
export function nameItem(item: ItemInstance, base: ItemBaseDef, affixes: readonly AffixDef[]): string {
  const kind = base.weaponType ?? (base.slot === 'weapon' ? 'sword' : base.slot);
  const pick = <T>(list: readonly T[], salt: number): T => list[hash(item.uid, salt) % list.length]!;
  switch (item.rarity) {
    case 'normal':
      return `${pick(COMMON_WORDS[kind], 1)}${base.name}`;
    case 'magic':
      return affixes[0] ? `${affixes[0].name}${base.name}` : base.name;
    case 'rare': {
      if (base.slot === 'ring' || base.slot === 'amulet') return pick(RARE_JEWELRY_NAMES[base.slot], 2);
      const prefix = pick((affixes[0] && RARE_PREFIXES[affixes[0].stat]) ?? RARE_FALLBACK_PREFIXES, 3);
      return hash(item.uid, 4) % 3 === 0 ? `${prefix}・${base.name}` : `${prefix}${base.name}`;
    }
    case 'epic':
      return epicTheme(item.uid, base)[0];
    default:
      return base.name;
  }
}

/** 史詩裝備的名稱與主題詞綴（由 uid 決定；ItemGenerator 產生史詩時會確保帶有這條詞綴） */
export function epicTheme(uid: string, base: ItemBaseDef): readonly [name: string, affixId: string] {
  const list = EPIC_NAMES[base.weaponType ?? (base.slot === 'weapon' ? 'sword' : base.slot)];
  return list[hash(uid, 5) % list.length]!;
}

/** 字串雜湊（FNV-1a）加上 salt，讓不同用途的挑選互不相關 */
function hash(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
