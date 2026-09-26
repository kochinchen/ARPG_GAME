# M9 存檔系統規格（Save System）

> 狀態：規格已確認，尚未實作。取代 ARCHITECTURE.md 第 1.2 節的 `SaveDataV1`（該版寫於 M5 前，技能配置、背包格式都已過時）。

---

## 1. 目標與原則

1. **不遺失**：任何時候關掉分頁、當機、瀏覽器崩潰，最多只損失最後幾秒；絕不讀到半份存檔。
2. **讀檔 = 死亡**：讀檔後的世界狀態，要跟「在同一時間點死亡並重生」完全一樣。這條規則決定了下面所有「存不存」的判斷，也同時堵住重新整理的漏洞（見第 4 節）。
3. **只存玩家的選擇與擲骰結果**，可推導的（最終屬性、Mastery、物品名稱、Combo 說明）讀檔後重算。
4. **格式可演進**：`schemaVersion` + Migration；資料表刪改後，舊存檔自動修復而不是讀不進來。
5. **一個角色**：只有一個存檔槽（Slot），加上 3 份輪替備份。

---

## 2. 存檔內容（SaveDataV1）

```ts
interface SaveDataV1 {
  meta: {
    createdAt: string;          // 角色建立時間
    playTimeSec: number;        // 遊戲時間（只算有在跑的 Tick）
    runSeed: number;            // 這個角色的世界種子（樓層佈局、寶箱位置由它推導）
  };

  character: {
    level: number;
    xp: number;                 // 本級已累積經驗
    gold: number;
    hp: number;                 // 目前 HP / MP（防止重新整理免費補滿，見 4.2）
    mana: number;
  };

  skills: {
    ranks: Record<SkillId, number>;         // 已學技能 → 等級 1～5（含初始技能）
    unspentPoints: number;
    t4Charges: number;                      // 尚未使用的 T4 開通次數（取得時機依賴 Mastery 達成的時間點，無法推導）
    t4Unlocked: SkillCategory[];            // 已開通的類別
  };

  loadout: {
    left: SkillId;
    combos: [ComboSlots, ComboSlots, ComboSlots];   // Q / W / E 各 3 步，未放為 null
    activeCombo: 0 | 1 | 2;
    supports: [SkillId | null, SkillId | null, SkillId | null];
  };

  inventory: {
    cells: (SavedEntry | null)[];           // 10 × 8 = 80 格，保留格子位置
    cursor: SavedEntry | null;              // 滑鼠上拿著的物品
  };
  equipment: Partial<Record<EquipmentSlot, ItemInstance>>;   // weapon / helmet / … / ring1 / ring2 / amulet

  codex: {
    comboId: string;
    ruleId: string;
    skills: [SkillId, SkillId, SkillId];
    order: number;              // 發現順序
    timesUsed: number;
  }[];

  floor: {
    current: number;
    highest: number;
    mapId: string;              // 用來確認佈局沒有因為資料更新而改變
    midwayActive: boolean;      // 讀檔後回到哪個存檔點
    exitOpen: boolean;
    killed: number[];           // 本層已擊殺的怪物（SpawnSystem 產生順序的索引）；換層時清空
    openedChests: Record<number, number[]>;   // 樓層 → 已開啟的寶箱索引；跨層永久保留（見 4.9）
    groundItems: { entry: SavedEntry; x: number; y: number; droppedByPlayer: boolean }[];
  };

  counters: {
    nextItemUid: number;        // ItemGenerator 的流水號，避免讀檔後 uid 重複
  };
}

type SavedEntry = { kind: 'item'; item: ItemInstance } | { kind: 'potion'; potionId: string; count: number };
```

外層信封沿用 ARCHITECTURE.md 1.2：`{ schemaVersion, savedAt, checksum: SHA-256(payload), payload }`。

### 2.1 不存的東西（讀檔後重算或重置）

| 項目 | 處理 | 理由 |
|---|---|---|
| 最終屬性（攻擊、防禦、HP 上限…） | 由等級 + 裝備 + Support 重新套用 StatModifier | 平衡改動自動套用 |
| Mastery 是否達成 | `MasteryRule` 由 ranks 推導 | 原則 3 |
| 連段格解鎖數 | 由等級推導（Lv1 / 3 / 6） | 原則 3 |
| Combo 名稱與效果說明 | 由 `comboRules` 依 ruleId 重新產生 | 改文字 / 數值時自動更新 |
| 物品名稱與描述 | `ItemDescriber` 推導 | 原則 3 |
| 玩家位置 | 回到存檔點（中途已啟動 → 中途，否則樓梯口） | 讀檔 = 死亡 |
| 存活怪物的剩餘 HP、位置、AI 狀態 | 依 runSeed 重新生成未擊殺的怪物，滿血、在原生成點 | 同死亡：死亡重生時怪物也是回到原位（AI Return） |
| 狀態效果（燃燒、減速、護盾…）、技能冷卻、藥水冷卻 | 清空 | 同死亡重生 |
| 進行中的連段、投射物、延遲效果、區域效果 | 清空 | 暫態 |
| 浮動文字、Combo 發現提示 | 不存 | 純 UI |

---

## 3. 何時存檔

採用 **Dirty + 節流**，比「列舉每個事件各自存」更不容易漏：

1. 下列事件把存檔標記為 dirty：
   - 角色：`PlayerLeveledUp`、`SkillLearned`、`T4CategoryUnlocked`、配置變更（左鍵 / 連段 / Support / 切換 QWE）
   - 物品：撿起、裝備 / 卸下、背包移動、丟到地上、喝藥水、開寶箱、拾取金幣
   - 樓層：`CheckpointActivated`、`FloorEntered`、`ExitOpened`、怪物死亡
   - Codex：`ComboDiscovered`
2. Dirty 後最多 **2 秒**寫入一次（連續操作只寫一次）。
3. **立即寫入**（不等節流）：`CheckpointActivated`、`FloorEntered`、`pagehide` / `visibilitychange = hidden`。
4. **每 60 秒**保底寫入一次（HP / MP / 遊戲時間會變但不觸發 dirty）。
5. **不存檔的時機**：
   - 玩家死亡倒地期間：不寫入；重生後才寫入（見 4.3）
   - 換層進行中（Tick 中途）：存檔一律在 Tick 結束後取快照，不會拿到換到一半的狀態

> `pagehide` 時 IndexedDB 的非同步寫入不保證完成，所以另外同步寫一份到 `localStorage`（緊急副本，見 5.2）。

---

## 4. 遊戲邏輯檢查（重新整理不能是作弊或懲罰）

### 4.1 重新整理不能刷寶箱 / 刷怪

**問題**：若只存「第幾層」，讀檔時用新種子重新生成樓層，玩家開完寶箱 → 重新整理 → 寶箱重生，可以無限刷。

**處理**：
- 樓層佈局由 `runSeed + 樓層號` 決定（目前已經是 `new Rng(seed).fork('floor-N')`，只需把 seed 存起來）。
- 存 `killed` 與 `openedChests` 索引：讀檔後已擊殺的怪不再出現、已開的寶箱維持開啟。
- `exitOpen` 直接存：出口開過就不會因讀檔又鎖上。
- 擊殺數由 `killed.length` 還原，HUD「還需 N 隻」一致。
- 想刷怪練等級要走「回到上一層」（4.9），而不是重新整理。


### 4.2 重新整理不能免費補滿

**問題**：不存 HP / MP 的話，戰鬥中快死 → 重新整理 → 滿血，比藥水還好用。

**處理**：存目前 HP / MP，讀檔後套用裝備再 clamp 到上限。
（死亡本身就會補滿且沒有懲罰，所以這裡只是避免「不用死也能補滿」；實質影響不大，但成本很低。）

### 4.3 死亡中關閉分頁

倒地期間不寫入。若 60 秒保底或 `pagehide` 剛好在倒地時觸發，存的是「已重生」的狀態：HP / MP 滿、回到存檔點。結果與等待重生完全相同，不會卡在死亡狀態。

### 4.4 手上拿著物品時關閉

`cursor` 會存下來，讀檔後物品仍在滑鼠上。不自動放回背包，避免背包滿時沒有地方放。

### 4.5 地上的物品

- 本層地上的掉落與玩家丟下的物品都存（含位置），讀檔後原位還在。
- 換層時地上的物品清空（與目前行為一致），**跨層不保留**。這一點需要在 UI 提示（M8）。
- 上限 200 件，超過時丟棄最舊的普通品質物品，避免存檔無限膨脹。

### 4.6 物品 uid 不可重複

目前 uid = `流水號-隨機6碼`，流水號每次開遊戲從 0 開始，讀檔後有極小機率與背包內物品撞號（裝備的 StatModifier 用 `item:uid` 當來源，撞號會導致卸下時移除錯的屬性）。
**處理**：存 `nextItemUid`；讀檔時取 `max(存檔值, 所有已存物品的流水號 + 1)`。

### 4.7 Codex 順序

`firstDiscoveredAt` 目前是遊戲內的遞增序號，重新開遊戲會從 0 開始。存成 `order`，讀檔後序號從 `max(order) + 1` 接續。

### 4.8 多分頁同時開

兩個分頁同時玩同一個存檔，會互相覆蓋（後寫的贏，另一邊的進度消失）。
**處理**：用 Web Locks API 取得「存檔鎖」，第二個分頁取得不到鎖時顯示「遊戲已在其他分頁開啟」並停止遊戲 Loop。

### 4.9 回到上一層（刷怪練等級）

玩家可以回到上一層重刷，規則如下：

| 規則 | 內容 |
|---|---|
| 入口 | 第 2 層以上，樓梯口（`S`）同時是「往上的樓梯」，點擊後回到上一層。第 1 層的樓梯口沒有作用 |
| 一次一層 | 要回到更上面的樓層，就在上一層的樓梯口再往上走 |
| 起點 | **一律從該層樓梯口開始**，中途存檔點重設為未啟動（要重新走過去才啟動） |
| 怪物 | **全部重生**（滿血、依種子的原生成點），擊殺數歸 0 |
| 出口 | 樓層號 < 最高到達樓層時，出口**直接開啟**（已經通過的樓層不用再清 70% 才能往下） |
| 寶箱 | **不重生**：每層的寶箱只能開一次，開過的永久維持開啟（`openedChests` 依樓層記錄） |
| 地上物品 | 與往下換層相同，離開樓層就清空 |
| 經驗與掉寶 | 依該層難度（`DifficultyScaler`）；上層怪物經驗較少，刷低層效率自然較低 |
| 物品等級 | = 該層樓層號 |

「任何換層（往上或往下）都是重新進入該層」：怪物重生、從樓梯口開始、`killed` 清空。
「重新整理」則是繼續目前這一層：怪物與寶箱狀態都保留。兩者的差別只有這一點。

換層後會立即存檔，所以「往上 → 重新整理」拿到的就是剛重生的上一層，不會出現漏洞。

> 寶箱不重生是為了避免「上樓 → 下樓」的無限開寶箱循環；怪物掉寶已經足夠當作刷寶來源。

**同時需要修改的現有程式（M7 的樓層系統）**：
- `ExitPortal` 增加往上的樓梯（`kind: 'stairsUp'`），`InteractionSystem` 點擊後呼叫 `useStairsUp()`。
- `FloorManager.requestAscend()`；`enterFloor(floor)` 在 `floor < highestFloor` 時出口直接開啟。
- `enterFloor` 生成寶箱時略過 `openedChests[floor]` 裡的索引（讓它們一開始就是開啟狀態）。
- Render：樓梯口畫上往上的標示，標籤「往上 → 第 N 層」。

---

## 5. 安全性：寫入、備份、驗證

### 5.1 儲存結構（IndexedDB）

```
db: arpg-save
└─ store: slots
   ├─ main.0   ┐
   ├─ main.1   ├─ 3 份輪替（每次寫到最舊的那份）
   ├─ main.2   ┘
   └─ main.pointer → { latest: 0 | 1 | 2, savedAt }
```

寫入流程（原子性）：
1. 序列化 → 計算 SHA-256 → 組成信封
2. 寫入下一個輪替位置（不是目前 latest）
3. 寫入成功後才更新 `pointer`
4. 任何一步失敗：latest 仍指向舊的完整存檔

### 5.2 讀取流程

```
1. 讀 pointer → 依 latest、次新、最舊順序嘗試
2. 另外考慮 localStorage 緊急副本（pagehide 寫的），savedAt 較新時優先
3. 每份檢查：信封格式 → checksum → Migration → Zod Schema → 資料修復（5.3）
4. 第一份全部通過的就用它；被跳過的記錄到 console，並在 UI 顯示「最新存檔損毀，已從備份還原（時間）」
5. 全部失敗 → 不覆蓋任何東西，顯示錯誤，提供「匯出損毀存檔」與「開新角色」
```

> 第 5 步很重要：讀不進來時**絕對不能自動開新角色並覆蓋存檔**，否則一次讀檔錯誤就會永久失去角色。

### 5.3 資料修復（讀檔時，資料表更新造成的不一致）

| 情況 | 修復方式 |
|---|---|
| 技能 ID 已從資料表刪除 | 移除該技能，退回它的技能點 |
| 技能等級超過 `maxSkillRank` | 降到上限，退回多出的點數 |
| 技能點總數不符（未使用 + 已使用 ≠ 初始點數 + 每級點數 × (等級 − 1)；已使用 = 各技能等級總和 − 初始技能數，初始技能的 Lv1 是免費的） | 以公式為準重算未使用點數；若已使用 > 總數（平衡調降），重置整個技能樹並退回全部點數，顯示提示 |
| 配置引用未學 / 不存在的技能 | 該格清空；左鍵回到 `basic.attack` |
| Support 放了非被動技能或重複 | 該格清空 |
| 物品 base / 詞綴 ID 不存在 | 移除詞綴；base 不存在則移除物品 |
| 裝備欄位不符（例如資料把戒指改成護符） | 卸下放回背包，背包滿則放到存檔點地上 |
| 藥水疊超過上限 | 拆成多疊，放不下的放到地上 |
| Codex 的 ruleId 不存在 | 移除該條目 |
| `floor.mapId` 與目前該層應使用的地圖不同 | 丟棄本層的 killed / openedChests / groundItems，重新生成整層（地上的物品移到樓梯口） |
| 樓層號超過資料範圍 | 目前最後一個區間是 6～999，不會發生；保留檢查 |

所有修復都是純函式（`SaveRepair`），可以單元測試。

### 5.4 匯出 / 匯入

- 匯出：下載 `arpg-save-YYYYMMDD-HHmm.json`（內容就是信封）。
- 匯入：選檔 → 做 5.2 的完整驗證 → 顯示「等級 N、第 N 層、存檔時間」確認 → 覆蓋前先把目前存檔自動匯出一份備份。
- 位置：M9 先放在 Debug 面板的按鈕，M8 UI 再移到選單。

### 5.5 開發用重置（B 鍵）

確認後清除 IndexedDB 全部 slot 與 localStorage 緊急副本，再重新載入。

---

## 6. 架構

```
src/save/                         ← 可以用 DOM / IndexedDB；game 不知道它的存在
├─ schema/SaveDataV1.ts           Zod Schema（型別由 Schema 推導）
├─ SaveMapper.ts                  GameWorld → SaveData（capture）、SaveData → GameWorld（apply）
├─ SaveRepair.ts                  5.3 的純函式修復
├─ migrations/index.ts            v0 → v1 …（純函式）
├─ Envelope.ts                    序列化、SHA-256（crypto.subtle，Node 也有）
├─ SaveService.ts                 輪替、pointer、讀取順序、節流、Web Lock
└─ storage/
   ├─ ISaveStorage.ts             get / put / delete / keys
   ├─ IndexedDbStorage.ts
   └─ MemoryStorage.ts            測試用
```

- `game/` 需要新增的只有「讓外部可以還原狀態」的方法，例如 `GameWorld.enterFloor(floor, restored?)` 接受已擊殺 / 已開寶箱清單、`ItemGenerator` 可設定流水號、`ComboCodex.restore()`。不會 import `save/`。
- `SaveMapper` 是唯一同時知道 GameWorld 與 SaveData 兩邊格式的地方。
- 觸發存檔：`SaveService` 訂閱 EventBus 標記 dirty，在 `main.ts` 的 render callback（Tick 結束後）檢查是否需要寫入。
- 初始化順序依 ARCHITECTURE.md 第 J 節：`DataRegistry` → `SaveService.loadLatest()` → `GameWorld`（新角色）→ `SaveMapper.apply()` → `enterFloor(current, restored)`。

---

## 7. 測試清單

| # | 測試 | 預期 |
|---|---|---|
| 1 | Round-trip：capture → apply 到新 GameWorld → capture | 兩次 SaveData 完全相同 |
| 2 | 還原後最終屬性 | 與存檔前的 maxHp / damage / defense 相同（證明裝備 / Support 有正確重新套用） |
| 3 | 還原後 Mastery / 連段格數 | 與存檔前相同 |
| 4 | T4 開通次數與已開通類別 | 正確還原，仍可學該類 T4 |
| 5 | 開寶箱 → 讀檔 | 寶箱仍是開啟狀態，數量不變 |
| 6 | 殺 5 隻 → 讀檔 | 那 5 隻不再出現、擊殺數 = 5、其餘怪物位置與存檔前的生成點相同 |
| 7 | 出口已開 → 讀檔 | 出口仍開啟 |
| 8 | 中途已啟動 → 讀檔 | 玩家在中途存檔點 |
| 8a | 第 3 層往上 | 到第 2 層樓梯口；怪物全部重生、擊殺數 0、中途未啟動、出口已開 |
| 8b | 第 2 層開過的寶箱 → 下樓 → 再上樓 | 寶箱仍是開啟狀態 |
| 8c | 第 1 層的樓梯口 | 無法往上 |
| 8d | 回到第 2 層後再往下 | 第 3 層怪物重生、從樓梯口開始 |
| 9 | HP 30% → 讀檔 | HP 仍是 30% |
| 10 | 死亡倒地時 capture | HP 滿、位置在存檔點 |
| 11 | 手上拿著物品 → 讀檔 | 物品仍在 cursor |
| 12 | 地上物品 → 讀檔 | 原位還在；換層後消失 |
| 13 | 讀檔後產生新物品 | uid 不與任何已存物品重複 |
| 14 | Codex 順序與使用次數 | 還原後順序不變；新發現的排在最後 |
| 15 | Checksum 不符 | 退回次新備份，並回報 |
| 16 | 三份全壞 | 不覆蓋、回傳錯誤、不開新角色 |
| 17 | 寫入途中失敗（Storage 丟錯） | pointer 仍指向舊存檔，舊存檔可讀 |
| 18 | 輪替 | 連存 4 次後只有 3 份，最舊的被覆蓋 |
| 19 | v0 假資料 → Migration | 通過 v1 Schema |
| 20 | 技能 ID 被刪除 | 移除並退點；配置清空該格 |
| 21 | 技能點總數不符 | 依公式修正；超過時重置技能樹 |
| 22 | 物品 base 不存在 | 物品移除，其他物品不受影響 |
| 23 | mapId 不符 | 重新生成本層，地上物品移到樓梯口 |
| 24 | 節流 | 2 秒內 10 次 dirty 只寫 1 次；CheckpointActivated 立即寫 |
| 25 | 匯出 → 匯入 | 與原存檔內容相同 |
| 26 | 匯入損毀檔案 | 被拒絕，目前存檔不變 |

---

## 8. 驗收（Acceptance）

1. 開寶箱、撿裝備後立刻關分頁，重開後裝備都在、寶箱仍是開的。
2. 在第 3 層啟動中途點後重新整理：第 3 層、中途點、已殺的怪不在、背包 / 技能 / 配置 / Codex 完全相同。
3. 戰鬥中重新整理：HP 沒有被補滿、怪物回到原位。
4. 用 DevTools 竄改最新一份存檔：重開後自動用備份，並顯示提示。
5. 開兩個分頁：第二個分頁顯示已在其他分頁開啟。
7. 在第 3 層往上回到第 2 層：從樓梯口開始、怪物重生、出口已開、之前開過的寶箱仍是開的。
6. 匯出、按 B 重置、匯入：角色完整回來。

---

## 9. 已確認的決定

| # | 問題 | 決定 |
|---|---|---|
| 1 | 讀檔時怪物要不要重生 | **不重生**，與死亡一致。想刷怪就回到上一層（4.9） |
| 2 | 換層時地上的物品是否保留 | 不保留；M8 在離開樓層時若地上有稀有以上物品則提示 |
| 3 | 存檔要不要加密 / 混淆 | 不要，JSON 明文 + Checksum |
| 4 | 可以回到上面的樓層嗎 | 可以，一次一層；怪物重生、強制從該層樓梯口開始、出口已開；寶箱不重生（4.9） |
