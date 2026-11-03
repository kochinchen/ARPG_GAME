import { defineConfig } from 'vite';

/** 工具頁的單一 HTML（npm run package:sim）：與可攜版相同，相對路徑、所有程式合併成一個檔案；TOOL_PAGE = 要打包的頁面 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'release/.build-sim',
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: {
      input: process.env.TOOL_PAGE ?? 'boss-sim.html',
      output: { codeSplitting: false },
    },
  },
});
