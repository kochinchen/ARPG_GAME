import type { z } from 'zod';
import type { AffixDefSchema } from './schema/item';

const ARMOR = ['helmet', 'armor', 'gloves', 'boots'] as const;
const JEWELRY = ['ring', 'amulet'] as const;

/** 物品詞綴（精英怪詞綴見 eliteAffixes.ts）。 */
export const affixes: z.input<typeof AffixDefSchema>[] = [
  { id: 'affix.sharp', name: '鋒利的', kind: 'item', stat: 'damageMin', value: [1, 3], minItemLevel: 1, weight: 10, slots: ['weapon'] },
  { id: 'affix.brutal', name: '殘暴的', kind: 'item', stat: 'damageMax', value: [2, 5], minItemLevel: 1, weight: 10, slots: ['weapon'] },
  { id: 'affix.sturdy', name: '堅固的', kind: 'item', stat: 'defense', value: [3, 8], minItemLevel: 1, weight: 10, slots: [...ARMOR] },
  { id: 'affix.vital', name: '活力的', kind: 'item', stat: 'maxHp', value: [5, 15], minItemLevel: 1, weight: 8 },
  { id: 'affix.mind', name: '睿智的', kind: 'item', stat: 'maxMana', value: [5, 12], minItemLevel: 1, weight: 8 },
  { id: 'affix.swift', name: '迅捷的', kind: 'item', stat: 'moveSpeed', modifier: 'increased', value: [0.05, 0.1], minItemLevel: 1, weight: 6, slots: ['boots'] },
  { id: 'affix.fervor', name: '狂熱的', kind: 'item', stat: 'attackSpeed', modifier: 'increased', value: [0.05, 0.15], minItemLevel: 1, weight: 6, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'affix.precise', name: '精準的', kind: 'item', stat: 'critChance', value: [0.02, 0.05], minItemLevel: 1, weight: 6, slots: ['weapon', ...JEWELRY] },
  { id: 'affix.flow', name: '湧泉的', kind: 'item', stat: 'manaRegen', value: [0.5, 1.5], minItemLevel: 1, weight: 6, slots: [...JEWELRY] },
];
