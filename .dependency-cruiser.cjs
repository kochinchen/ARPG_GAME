/**
 * 依賴方向規則，對應 docs/ARCHITECTURE.md「Module Dependency Map」。
 * 違反時 `npm run lint:deps` 會失敗。
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-foundation',
      comment: 'core 不含遊戲知識，不可依賴任何其他模組。',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(?!core/)' },
    },
    {
      name: 'data-is-leaf',
      comment: 'data 只能依賴 core 與 zod。',
      severity: 'error',
      from: { path: '^src/data/' },
      to: { path: '^src/(?!(core|data)/)' },
    },
    {
      name: 'game-is-pure',
      comment: 'game 不可依賴外層（input / render / ui / save / audio）。',
      severity: 'error',
      from: { path: '^src/game/' },
      to: { path: '^src/(input|render|ui|save|audio)/' },
    },
    {
      name: 'logic-no-engine',
      comment: 'core / data / game 不可 import PixiJS 或 Vue。',
      severity: 'error',
      from: { path: '^src/(core|data|game)/' },
      to: { path: 'node_modules/(pixi\\.js|@pixi|vue|@vue)/' },
    },
    {
      name: 'input-sends-commands-only',
      comment: 'input 只能使用 game 的 Command 型別，不可呼叫遊戲系統。',
      severity: 'error',
      from: { path: '^src/input/' },
      to: { path: '^src/game/', pathNot: '^src/game/Commands\\.ts$' },
    },
    {
      name: 'ui-through-bridge',
      comment: 'Vue 元件只能透過 ui/bridge 讀取遊戲狀態；寫入一律送 Command。',
      severity: 'error',
      from: { path: '^src/ui/', pathNot: '^src/ui/bridge/' },
      to: { path: '^src/game/', pathNot: '^src/game/(Commands|GameEvents)\\.ts$' },
    },
    {
      name: 'save-below-ui',
      comment: 'save 只透過 SaveMapper 讀寫 game，不可依賴 ui / render / input。',
      severity: 'error',
      from: { path: '^src/save/' },
      to: { path: '^src/(ui|render|input)/' },
    },
    {
      name: 'render-read-only',
      comment: 'render 不可依賴 ui / save / input。',
      severity: 'error',
      from: { path: '^src/render/' },
      to: { path: '^src/(ui|save|input)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.vue', '.js'] },
  },
};
