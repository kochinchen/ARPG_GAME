import { defineConfig } from 'vitest/config';

/** 難度模擬（npm run balance）：無畫面跑機器人玩家，產生 release/設計文件/難度報告.html */
export default defineConfig({
  test: {
    include: ['tests/balance/**/*.balance.ts'],
    environment: 'node',
    testTimeout: 3_600_000,
  },
});
