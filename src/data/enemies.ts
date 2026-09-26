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
];
