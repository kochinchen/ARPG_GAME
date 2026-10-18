import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** 角色成長模擬頁的遊戲邏輯（單一 IIFE：window.Sim） */
export default defineConfig({
  logLevel: 'warn',
  build: {
    outDir: fileURLToPath(new URL('../release/設計文件/', import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: fileURLToPath(new URL('./sim.entry.ts', import.meta.url)), name: 'SimLib', formats: ['iife'], fileName: () => 'sim.js' },
  },
});
