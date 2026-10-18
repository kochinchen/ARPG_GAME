import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [vue()],
  // 標題畫面顯示的版本（package.json 的 version）
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 隨機地牢較大：建立樓層世界約 0.1～0.2 秒，跑多個樓層的測試需要較長的時間
    testTimeout: 30000,
  },
});
