import type { z } from 'zod';
import type { EliteAffixDefSchema } from './schema/elite';

/** 精英怪詞綴。數值為精英本身的加成，另外還有 balance.elite 的共通強化（HP ×3 等）。 */
export const eliteAffixes: z.input<typeof EliteAffixDefSchema>[] = [
  { id: 'elite.mighty', name: '強壯的', modifiers: [{ stat: 'maxHp', kind: 'increased', value: 1 }], weight: 10 },
  {
    id: 'elite.swift',
    name: '迅捷的',
    modifiers: [
      { stat: 'moveSpeed', kind: 'increased', value: 0.35 },
      { stat: 'attackSpeed', kind: 'increased', value: 0.25 },
    ],
    weight: 8,
  },
  { id: 'elite.stoneskin', name: '石膚的', modifiers: [{ stat: 'damageReduction', value: 0.3 }], weight: 8 },
  { id: 'elite.berserk', name: '狂暴的', modifiers: [{ stat: 'damageBonus', value: 0.4 }], weight: 8 },
  // 吸血：打中玩家時回血，拖久了很難打死
  { id: 'elite.vampiric', name: '吸血的', modifiers: [{ stat: 'lifeSteal', value: 0.25 }], minFloor: 6, weight: 6 },
];
