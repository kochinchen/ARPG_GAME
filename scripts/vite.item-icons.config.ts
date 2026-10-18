import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** 裝備圖鑑的圖示產生器（單一 IIFE：window.ItemIcons.baseIcon / uniqueIcon / gemIcon） */
export default defineConfig({
  logLevel: 'warn',
  build: {
    outDir: fileURLToPath(new URL('../release/設計文件/', import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: fileURLToPath(new URL('./item-icons.entry.ts', import.meta.url)), name: 'ItemIcons', formats: ['iife'], fileName: () => 'item-icons.js' },
  },
});
