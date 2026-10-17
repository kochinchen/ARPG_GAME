# Dungeon Adventure · 地牢冒險

一款 Diablo 風格的 2D 等角動作 RPG，直接在瀏覽器裡玩，不用安裝。

**▶ 線上遊玩：https://kochinchen.github.io/ARPG_GAME/**

📘 設計文件（怪物、裝備、成長模擬、組合技、開發歷程）：https://kochinchen.github.io/ARPG_GAME/design/

## 遊戲內容

- **35 層地牢**：地圖由種子隨機產生；每 5 層一位樓層魔王，第 30 層通關。之後是 31～35 層的極限挑戰，最後在王座廳對上隱藏的最終魔王。
- **近戰、遠程、魔法、輔助四條技能樹**：每類 4 階，學會 T4 後達成 Mastery。
- **Q / W / E 三段連段**：三個技能依序施放，符合規則就組成組合技，共 19 條規則（含 2 條秘密組合技）。
- **六種稀有度裝備**：白、藍、黃、紫、橘（傳奇 30 件）、紅（神話 20 件）。橘、紅裝備有專屬效果，例如分裂箭、小火球、疊層增益。
- **怪物**：20 多種一般怪物、精英怪詞綴、7 位多階段魔王；越深的樓層，怪物的生命、攻擊與技能範圍越強。
- **其他**：商人、賭博、拆解與飛昇；3 個存檔欄位，會自動存檔，也能匯出 / 匯入。

## 操作

| 按鍵 | 功能 |
| --- | --- |
| 左鍵 | 移動 / 攻擊（按住 Shift 原地攻擊） |
| 右鍵 | 施放目前的 Q / W / E 連段 |
| Q / W / E | 切換連段 |
| Space | 喝藥水 |
| I / C / T | 背包 / 角色 / 技能 |
| K / O | 怪物圖鑑 / 裝備圖鑑 |
| Tab | 地圖 |
| Esc | 選單（遊戲內有完整操作說明） |

iPad 等觸控裝置會自動顯示左側搖桿，以及右側的攻擊、招式、Q / W / E、藥水按鈕，攻擊時會自動瞄準最近的敵人。

建議使用 Chrome 或 Edge。存檔存在這台裝置的這個瀏覽器裡，換裝置前請先在選單「匯出存檔」。

## 開發

需要 Node.js。

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 單元測試
npm run lint       # 型別檢查 + 依賴方向檢查
npm run package    # 可攜版遊戲包（單一 HTML + Windows / Mac 啟動檔）
npm run docs:pages # 把設計文件複製到 docs/design/
```

技術：TypeScript、Vite、PixiJS 8（遊戲畫面）、Vue 3（介面）、Zod（資料驗證）、Vitest。

- 遊戲邏輯在 `src/game/`，以固定 60 Hz 更新，所有隨機都使用固定種子，而且不依賴畫面。
- 怪物、技能、物品、詞綴、樓層等內容都寫在 `src/data/`；新增內容通常只需要改資料。
- 架構與規則見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[CLAUDE.md](CLAUDE.md)；存檔、組合技、終局規格在 `docs/` 裡。

### GitHub Pages

`docs/` 資料夾就是線上版：

- `docs/index.html`：遊戲本身（`npm run package` 之後複製 `release/ARPG-遊戲包/ARPG.html`）
- `docs/design/`：設計文件（`npm run docs:pages`）
