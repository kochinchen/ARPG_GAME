import type { z } from 'zod';
import type { EnemyDefSchema } from './schema/enemy';

export const enemies: z.input<typeof EnemyDefSchema>[] = [
  {
    // 測試傷害用：不會移動、不會反擊，有一點防禦以驗證減傷
    id: 'enemy.training_dummy',
    name: '訓練木樁',
    hp: 60,
    damage: [0, 0],
    defense: 20,
    moveSpeed: 0,
    radius: 0.35,
    attackRange: 1,
    detectRange: 0,
    ai: 'none',
    xp: 0,
  },
  {
    id: 'enemy.skeleton',
    name: '骷髏戰士',
    hp: 30,
    damage: [2, 5],
    defense: 5,
    moveSpeed: 2.6,
    radius: 0.32,
    attackRange: 0.4,
    attackSpeed: 1,
    detectRange: 7,
    ai: 'melee',
    xp: 12,
  },
];
