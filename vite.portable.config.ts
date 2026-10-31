import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json' with { type: 'json' };

/**
 * 可攜版（整包帶著走）的建置：相對路徑、所有程式合併成一個檔案（不做 code splitting），
 * 之後由 scripts/package-portable.mjs 內嵌進單一 HTML（file:// 直接開啟即可遊玩）。
 */
export default defineConfig({
  plugins: [vue()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'release/.build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    // 過場影片的圖與聲音（src/ui/cutscene/media）也內嵌成 data: 網址：file:// 不能用 fetch 讀旁邊的檔案
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
