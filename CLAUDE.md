# ARPG Project — Claude 守則

完整架構見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。修改程式前先確認不違反以下規則。

## 技術

- TypeScript 5.9 + Vite + PixiJS 8（遊戲畫面）+ Vue 3（面板 UI）+ Zod 4（資料驗證）+ Vitest
- TypeScript 暫時固定在 5.x：vue-tsc 尚不支援 TypeScript 7
- 邏輯固定步長 60 Hz；所有隨機走 `core/Rng`（Seeded）

## 架構規則

1. `src/game/**` 禁止 import DOM、PixiJS、Vue、`render/`、`ui/`、`input/`、`save/`。
2. 遊戲邏輯只用 World 座標；等角投影只存在於 `render/` 與 `core/math/IsoProjection`。
3. Input 與 UI 只能送 Command 到 `CommandQueue`，不可直接修改遊戲狀態。
4. 所有傷害都經過 `DamagePipeline`。
5. 新技能 / 怪物 / 物品 / 詞綴 / 樓層應優先只改 `src/data/`，不新增專屬 Class。
6. 系統之間「一件事、多個反應」用 EventBus；需要回傳值就直接呼叫。
7. 存檔只存 ID / 數值 / 狀態，不存可推導資料；格式變動必須寫 Migration。
8. 不為「未來可能需要」建立抽象層；Interface 只用在 ARCHITECTURE.md 第 F 節列出的地方。

## 指令

- `npm run dev`：開發伺服器（http://localhost:5173）；角色樣態預覽 http://localhost:5173/viewer.html
- `npm test`：單元測試
- `npm run lint`：型別檢查（含無 DOM 的 `tsconfig.logic.json`）+ 依賴方向檢查
- `npm run build`：正式版建置
- `npm run package`：可攜版遊戲包（單一 HTML + Windows / Mac 啟動檔 + 說明）→ `release/ARPG-遊戲包/` 與 `.zip`
- `npm run docs:models`：重新產生設計文件的怪物模型圖（每隻怪物旁邊站著女主角當比例尺）→ `release/設計文件/models/`
- `npm run docs:combos`：用遊戲的 Combo 判定重新產生組合技圖鑑 → `release/設計文件/組合技圖鑑.html`（頁面樣式在 `scripts/combo-doc.template.html`）

## 開發用快捷鍵（只在 `npm run dev` 有效）

- B：重置遊戲（有確認框；會刪除所有存檔）
- N：升一級
- M：在玩家周圍生成 3 個寶箱
- J：直接前往下一層（不需清怪）
- L：在玩家周圍掉落每種稀有度各一件裝備（檢查光柱、名稱、光芒）
- Shift + L：隨機掉落 5 件傳奇（橘）+ 5 件神話（紅）
- F3：顯示 / 隱藏除錯資訊

## 流程

- 依 Milestone 順序開發（M0 → M9），每個 Milestone 完成 Acceptance 與 Test 才進下一個。
- `npm test` 與 `npm run lint`（含 dependency-cruiser）必須通過。
- 設計文件（Artifact 頁面）在 `release/設計文件/` 有本機版：怪物與樓層、裝備圖鑑、角色成長模擬、開發歷程、組合技圖鑑（連結見該資料夾的 `說明.txt`）。改到這些頁面的內容（怪物、樓層、魔王、裝備、成長數值、模型、開發進度）時，線上頁面與本機 HTML 都要一起更新；改到怪物或女主角模型時執行 `npm run docs:models`；改到技能、Combo 標籤或組合技規則時執行 `npm run docs:combos`，線上版用 `node scripts/render-combo-doc.mjs <檔案> --fragment` 產生後重新發布。`npm run package` 只會重建 `release/ARPG-遊戲包/`，不會動到 `release/設計文件/`。
