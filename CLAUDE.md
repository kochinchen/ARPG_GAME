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

- 吸血 / 吸魔（含「回復造成傷害的一部分」）：技能最高 +0.5%（1～5 級 0.1%～0.5%），其他每一個來源（詞綴、傳奇 / 神話屬性、條件效果）最高 +0.3%；例外：「暴擊時回復傷害的一部分」最高 +0.5%（鼓勵提升暴擊率）。近戰的吸血倍率（1.3 倍）與多個來源累加不受限（設計者同意）。唯一例外：奪界雙手掉的橘核印記「奪取之手」，吸血、吸魔各 +0.2～+0.6%，可以堆疊（設計者 2026-11-04 同意）。上限在 `STEAL_CAP`（`src/data/balance.ts`），由 `tests/data/StealCap.test.ts` 把關。新版本也受此限制；要往上調，先提出理由並與設計者討論，同意後才能改。

## 指令

- `npm run dev`：開發伺服器（http://localhost:5173）；角色樣態預覽 http://localhost:5173/viewer.html；Three.js 畫面試驗（與現在的畫法並排比較，`?monster=lava_behemoth` 換怪物）http://localhost:5173/viewer-three.html；GPU 蒙皮比對（同一個女主角用 CPU 算頂點與 GPU 蒙皮各畫一次，逐像素比較，並附浮點誤差的對照組）http://localhost:5173/skin-compare.html；魔王動作預覽（遊戲的 Three.js 畫法，可切換待機 / 走路 / 跑步、各招式、受傷、倒地、魔王階段與掉在地上的盾劍；`?model=abyss_lord` 換魔王、`&bones=1` 依骨頭上色檢查分區；「T 字」按鈕檢查手臂；噴錢的結晶獸 `?model=ember_walker|frost_walker|storm_walker|venom_walker` 也在這裡，模型在 `src/render/figure/StoneWalkers.ts`）http://localhost:5173/boss-viewer.html；過場影片預覽（遊戲的播放器 `src/ui/cutscene/CutscenePlayer.ts`：上 80% 舊紙繪圖慢慢放大、下 20% 英文字幕＋小字中文、英文旁白與黑暗低語；第一次站上 1、6、11…31 層各播一次前導，擊敗統御者後播四頁終章，存檔記錄看過的，標題畫面「過場影片」可重看；魔王第一次倒下時的魂魄在 `src/data/souls.json`、地圖上的遺物在 `src/data/lore.json`、夾在寶箱裡的挑戰者筆記在 `src/data/notebook.json`；三者合成一本《井誌》（`src/data/book.ts`，遊戲內按 Y），每收集 1/4 給獎勵（`balance.book`）。另有隱藏的第 70 頁（`src/data/hiddenLore.json`）：打倒統御者後第 18 層才出現靠牆的女屍，不算在 69 頁與獎勵裡，撿到才變成 70。文字在 `src/data/cutscenes.json`，圖用 ChatGPT 生成放在 `art/prelude/<media>-<幅>.jpg`；`python3 scripts/prelude_audio.py [media]` 產生旁白並把圖與聲音壓縮到 `src/ui/cutscene/media/`）http://localhost:5173/prelude.html；女主角 3D 構面模型（骨架 → 構面體積，自由視角，`src/tools/heroine3d/`；造型依 `女主角設計圖/` 的轉面圖，「T 字」動作可對照）http://localhost:5173/heroine-3d.html
- 魔王模擬器（`src/tools/bossSim/`，開發用）：選敵人、樓層、主角等級與裝備，用遊戲的世界、AI 與傷害流程開打；主角只能走路、不會倒下，顯示招式傷害表與實戰紀錄，換設定就重新紀錄。可選魔王階段（從該階段開始，並有各階段對照表）；網址 `?enemy=abyss_lord&floor=30&level=43&gear=shield&phase=2`（`gear`：`none` / `shield` / `noShield`；`&wear=mythic.helmet_abyss_lord` 額外穿指定的傳奇 / 神話）http://localhost:5173/boss-sim.html；「範圍檢視」分頁列出所有隨樓層放大的敵方範圍（每 5 層一欄），選招式與樓層後照實際大小畫在地上，並和改動前比較；`npm run package:sim` 打包成單一 HTML → `release/魔王模擬器.html`（直接雙擊開啟）
- 敵方範圍圖（`src/tools/areaChart/`，不必開打）：選招式與樓層，照遊戲的等角比例畫出範圍，附主角比例尺、1080p 畫面框、每 5 層變化與所有招式總覽 http://localhost:5173/area-chart.html；同樣由 `npm run package:sim` 產生 `release/設計文件/敵方範圍圖.html`
- `npm run art:heroine`：把女主角 3D 構面模型連骨架交給 Blender，輸出 `art/heroine/heroine.blend`（可編輯）與 `heroine.glb`；會覆蓋 Blender 裡改過的版本（舊檔先備份成 `*.bak-時間`）。之後可再跑 Blender 修整腳本（劍分開、身體加密成較密的三角構面；只能對剛產生的檔案跑一次）：`/Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine.blend --python scripts/heroine_refine.py -- art/heroine`。在 Blender 改完後匯出 glTF 到 `art/heroine/heroine.glb`，heroine-3d.html 的「比較」可並排看
- AI 版女主角：設計圖四視圖（`art/heroine/multiview/`）用微軟 TRELLIS 生成的模型放在 `art/heroine/ai/`，接上同一副骨架：`/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/heroine_ai.py -- art/heroine/ai/trellis-1.glb art/heroine` → `art/heroine/heroine-ai.blend` 與 `.glb`（heroine-3d.html 的「AI 版」）。不使用中國公司的服務（Hunyuan、Tripo、Rodin 等）
- 遊戲裡的女主角就是 AI 版（`src/render/figure/HeroineAI.ts`，舊版保留為 `HEROINE_CLASSIC`）：改過 `heroine-ai.blend` 後執行 `/Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine-ai.blend --python scripts/heroine_ai_game.py -- src/render/figure/heroine/heroineAI.json` 更新遊戲資料，再 `npm run docs:models`、`npm run package`
- AI 版怪物（目前：蜘蛛女王 `art/monsters/spider_queen/`、深淵魔王 `art/monsters/abyss_lord/`、深淵統御者 `art/monsters/abyss_sovereign/`，巨劍與盾牌另外生成成 `ai/sword.glb`、`ai/shield.glb`；墓穴守衛 `crypt_guardian`、墮落神官 `fallen_priest`、熔岩巨獸 `lava_behemoth`、墮落騎士 `fallen_knight`，武器暫時用舊版程式畫的）：遊戲截圖或設計者的造型圖 → ChatGPT 白底四視圖（提示詞在各資料夾）→ Hugging Face TRELLIS（`trellis-community/TRELLIS` 多圖模式；未登入的免費額度一天只夠一次，要在 huggingface.co 的頁面登入後操作）→ `ai/trellis-1.glb`，再執行 `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/monster_ai.py -- art/monsters/<怪物> src/render/figure/bosses/<spiderQueenAI|abyssLordAI|abyssSovereignAI|cryptGuardianAI|fallenPriestAI|lavaBehemothAI|fallenKnightAI>.json`（減面、骨架與權重，骨架定義在腳本的 `SKELETONS`、要切掉的多餘部分在 `CLEANUP`、獨立物件在 `PROPS`；每骨頭一色的檢查圖 `ai/preview/bones-*.png`、可編輯的 `<怪物>-ai.blend`）；遊戲端 `SpiderQueenAI.ts`、`AbyssLordAI.ts`、`AbyssSovereignAI.ts`、`HumanoidAI.ts`（共用 `AiRig.ts`；舊版保留為 `*_CLASSIC`，動作共用）。改完執行 `npm run docs:models`。一般怪也走同樣流程（清單在 `art/monsters/待生成3D清單.md`）：輸出到 `src/render/figure/monsters/<名稱>AI.json`，遊戲端 `MonsterAI.ts` 的 `monsterAi()` 沿用舊版模型的動作、大小與武器（舊版的劍盾、弓依前臂長度縮放），在 `Monsters.ts` 登記並加進 `AI_MONSTERS`（魔王動作預覽 `?model=skeleton&zoom=5` 看得到）；目前已換：骷髏戰士、食屍鬼、毒液食屍鬼、冰霜骷髏、骷髏弓手、虛空孢子、虛空吞噬者、重甲骷髏、骷髏法師、雷霆法師、骨刺獵獸（`monster_ai.py` 的 `reshape_bone_hound` 拉長背刺、捏尖腳趾；走路 / 飛奔 / 咬合在 `MonsterAI.ts` 的 `houndLife`；跑步速度與第一次衝刺見 `EnemyDef.run`）、酸液甲蟲（八隻腳，舊版六隻；`CLEANUP` 拿掉觸鬚、`add_beetle_gun` 加砲管；酸液的扇形、泡泡與煙在 `ImpactFx` 的 `acid` 與 `ThreeSkillFx.acidSpray`）、血鱗獵蜥（下顎與三節尾巴，動作在 `lizardLife`）、毒沫噴吐者（下顎與左右喉囊，跳躍移動，動作在 `toadLife`）、角甲巨獸（低頭衝鋒，`bruteLife`）、熔顎巨獸（下顎與兩節尾巴，模型本身張著嘴，`jaw` 負值是闔起來；噴熔岩前闔嘴抬頭，動作在 `moltenLife`）、鉤爪蟲（螳螂，六隻腳；TRELLIS 把鐮刀生成在身體後方還多一把，`CLEANUP` 切掉多的，`hookLife` 所有姿勢都先把手臂轉到胸前；揮擊與撕裂用雙束連刺的 `sickle` 特效）、火囊爬行者（火囊是 `ex_sac`，用 `Pose.scale` 脹大；自爆在 `Renderer.motionFor` 指定專屬動作，動作在 `crawlerLife`）、卵囊母體（卵囊 `ponytail`、兩根管子 `ex_tube`，用 `Pose.scale` 收縮；產卵也在 `Renderer.motionFor`，動作在 `eggLife`；吐網飛出去是一團蛛網（`ProjectileArt` 的 `web`），消失處攤開毒網（`ImpactFx` 的 `poisonWeb`））、晶刺織網蛛（八隻腳、毒牙 `shinL/R`，織網也在 `Renderer.motionFor`，動作在 `weaverLife`；晶網是 `look: iceWeb`，網線在 `fx/WebFx.ts`，節點的冰錐在 `ThreeSkillFx.webIce`）、孵化蜘蛛、單眼浮體（六條觸手，`sixTentacles`）、鐵輪劍獸（18 層，取代暗影獵豹、ID 沿用 `enemy.shadow_panther`；模型 `art/monsters/wheel_sword_beast/`，`monster_ai.py` 切掉 TRELLIS 多長的後方劍束與輪子前的半圓，輪子用 `thigh` 關節連續轉；動作在 `MonsterAI.ts` 的 `wheelBeastLife`；變化型熔輪 / 霜輪 / 鋸輪劍獸、三瞳浮體 / 凝視者 / 烈瞳浮體是同一模型換色，在 `Monsters.ts`）；同一個模型換色 / 換裝的：赤焰骷髏、紫電骷髏（冰霜骷髏）、焦骨弓手、凍骨弓手、猛毒弓手（骷髏弓手）、鎖鏈獄卒（骷髏戰士＋舊版的鐵籠、鎖鏈、燈籠、鐵鉤）、鏽蝕重甲 / 霜鎧 / 熔鐵 / 雷殛 / 飛斧重甲（重甲骷髏，`armoredVariant`）、八種袍色的法師（`robeSkin`，法術見 `EnemyDef.spellbook` 與 `balance.mageSpellbook`）、狂熱信徒（骷髏法師換灰黑袍、臉與手塗黑，`CULTIST_AI`）；2026-11-12 加入：要塞魔像（`ROTATE_Z` -90，肩上的城垛塔跟鎖骨）、腦海浮體（六條觸手同單眼浮體的 `sixTentacles`，觸手的權重只拿最靠近的那條，`brain_tentacle_of`）、深淵祭司（背後的符文圈是 `scarfB`，生成的符文圈下方開口，遊戲端只輕晃不整圈轉；權杖照舊版 `PRIEST_GEAR`）、墮落聖殿騎士（連枷與塔盾照舊版 `TEMPLAR_GEAR`）、寒霜孢子體（`ROTATE_Z` -90，四隻腳同舊版的四條根鬚）、鑽地寄生蟲（新版筆直地蟲，舊的 GLB 留作 `trellis-0-舊版虛空吞噬者.glb`；`stretch_burrower` 把頭後的身體拉長 1.5 倍；三片大顎 `ex_jawU`、`handL/R`，`MonsterAI.ts` 的 `burrowerLife` 平常闔成尖錐、鑽出時前半身豎直只露一半；大小 `BURROWER_HEIGHT` 讓頭高等於女主角）。一般怪的面數維持接近舊版（`TRIS_OF`），`CLASSIC_MODELS` 是換之前的舊版
- 怪物身體的地面範圍（設計者 2026-11-10）：每隻怪物的模型從正上方投影到地面的輪廓（`src/data/bodyShapes.json`，細長的尖角、尾巴尖、武器不算，至少包住原本的碰撞圓），碰撞、索敵、命中與接近距離都算到輪廓的邊緣（`src/game/entities/BodyShape.ts`）；兩隻怪物之間、牆壁與走道仍用碰撞圓。換了怪物模型或大小後執行 `UPDATE_BODY_SHAPES=1 npx vitest run tests/data/BodyShapes.test.ts` 重新產生（沒重產測試會失敗）
- 小說的固定場景（隨機地圖裡的特殊房間與牆面）：資料在 `src/data/setPieces.ts`，放置在 `src/game/world/SetPieces.ts`，擺設模型在 `src/render/figure/SetPieceProps.ts`，規劃與測試結果在 `docs/地圖設計V6_小說樓層場景.md`；`SET_PIECE_SEEDS=5000 npx vitest run tests/game/world/SetPieces.test.ts` 可加大壓力測試
- 隱藏魔王（目前：萬骸之口 `enemy.bone_dragon`，模型 `art/monsters/bone_dragon/` → `bosses/boneDragonAI.json`，遊戲端 `BoneDragonAI.ts`；噬界足眼 `enemy.abyss_dragon`，模型 `art/monsters/abyss_dragon/`（尾巴另外生成，`monster_ai.py` 加第三個參數 `tail`）→ `bosses/abyssDragonAI.json`、`abyssDragonTailAI.json`，遊戲端 `AbyssDragonAI.ts`，尾巴脫離後是 `enemy.abyss_tail`，機制在 `BossSystem`（`clawCycle`、`pause`、`detach`）與 `EffectScheduler`（`leap`））：規則在 `balance.hiddenBoss`，地圖預留房在 `MapGenerator`（`hiddenRoom`、`openHiddenRoom`）；招式有四個屬性版本（`<技能 ID>.<屬性>`，`SkillExecutor` 每次出招選一種）。開發時網址加 `?hiddenboss` 讓每層都出現；`SET_PIECE_SEEDS=15 npx vitest run tests/game/world/HiddenBoss.test.ts -t 封閉時` 可加大地圖壓力測試
- `npm test`：單元測試
- `npm run lint`：型別檢查（含無 DOM 的 `tsconfig.logic.json`）+ 依賴方向檢查
- `npm run build`：正式版建置
- `npm run package`：可攜版遊戲包（單一 HTML + Windows / Mac 啟動檔 + 說明）→ `release/ARPG-遊戲包/` 與 `.zip`
- `npm run docs:models`：重新產生設計文件的怪物模型圖（每隻怪物旁邊站著女主角當比例尺）→ `release/設計文件/models/`
- `npm run docs:combos`：用遊戲的 Combo 判定重新產生組合技圖鑑 → `release/設計文件/組合技圖鑑.html`（頁面樣式在 `scripts/combo-doc.template.html`）
- `npm run docs:icons`：重新產生裝備圖鑑的物品圖示產生器（與遊戲背包相同的圖示）→ `release/設計文件/item-icons.js`；改到裝備資料或外觀時執行
- `npm run docs:cores`：重新產生裝備圖鑑的「熔核」頁（核種表、孔數、核階核色、費用、融合範例）並同步飛昇費用與光芒門檻 → `release/設計文件/裝備圖鑑.html`；改到熔核資料或 `balance.sockets` / `fusion` / `shop.ascend` / `gearAura` 時執行（圖示在 `npm run docs:icons`）
- `npm run docs:sim`：重新產生角色成長模擬用的遊戲邏輯（資料、Combo 判定、技能樹規則、武器允許矩陣）→ `release/設計文件/sim.js`；改到技能、平衡數值或規則時執行
- `node scripts/render-story-doc.mjs`：用 `scripts/story-doc.template.html` 與 `src/data/lore.json`、`souls.json`（遺物與魂魄文字）重新產生「故事與世界觀」→ `release/設計文件/故事與世界觀.html`；線上版加 `--fragment <檔案>` 產生後重新發布
- `node scripts/render-novel-doc.mjs`：用 `scripts/novel/`（中文）、`scripts/novel/en/`（英文）與 `scripts/novel-doc.template.html` 重新產生小說《井誌》→ `release/設計文件/井誌小說.html`（遺物、筆記、魂魄、過場文字由 `src/data` 填入，少了或中英文對不上會報錯）；線上版加 `--fragment <檔案>` 產生後重新發布
- `npm run docs:pages`：把 `release/設計文件/` 複製到 `docs/design/`（GitHub Pages：https://kochinchen.github.io/ARPG_GAME/design/）

## 開發用快捷鍵（只在 `npm run dev` 有效）

- B：重置遊戲（有確認框；會刪除目前欄位的存檔；共用倉庫不受影響，要清空用倉庫面板的開發按鈕）
- N：升一級
- M：在玩家周圍生成 3 個寶箱
- J：直接前往下一層（不需清怪）
- L：在玩家周圍掉落每種稀有度各一件裝備（檢查光柱、名稱、光芒）
- Shift + L：隨機掉落 5 件傳奇（橘）+ 5 件神話（紅）；網址加 `?loot=mythic.helmet_fallen_knight,…` 改成掉落指定的幾件（檢查指定裝備的外觀）
- H：融合測試包（2 萬金幣、武器精華 200、防具精華 100、四把武器含一把傳奇斧、一件 2 孔頭盔），物品等級 = 目前樓層
- Shift + H：同上，物品等級 45（融出 T5 熔核；核階看投入裝備的平均物品等級，每 8 級一階、32 以上是 T5）
- G：切換 Three.js / Pixi 畫法（Three.js 是預設畫法：地板、角色與石砌的牆用 Three.js，主角的燭光是真的點光源、投射陰影；特效、文字、火把、機關仍是 Pixi；`src/render/three/ThreeWorld.ts`，光源參數在 `ThreeLighting.ts`，牆的石材在 `WallStones.ts`）。玩家可在選單關掉「立體光影」改用 Pixi；網址加 `?pixi` / `?three` 強制指定；顯示卡不支援 WebGL2 時自動用 Pixi
- F3：顯示 / 隱藏除錯資訊

## 流程

- 依 Milestone 順序開發（M0 → M9），每個 Milestone 完成 Acceptance 與 Test 才進下一個。
- `npm test` 與 `npm run lint`（含 dependency-cruiser）必須通過。
- 設計文件（Artifact 頁面）在 `release/設計文件/` 有本機版：怪物與樓層、裝備圖鑑、角色成長模擬、開發歷程、組合技圖鑑、故事與世界觀（連結見該資料夾的 `說明.txt`）。改到這些頁面的內容（怪物、樓層、魔王、裝備、成長數值、模型、開發進度）時，線上頁面與本機 HTML 都要一起更新；改到怪物或女主角模型時執行 `npm run docs:models`；改到技能、Combo 標籤或組合技規則時執行 `npm run docs:combos`，線上版用 `node scripts/render-combo-doc.mjs <檔案> --fragment` 產生後重新發布。`npm run package` 只會重建 `release/ARPG-遊戲包/`，不會動到 `release/設計文件/`。本機版更新後執行 `npm run docs:pages`，GitHub Pages 上的設計文件（`docs/design/`）才會跟著更新；遊戲本身的線上版是 `docs/index.html`（`npm run package` 後複製 `release/ARPG-遊戲包/ARPG.html`）。
