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

## 平衡硬規則（改動前必須先與設計者討論）

- 吸血 / 吸魔（含「回復造成傷害的一部分」）：技能最高 +0.5%（1～5 級 0.1%～0.5%），其他每一個來源（詞綴、傳奇 / 神話屬性、條件效果）最高 +0.3%；例外：「暴擊時回復傷害的一部分」最高 +0.5%（鼓勵提升暴擊率）。近戰的吸血倍率（1.3 倍）與多個來源累加不受限（設計者同意）。上限在 `STEAL_CAP`（`src/data/balance.ts`），由 `tests/data/StealCap.test.ts` 把關。新版本也受此限制；要往上調，先提出理由並與設計者討論，同意後才能改。

## 指令

- `npm run dev`：開發伺服器（http://localhost:5173）；角色樣態預覽 http://localhost:5173/viewer.html；Three.js 畫面試驗（與現在的畫法並排比較，`?monster=lava_behemoth` 換怪物）http://localhost:5173/viewer-three.html；GPU 蒙皮比對（同一個女主角用 CPU 算頂點與 GPU 蒙皮各畫一次，逐像素比較，並附浮點誤差的對照組）http://localhost:5173/skin-compare.html；女主角 3D 構面模型（骨架 → 構面體積，自由視角，`src/tools/heroine3d/`；造型依 `女主角設計圖/` 的轉面圖，「T 字」動作可對照）http://localhost:5173/heroine-3d.html
- `npm run art:heroine`：把女主角 3D 構面模型連骨架交給 Blender，輸出 `art/heroine/heroine.blend`（可編輯）與 `heroine.glb`；會覆蓋 Blender 裡改過的版本（舊檔先備份成 `*.bak-時間`）。之後可再跑 Blender 修整腳本（劍分開、身體加密成較密的三角構面；只能對剛產生的檔案跑一次）：`/Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine.blend --python scripts/heroine_refine.py -- art/heroine`。在 Blender 改完後匯出 glTF 到 `art/heroine/heroine.glb`，heroine-3d.html 的「比較」可並排看
- AI 版女主角：設計圖四視圖（`art/heroine/multiview/`）用微軟 TRELLIS 生成的模型放在 `art/heroine/ai/`，接上同一副骨架：`/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/heroine_ai.py -- art/heroine/ai/trellis-1.glb art/heroine` → `art/heroine/heroine-ai.blend` 與 `.glb`（heroine-3d.html 的「AI 版」）。不使用中國公司的服務（Hunyuan、Tripo、Rodin 等）
- 遊戲裡的女主角就是 AI 版（`src/render/figure/HeroineAI.ts`，舊版保留為 `HEROINE_CLASSIC`）：改過 `heroine-ai.blend` 後執行 `/Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine-ai.blend --python scripts/heroine_ai_game.py -- src/render/figure/heroine/heroineAI.json` 更新遊戲資料，再 `npm run docs:models`、`npm run package`
- AI 版怪物（目前：蜘蛛女王，`art/monsters/spider_queen/`）：遊戲截圖 → ChatGPT 設計稿與四視圖（提示詞在該資料夾）→ Hugging Face TRELLIS（`trellis-community/TRELLIS` 多圖模式）→ `ai/trellis-1.glb`，再執行 `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/spider_queen_ai.py -- art/monsters/spider_queen src/render/figure/bosses/spiderQueenAI.json`（減面、骨架與權重、每骨頭一色的檢查圖 `ai/preview/bones-*.png`、可編輯的 `spider_queen-ai.blend`）；遊戲端 `SpiderQueenAI.ts`（舊版保留為 `SPIDER_QUEEN_CLASSIC`，動作共用 `spiderQueenPoses`）。改完執行 `npm run docs:models`
- `npm test`：單元測試
- `npm run lint`：型別檢查（含無 DOM 的 `tsconfig.logic.json`）+ 依賴方向檢查
- `npm run build`：正式版建置
- `npm run package`：可攜版遊戲包（單一 HTML + Windows / Mac 啟動檔 + 說明）→ `release/ARPG-遊戲包/` 與 `.zip`
- `npm run docs:models`：重新產生設計文件的怪物模型圖（每隻怪物旁邊站著女主角當比例尺）→ `release/設計文件/models/`
- `npm run docs:combos`：用遊戲的 Combo 判定重新產生組合技圖鑑 → `release/設計文件/組合技圖鑑.html`（頁面樣式在 `scripts/combo-doc.template.html`）
- `npm run docs:icons`：重新產生裝備圖鑑的物品圖示產生器（與遊戲背包相同的圖示）→ `release/設計文件/item-icons.js`；改到裝備資料或外觀時執行
- `npm run docs:cores`：重新產生裝備圖鑑的「熔核」頁（核種表、孔數、核階核色、費用、融合範例）並同步飛昇費用與光芒門檻 → `release/設計文件/裝備圖鑑.html`；改到熔核資料或 `balance.sockets` / `fusion` / `shop.ascend` / `gearAura` 時執行（圖示在 `npm run docs:icons`）
- `npm run docs:sim`：重新產生角色成長模擬用的遊戲邏輯（資料、Combo 判定、技能樹規則、武器允許矩陣）→ `release/設計文件/sim.js`；改到技能、平衡數值或規則時執行
- `npm run docs:pages`：把 `release/設計文件/` 複製到 `docs/design/`（GitHub Pages：https://kochinchen.github.io/ARPG_GAME/design/）

## 開發用快捷鍵（只在 `npm run dev` 有效）

- B：重置遊戲（有確認框；會刪除所有存檔）
- N：升一級
- M：在玩家周圍生成 3 個寶箱
- J：直接前往下一層（不需清怪）
- L：在玩家周圍掉落每種稀有度各一件裝備（檢查光柱、名稱、光芒）
- Shift + L：隨機掉落 5 件傳奇（橘）+ 5 件神話（紅）
- H：融合測試包（2 萬金幣、武器精華 200、防具精華 100、四把武器含一把傳奇斧、一件 2 孔頭盔），物品等級 = 目前樓層
- Shift + H：同上，物品等級 45（融出 T5 熔核；核階看投入裝備的平均物品等級，每 8 級一階、32 以上是 T5）
- G：切換 Three.js / Pixi 畫法（Three.js 是預設畫法：地板、角色與石砌的牆用 Three.js，主角的燭光是真的點光源、投射陰影；特效、文字、火把、機關仍是 Pixi；`src/render/three/ThreeWorld.ts`，光源參數在 `ThreeLighting.ts`，牆的石材在 `WallStones.ts`）。玩家可在選單關掉「立體光影」改用 Pixi；網址加 `?pixi` / `?three` 強制指定；顯示卡不支援 WebGL2 時自動用 Pixi
- F3：顯示 / 隱藏除錯資訊

## 流程

- 依 Milestone 順序開發（M0 → M9），每個 Milestone 完成 Acceptance 與 Test 才進下一個。
- `npm test` 與 `npm run lint`（含 dependency-cruiser）必須通過。
- 設計文件（Artifact 頁面）在 `release/設計文件/` 有本機版：怪物與樓層、裝備圖鑑、角色成長模擬、開發歷程、組合技圖鑑（連結見該資料夾的 `說明.txt`）。改到這些頁面的內容（怪物、樓層、魔王、裝備、成長數值、模型、開發進度）時，線上頁面與本機 HTML 都要一起更新；改到怪物或女主角模型時執行 `npm run docs:models`；改到技能、Combo 標籤或組合技規則時執行 `npm run docs:combos`，線上版用 `node scripts/render-combo-doc.mjs <檔案> --fragment` 產生後重新發布。`npm run package` 只會重建 `release/ARPG-遊戲包/`，不會動到 `release/設計文件/`。本機版更新後執行 `npm run docs:pages`，GitHub Pages 上的設計文件（`docs/design/`）才會跟著更新；遊戲本身的線上版是 `docs/index.html`（`npm run package` 後複製 `release/ARPG-遊戲包/ARPG.html`）。
