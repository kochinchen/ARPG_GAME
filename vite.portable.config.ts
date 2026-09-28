import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 可攜版（整包帶著走）的建置：相對路徑、所有程式合併成一個檔案（不做 code splitting），
 * 之後由 scripts/package-portable.mjs 內嵌進單一 HTML（file:// 直接開啟即可遊玩）。
 */
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'release/.build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
