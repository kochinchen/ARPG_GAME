import type { z } from 'zod';
import type { SkillDefSchema } from './schema/skill';

/**
 * 技能資料。新增技能只要在這裡加一筆，不需要改程式。
 * M4 先做 4 個：普通攻擊 + 各一個近戰 / 投射物 / 範圍技能。
 */
export const skills: z.input<typeof SkillDefSchema>[] = [
  {
    // 玩家與怪物共用；傷害來自武器（怪物為 EnemyDef.damage）
    id: 'basic.attack',
    name: '普通攻擊',
    targeting: 'enemy',
    useAttackSpeed: true,
    tags: ['attack', 'melee'],
    effects: [{ type: 'damage', element: 'physical', source: 'weapon' }],
  },
  {
    id: 'melee.bash',
    name: '重擊',
    tree: { category: 'melee', tier: 1, branch: 'A' },
    targeting: 'enemy',
    cost: { mana: 3, perRank: 0.5 },
    useAttackSpeed: true,
    tags: ['attack', 'melee'],
    effects: [{ type: 'damage', element: 'physical', source: 'weapon', multiplier: 1.8, perRankPct: 0.15 }],
  },
  {
    id: 'magic.fireball',
    name: '火球',
    tree: { category: 'magic', tier: 1, branch: 'A' },
    targeting: 'direction',
    cost: { mana: 5, perRank: 1 },
    castTime: 0.4,
    tags: ['spell', 'projectile', 'fire'],
    effects: [
      {
        type: 'projectile',
        speed: 10,
        radius: 0.25,
        range: 12,
        onHit: [
          {
            type: 'area',
            radius: 1.2,
            effects: [{ type: 'damage', element: 'fire', source: 'flat', base: [6, 10], perRankPct: 0.2 }],
          },
        ],
      },
    ],
  },
  {
    id: 'magic.frost_nova',
    name: '冰霜新星',
    tree: { category: 'magic', tier: 1, branch: 'B' },
    targeting: 'self',
    cost: { mana: 8, perRank: 1 },
    cooldown: 3,
    castTime: 0.3,
    tags: ['spell', 'area', 'cold'],
    effects: [
      {
        type: 'area',
        radius: 3,
        effects: [{ type: 'damage', element: 'cold', source: 'flat', base: [5, 8], perRankPct: 0.2 }],
      },
    ],
  },
];
