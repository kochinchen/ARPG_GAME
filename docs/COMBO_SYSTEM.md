# 三段技能 Combo System 設計規格（第一階段）

> 狀態：已實作（第二階段完成）。第 0 節的問題已全部依「暫定做法」定案；實作時另有 3 項調整，見第 0.1 節。
> 本文件是 [ARCHITECTURE.md](ARCHITECTURE.md)「技能系統」一節的延伸，取代其中的 `replaceStep` 隱藏連段做法。

---

## 0. 設計決策（交叉檢查規格時發現的問題，已定案）

| # | 問題 | 影響 | 採用做法 |
|---|---|---|---|
| Q1 | **沒有任何技能帶 `Advance` 標籤**。Rule 04（Control Rush）、Rule 07（Hunter Rush）第二步需要 `Advance`，Secret Combo「Frozen Impact」需要「Charge」，但 36 個技能裡沒有叫 Charge 的技能 | 這三條規則永遠不會觸發 | 把 **Shield Bash 盾撞**視為「衝撞 / Charge」：Range 改為 **Mid**、加上 `Advance`（它本來就會向前衝 3 格）。W 範例「冰球 → 衝撞 → 重擊」也因此成立 |
| Q2 | **27 種 Range 排列只定義了 14 種**。例如 `Far → Near → Near`（Rule 05 Elemental Weapon 的典型用法：火球 → 快斬 → 雙重斬）不在「可產生 Combo」清單裡 | Rule 05、Ice Escalation 部分排列會被擋掉 | 只把明列的 `Near→Far→Near`、`Far→Near→Far` 視為不合理，其餘 25 種都合理。理由：規格的不合理條件是「貼近 → 拉遠 → 再貼近」這種來回跳，單次跳躍（`Near→Near→Far` 已明列合理）應一視同仁 |
| Q3 | **標籤與現有技能效果不一致** | 標籤說有、實際沒有，玩家會覺得組合效果「不準」 | 見第 1.3 節逐項列出；建議以效果為準修正（或補效果），並加入載入時的一致性檢查 |
| Q4 | **Greater Fireball 範例數值矛盾**：第十三節說 Greater Fireball 基礎加成 25%（Rule 01），但 `重砍 → 重砍 → 火球` 會先命中 Exact Combo「Flame Finisher」（+30%），Rule 01 不會生效 | 文件範例與實際結果不同 | Rule 01 命中且第三招是火球時，顯示名稱為 Greater Fireball；`重砍 → 重砍 → 火球` 本身則是 Flame Finisher |
| Q5 | **Stagger（硬直）與 Proc（觸發機率）目前遊戲中不存在** | Rule 04、13、15 與 Frozen Impact 的部分效果沒有作用對象 | `StaggerModifier` 先保留類型但不生效（等硬直系統）；Rule 13 的 Proc Chance 改為 `StatusChanceModifier`（提高技能附帶狀態的機率） |
| Q6 | **Freeze Chance +20% 是加 20 個百分點還是乘 1.2？** | 冰霜新星 20% 機率會變 40% 或 24% | 機率類採**加法**（百分點）；其他百分比類採乘法 |
| Q7 | **第 2、3 格何時解鎖**未指定 | 目前三格一開始就全開 | 第 1 格 Lv 1、第 2 格 Lv 3、第 3 格 Lv 6（寫在 balance，可調） |
| Q8 | **「觸發」的時間點**：組合在按下時判定，但若第二招就中斷，是否算發現？ | 發現時機 | 以**第三招實際施放**為準（`ComboCompleted`），中途中斷不算發現、也不計入使用次數 |
| Q9 | **同一 Priority 內兩條規則同時命中** | 例如 `雙重斬 → 雙重斬 → 重砍` 同時符合 Rule 02 與 Rule 14 | 同層先比「條件數量」（越具體越優先），相同時比規則編號（小者優先） |
| Q10 | Secret Combo 規格只給 2 個，建議 5～10 個 | 探索內容 | 第 5.3 節另提 3 個**草案**（S03～S05），標為待確認，不列入測試基準 |

### 0.1 實作時的調整

| 項目 | 原規格 | 實作 | 原因 |
|---|---|---|---|
| 毀滅重擊 | 標籤含 Execute | **拿掉 Execute**，保留原技能規格的「對破甲目標加傷」 | 標籤必須與效果一致；技能規格以原始設計為準 |
| 箭雨 | 標籤含 Projectile | **拿掉 Projectile** | 箭雨以落點打擊實作、沒有實際投射物，投射物類加成對它無效；Rule 09 因此改給「命中次數 +1」 |
| 秘密組合草案 S03～S05 | — | 維持草案，未放入遊戲資料 | 依 Q10 |

### 0.2 實作後發現的規則設計觀察

- **Rule 07 Hunter Rush（無 Mark 版本）幾乎總被 Rule 05 元素附刃蓋過**：非 Mark 的 Far Setup 只有冰球、火牆（都是元素技能），第二招衝撞與多數 Near Finisher 又是物理，於是先符合 Tier 3 的元素附刃。實際能觸發無 Mark 版 Hunter Rush 的例子：火牆 → 衝撞 → 絕對零度。若希望 Hunter Rush 更常出現，可考慮把它提升到 Tier 3，或讓元素附刃要求第二招為 Near

---

## 1. Skill Definition（36 個主動技能）

### 1.1 欄位定義

| 欄位 | 說明 | 可用值 |
|---|---|---|
| SkillID | 現有資料中的技能 ID | 例：`melee.heavy_slash` |
| Category | 類別 | Melee / Ranged / Magic |
| Branch | 路線 | 見表 |
| Tier | 層級 | 1～4 |
| RangeType | 系統內部距離分類，**不顯示給玩家** | Near / Mid / Far |
| ActionTags | 動作特性 | Fast, Heavy, MultiHit, Projectile, AoE, Channel, Impact, Guard, Counter, Execute, Pierce, Burst |
| DamageTags | 實際造成的傷害類型；不造成傷害的技能為空 | Physical, Fire, Ice, Lightning |
| ElementTags | 魔法元素（不含 Physical），供「元素技能」類規則判斷 | Fire, Ice, Lightning |
| MovementTags | 施放者位移 | None, Advance, Retreat, Roll, Reposition, Dash |
| ControlTags | 對目標 / 自身的控制效果 | None, Slow, Freeze, Stun, Knockback, ArmorBreak, Mark, Shield |
| ComboRole | 在連段中的定位 | Starter, Setup, Bridge, Amplifier, Finisher, Defense |
| Hits | 每次施放的總命中段數（Rule 14 使用；由效果資料推導，不手填，`data/skillAnalysis.ts`） | 整數 |

> 規格的標籤詞彙把 Physical 放在 Element，但欄位又分 DamageTags / ElementTags。本文件的對應方式：**Physical 只放 DamageTags**，ElementTags 只放三種魔法元素。這樣「元素技能」條件不會誤把物理技能算進去。

### 1.2 技能表

`*` = 依第 0 節 Q1 / Q3 建議調整過的欄位。

| # | SkillID | 技能 | Branch | T | Range | Action | Damage | Element | Movement | Control | Role | Hits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | melee.heavy_slash | 重砍 | Heavy | 1 | Near | Heavy, Impact | Physical | — | None | None | Finisher | 1 |
| 2 | melee.armor_break | 破甲斬 | Heavy | 2 | Near | Heavy | Physical | — | None | ArmorBreak | Setup | 1 |
| 3 | melee.earth_break | 裂地擊 | Heavy | 3 | Near | Heavy, AoE | Physical | — | None | Knockback | Finisher | 1 |
| 4 | melee.devastator | 毀滅重擊 | Heavy | 4 | Near | Heavy, AoE, Impact（**無 Execute**，見 0.1） | Physical | — | None | None | Finisher | 1 |
| 5 | melee.quick_slash | 快斬 | Combo | 1 | Near | Fast | Physical | — | None | None | Starter | 1 |
| 6 | melee.double_slash | 雙重斬 | Combo | 2 | Near | Fast, MultiHit | Physical | — | None | None | Amplifier | 2 |
| 7 | melee.blade_dance | 劍刃旋舞 | Combo | 3 | Near | MultiHit, AoE | Physical | — | None | None | Amplifier | 3 |
| 8 | melee.phantom_blades | 幻影連斬 | Combo | 4 | Near | Fast, MultiHit, Burst | Physical | — | None | None | Finisher | 5 |
| 9 | melee.guard_stance | 防禦姿態 | Guard | 1 | Near | Guard | — | — | None | Shield | Defense | 0 |
| 10 | melee.shield_bash | 盾撞（衝撞） | Guard | 2 | **Mid\*** | Impact | Physical | — | **Advance\*** | Stun, Knockback | Setup | 1 |
| 11 | melee.counter | 反擊 | Guard | 3 | Near | Counter, Burst | Physical | — | None | None | Finisher | 0（傷害在觸發時計算） |
| 12 | melee.iron_will | 鋼鐵意志 | Guard | 4 | Near | Guard | — | — | None | Shield | Defense | 0 |
| 13 | ranged.quick_shot | 快速射擊 | Precision | 1 | Far | Fast, Projectile | Physical | — | None | None | Starter | 1 |
| 14 | ranged.charge_shot | 蓄力射擊 | Precision | 2 | Far | Heavy, Projectile | Physical | — | None | Knockback | Finisher | 1 |
| 15 | ranged.weak_point | 弱點射擊 | Precision | 3 | Far | Projectile | Physical | — | None | Mark | Setup | 1 |
| 16 | ranged.execution_shot | 狙殺 | Precision | 4 | Far | Heavy, Projectile, Execute | Physical | — | None | None | Finisher | 1 |
| 17 | ranged.piercing_shot | 穿透箭 | Barrage | 1 | Far | Projectile, Pierce | Physical | — | None | None | Starter | 1 |
| 18 | ranged.spread_shot | 散射 | Barrage | 2 | Far | Projectile, MultiHit, AoE | Physical | — | None | None | Amplifier | 5 |
| 19 | ranged.rapid_fire | 連射 | Barrage | 3 | Far | Fast, MultiHit, Projectile | Physical | — | None | None | Amplifier | 5 |
| 20 | ranged.rain_of_arrows | 箭雨 | Barrage | 4 | Far | AoE, MultiHit（**無 Projectile**，見 0.1） | Physical | — | None | None | Finisher | 8 |
| 21 | ranged.backstep_shot | 後跳射擊 | Mobility | 1 | Mid | Projectile | Physical | — | Retreat | None | Bridge | 1 |
| 22 | ranged.roll_shot | 翻滾射擊 | Mobility | 2 | Mid | Projectile | Physical | — | Roll, Reposition | None | Bridge | 1 |
| 23 | ranged.spin_shot | 迴旋射擊 | Mobility | 3 | Mid | Projectile, AoE, MultiHit | **Physical\*** | — | Reposition | None | Bridge | 8 |
| 24 | ranged.phantom_shot | 幻影射擊 | Mobility | 4 | Mid | Projectile, Burst | **Physical\*** | — | Reposition | None | Finisher | 2 |
| 25 | magic.fireball | 火球 | Fire | 1 | Far | Projectile, AoE | Fire | Fire | None | None | Finisher | 1 |
| 26 | magic.flame_burst | 火焰爆破 | Fire | 2 | Far | AoE, Burst | Fire | Fire | None | None | Amplifier | 1 |
| 27 | magic.firewall | 火牆 | Fire | 3 | Far | AoE, Channel | Fire | Fire | None | None | Setup | 4 |
| 28 | magic.meteor | 隕星 | Fire | 4 | Far | AoE, Heavy, Burst | Fire | Fire | None | None | Finisher | 4（爆炸 1 + 火焰區 3） |
| 29 | magic.ice_orb | 冰球 | Ice | 1 | Far | Projectile | Ice | Ice | None | Slow | Setup | 1 |
| 30 | magic.ice_lance | 冰槍 | Ice | 2 | Far | Projectile, Pierce | Ice | Ice | None | None | Finisher | 1 |
| 31 | magic.frost_nova | 冰霜新星 | Ice | 3 | Near | AoE | Ice | Ice | None | Freeze, Slow | Setup | 1 |
| 32 | magic.absolute_zero | 絕對零度 | Ice | 4 | Near | AoE, Burst | Ice | Ice | None | Freeze | Finisher | 1 |
| 33 | magic.spark | 電擊 | Lightning | 1 | Far | Projectile, Fast | Lightning | Lightning | None | None | Starter | 1 |
| 34 | magic.chain_lightning | 連鎖閃電 | Lightning | 2 | Far | MultiHit, Burst | Lightning | Lightning | None | None | Amplifier | 4 |
| 35 | magic.thunder_strike | 雷擊 | Lightning | 3 | Far | AoE, Heavy, Burst | Lightning | Lightning | None | None | Finisher | 1 |
| 36 | magic.storm_core | 雷暴 | Lightning | 4 | Far | AoE, MultiHit, Burst | Lightning | Lightning | None | None | Finisher | 6 |

### 1.3 標籤與現有技能效果不一致（Q3）

| 技能 | 標籤宣稱 | 目前實作 | 建議 |
|---|---|---|---|
| 盾撞 | Knockback | 只有暈眩，沒有擊退 | ✅ 已補擊退 1 格 |
| 冰霜新星 | Slow | 只有冰凍機率，沒有緩速 | ✅ 已補「緩速 30%，2 秒」 |
| 冰槍 | Pierce | 投射物不穿透 | ✅ 已補 `pierce: 1` |
| 毀滅重擊 | Execute | 加成條件是「目標破甲」，不是低血量處決 | ✅ 拿掉 Execute 標籤 |
| 迴旋射擊、幻影射擊 | （規格未列 Physical） | 造成武器（物理）傷害 | 已在表中補 Physical |
| 翻滾射擊 | Roll, Reposition | 朝**游標方向**翻滾（通常是朝敵人） | 若希望 Tactical Retreat（近 → 翻滾 → 遠）合理，翻滾方向應改為「遠離目標」或「垂直閃避」 |

**已加入載入時一致性檢查**（`checkComboTags`，`data/skillAnalysis.ts`）：另外檢查 `Projectile` 必須有投射物。原本的建議內容：`Knockback` 必須有擊退效果、`Pierce` 必須 `pierce > 0`、`Slow` / `Freeze` / `Stun` / `Mark` / `ArmorBreak` 必須有對應狀態、`Advance` / `Retreat` / `Roll` 必須有對應方向的位移、`MultiHit` 必須 Hits ≥ 2。標籤與效果不一致時啟動報錯，避免之後改技能忘了改標籤。

---

## 2. Range 規則

### 2.1 判定順序

1. 少於 3 格（例如第 3 格未解鎖）→ 不判定 Combo，照常施放
2. 三格是**同一個 SkillID** → `TripleSameSkill`，不給 Bonus（Rule 1）
3. Range 排列不合理 → `InvalidRange`，不給 Bonus
4. 其餘 → 進入 Rule Matching

### 2.2 不合理的排列

依第 0 節 Q2 的暫定做法，只有兩種：

| 排列 | 原因 |
|---|---|
| Near → Far → Near | 貼近 → 拉遠 → 再貼近，沒有 Mid 銜接 |
| Far → Near → Far | 遠程 → 貼身 → 又拉遠，沒有 Mid 銜接 |

規格明列的 12 種合理排列都包含在「其餘」之內。

### 2.3 Range Validation Pseudocode

```ts
function validateRange(r1: Range, r2: Range, r3: Range): 'ok' | 'invalidRange' {
  // 直接來回跳（第一、三步相同，第二步是相反端點）才不合理
  const isEnds = (a: Range, b: Range) =>
    (a === 'Near' && b === 'Far') || (a === 'Far' && b === 'Near');
  if (r1 === r3 && isEnds(r1, r2)) return 'invalidRange';
  return 'ok';
}
```

---

## 3. Combo Rule Table（16 條核心規則）

### 3.1 Priority

| Tier | 類型 | 規則 |
|---|---|---|
| 1 | Exact Secret Combo | S01、S02（另見 5.3 草案） |
| 2 | Element Escalation | R11、R12、R13 |
| 3 | Status / Setup / Execute | R03、R04、R05、R08、R15、R16 |
| 4 | Range Transition | R06、R07、R10 |
| 5 | Generic Action | R01、R02、R09、R14 |

同一次連段只啟動 **1 條** Rule。同層衝突依 Q9：條件數量多者優先，相同時編號小者優先。

### 3.2 Step 條件寫法

- `Tag` = 該步技能的 Action / Damage / Element / Movement / Control 標籤聯集中含有此標籤
- `A|B` = 含 A 或 B
- `Physical Attack` = DamageTags 含 Physical（不造成傷害的 Guard 類技能自然排除）
- `Element` = ElementTags 非空（Fire / Ice / Lightning）
- `Range:X` / `Role:X` = 限定 RangeType / ComboRole

### 3.3 規則表

目標步驟預設 **Step3**。數值為 Lv1 基準，實際值 × 目標步驟技能的 LevelFactor（第 4.3 節）。

| ID | 名稱 | Tier | Step 1 | Step 2 | Step 3 | 額外條件 | ComboModifier（目標） |
|---|---|---|---|---|---|---|---|
| R01 | Heavy Chain Finisher 重擊連鎖 | 5 | Heavy | Heavy | Projectile | — | S3：Damage +25%、ProjectileSize +25%、AoERadius +30%。第三招為火球時顯示名稱「Greater Fireball」 |
| R02 | Fast Momentum 疾風蓄勢 | 5 | Fast | Fast | Heavy | — | S3：Damage +20%、AnimationSpeed +15%、Crit +10% |
| R03 | Armor Crusher 碎甲 | 3 | ArmorBreak | Physical Attack | Heavy | — | S3：ArmorPenetration +25%、Damage +20% |
| R04 | Control Rush 控場突進 | 3 | Slow\|Freeze | Advance | Heavy\|Impact | — | S3：Damage +20%、Knockback +60%、Stagger +25%（Q5：暫不生效） |
| R05 | Elemental Weapon 元素附刃 | 3 | Element | Physical Attack | Physical Attack | — | S2：ElementDamage +15%；S3：ElementDamage +25%（元素沿用第一招） |
| R06 | Tactical Retreat 戰術撤退 | 4 | Range:Near + 有傷害 | Retreat\|Roll | Projectile | Range = Near→Mid→Far | S3：Damage +20%、ProjectileSpeed +25%、AoERadius +15% |
| R07 | Hunter Rush 獵手突襲 | 4 | Range:Far + Role:Setup | Advance | Range:Near + Role:Finisher | Range = Far→Mid→Near | S3：Damage +25%、Crit +10%；Step1 含 Mark 時 S3 再 Crit +15% |
| R08 | Marked Execution 標記處決 | 3 | Mark | MultiHit\|Heavy | Execute | — | S3：Crit +25%、Damage +25%。「Mark 不在第二招後消失」：現行 Mark 本來就不會被命中消耗，不需額外 Modifier |
| R09 | Piercing Barrage 穿透彈幕 | 5 | Pierce | MultiHit | AoE | — | S3：AoERadius +25%、ProjectileCount +1（第三招有投射物時；否則 HitCount +1）、Damage +15% |
| R10 | Momentum Strike 衝勢打擊 | 4 | Advance\|Roll\|Reposition | Physical Attack | Heavy\|Impact | — | S3：Damage +20%、Knockback +30% |
| R11 | Inferno 煉獄 | 2 | Fire | Fire | Fire | 三個 SkillID 不同 | S3：Damage +25%、Burn +25%、AoERadius +20% |
| R12 | Deep Freeze 深度凍結 | 2 | Ice | Ice | Ice | 三個 SkillID 不同 | S3：Damage +20%、FreezeChance +20（百分點，Q6）、FreezeDuration +20% |
| R13 | Storm Surge 雷湧 | 2 | Lightning | Lightning | Lightning | 三個 SkillID 不同 | S3：Damage +20%、ChainCount +1、StatusChance +15（百分點，Q5） |
| R14 | Rapid Finisher 連擊終結 | 5 | MultiHit | MultiHit | Role:Finisher | — | S3：Damage +20%、Crit +15%；Step1 + Step2 Hits ≥ 6 時 S3 再 Damage +10% |
| R15 | Guard Counterattack 守勢反擊 | 3 | Guard\|Shield | Counter\|Impact | Heavy | — | S3：Damage +25%、Stagger +20%（Q5：暫不生效）；Self（整組連段期間）：KnockbackResist |
| R16 | Elemental Execution 元素處決 | 3 | Element + (Slow\|Freeze\|Stun) | Role:Setup | Execute | — | S3：Damage +20%；S3 對 Slowed / Frozen / Marked 目標 Crit +20% |

所有規則都**不綁技能名稱**；新增技能只要標籤正確，就會自動適用。

---

## 4. ComboModifier

### 4.1 設計原則

- Modifier 只描述「對第幾步的哪個數值加多少」，**不修改技能資料**；施放時由效果讀取
- 對不適用的技能自動無效（例如 ProjectileSize 套在沒有投射物的技能上）
- 新增 Modifier 類型 = 新增一個 type 與它在效果中的讀取點；規則比對邏輯不需要改

### 4.2 Modifier 類型

| Type | 作用於 | 計算 | 隨等級縮放 |
|---|---|---|---|
| Damage | 該步所有傷害 | × (1 + v) | 是 |
| Crit | 暴擊率 | + v | 是 |
| AoERadius | 範圍 / 地面區域半徑 | × (1 + v) | 是 |
| ProjectileSize | 投射物半徑 | × (1 + v) | 是 |
| ProjectileSpeed | 投射物速度 | × (1 + v) | 是 |
| ProjectileCount | 投射物數量 | + v（整數） | 否 |
| Pierce | 穿透數 | + v（整數） | 否 |
| ArmorPenetration | 無視目標防禦比例 | + v | 是 |
| Knockback | 擊退距離 | × (1 + v) | 是 |
| Stagger | 硬直 | 保留（Q5） | 是 |
| AttackSpeed | 攻速型技能的施放時間 | ÷ (1 + v) | 是 |
| CastSpeed | 法術的施放時間 | ÷ (1 + v) | 是 |
| AnimationSpeed | 所有技能的施放時間 | ÷ (1 + v) | 是 |
| ElementDamage | 額外追加一段元素傷害 | 該擊傷害 × v，元素由參數指定 | 是 |
| Burn | 燃燒效果 | 強度與時間 × (1 + v) | 是 |
| FreezeChance | 冰凍機率 | + v（百分點） | 是 |
| FreezeDuration | 冰凍時間 | × (1 + v) | 是 |
| StatusChance | 技能附帶狀態的機率 | + v（百分點） | 是 |
| ChainCount | 連鎖跳躍次數 | + v（整數） | 否 |
| HitCount | 多段攻擊次數 | + v（整數） | 否 |
| MP | 該步魔力消耗 | × (1 + v)（負值 = 降低） | 是 |
| MovementSpeed | 該步位移距離 | × (1 + v) | 是 |
| KnockbackResist（新增） | 施放者免疫擊退 | 開關 | 否 |

### 4.3 LevelFactor

| Lv | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Factor | 1.00 | 1.10 | 1.20 | 1.30 | 1.40 |

- 縮放依據 = **目標步驟技能**的等級（Step3 → 第三招等級；AllSteps → 各步各自的等級）
- 整數類 Modifier（數量、次數、開關）不縮放
- 例：Rule 01，第三招火球 Lv5 → Damage +25% × 1.4 = **+35%**

### 4.4 資料格式（TypeScript）

```ts
type Step = 1 | 2 | 3;
type ModifierTarget = 'step1' | 'step2' | 'step3' | 'allSteps' | 'self';

interface ComboModifierDef {
  type: ModifierType;               // 4.2 表中的 Type
  value: number;                    // Lv1 基準值
  target: ModifierTarget;           // 預設 'step3'
  scalesWithLevel?: boolean;        // 預設依 4.2 表
  element?: 'fire' | 'ice' | 'lightning' | 'fromStep1'; // ElementDamage 用
  when?:                            // 條件式加成
    | { stepHasTag: { step: Step; tag: Tag } }          // R07：第一招含 Mark
    | { hitsAtLeast: { steps: Step[]; hits: number } }  // R14：前兩招 Hits ≥ 6
    | { targetHasStatus: StatusKind[] };                // R16：命中時目標狀態
}
```

---

## 5. Combo Rule 資料結構

### 5.1 Rule 定義

```ts
type Tag = ActionTag | DamageTag | ElementTag | MovementTag | ControlTag;

interface StepMatcher {
  anyTags?: Tag[];          // 含其中任一
  allTags?: Tag[];          // 全部都要有
  range?: RangeType[];
  role?: ComboRole[];
  hasDamage?: boolean;      // DamageTags 非空
  hasElement?: boolean;     // ElementTags 非空
}

interface ComboRuleDef {
  id: string;               // 'combo.heavy_chain_finisher'
  name: string;             // 顯示名稱
  tier: 1 | 2 | 3 | 4 | 5;  // Priority
  match:
    | { kind: 'exact'; skills: [string, string, string] }
    | {
        kind: 'pattern';
        steps: [StepMatcher, StepMatcher, StepMatcher];
        distinctSkills?: boolean;               // R11～R13
        sameElement?: 'fire' | 'ice' | 'lightning';
        rangePattern?: [RangeType, RangeType, RangeType]; // R06、R07
      };
  modifiers: ComboModifierDef[];
  /** 依第三招替換顯示名稱，例如 R01 + 火球 → Greater Fireball */
  displayNames?: { finalSkill: string; name: string }[];
}
```

**Specificity**（同層衝突用）= 所有 StepMatcher 的條件數 + 額外條件數（distinctSkills、sameElement、rangePattern 各 1）。

### 5.2 Exact Secret Combo

| ID | 名稱 | Skill 1 → 2 → 3 | Range | ComboModifier（S3） |
|---|---|---|---|---|
| S01 | Flame Finisher 烈焰終擊 | 重砍 → 重砍 → 火球 | Near→Near→Far | Damage +30%、AoERadius +40%、ProjectileSize +30%；顯示「Greater Fireball」 |
| S02 | Frozen Impact 冰霜重擊 | 冰球 → 盾撞（衝撞）→ 毀滅重擊 | Far→Mid→Near | Damage +30%、Knockback +80%、對 Slowed 目標 Stagger +25%（Q5） |

Exact Combo 也必須通過 Range 檢查；資料載入時若 Exact Combo 本身排列不合理，直接報錯（設計錯誤）。

### 5.3 Secret Combo 草案（待確認，未列入測試基準）

| ID | 名稱 | Skill 1 → 2 → 3 | 會蓋過的 Generic Rule | 效果草案（S3） |
|---|---|---|---|---|
| S03 | Arrow Storm 萬箭齊發 | 穿透箭 → 散射 → 箭雨 | R09 | Damage +30%、AoERadius +30%、HitCount +2 |
| S04 | Blade Tempest 刃舞風暴 | 快斬 → 雙重斬 → 幻影連斬 | — | HitCount +2、Crit +15% |
| S05 | Glacial Tomb 冰封 | 冰球 → 冰霜新星 → 絕對零度 | R12 | FreezeDuration +50%、AoERadius +30% |

---

## 6. ComboDiscovery 與 ComboCodex

### 6.1 Codex 資料結構

Codex 以「**規則 + 具體技能排列**」為單位記錄。同一條 Generic Rule 用不同技能觸發，會是不同條目（保留探索感）。

```ts
interface ComboCodexEntry {
  comboId: string;              // `${ruleId}|${skill1}>${skill2}>${skill3}`
  ruleId: string;
  comboName: string;            // 含 displayNames 替換後的名稱
  skills: [string, string, string];
  discovered: true;             // 只有已發現的才會寫入
  firstDiscoveredAt: number;    // 遊戲內時間或存檔序號
  timesUsed: number;            // 每次完整施放 +1
  effectDescription: string[];  // 發現當下由 Modifier 產生的說明文字
}

interface ComboCodex {
  entries: Record<string, ComboCodexEntry>;
}
```

- Codex 屬於存檔內容（M9），只存已發現的條目
- 未發現的組合**不存資料**；「???」是 UI 即時算出來的（見 6.3）

### 6.2 Discovery 流程

```
ComboSystem：第三招實際施放（帶 Modifier）
  → 發出 ComboCompleted { ruleId, comboId, skills, modifiers }
ComboDiscoverySystem（訂閱事件）
  → Codex 沒有此 comboId：寫入條目，發出 ComboDiscovered（UI 顯示「COMBO DISCOVERED」）
  → 已有：timesUsed + 1
```

戰鬥邏輯不讀 Codex，Codex 也不影響判定結果。

### 6.3 Loadout UI 顯示狀態

| 狀態 | 條件 | 顯示 |
|---|---|---|
| 無 Combo | 未滿 3 格、三格相同、排列不合理、或沒有規則命中 | 「—」 |
| 未發現 | 有規則命中，但 Codex 沒有此 comboId | 「???」 |
| 已發現 | Codex 有此 comboId | 名稱 + 效果說明 |

UI 只呼叫 `ComboResolver.resolve()` 取得結果，不自己判斷任何規則。

---

## 7. Pseudocode

### 7.1 ComboResolver

```ts
interface ComboResolution {
  steps: string[];                          // 照常施放的技能（永遠不變）
  status: 'none' | 'combo';
  reason?: 'tooShort' | 'tripleSame' | 'invalidRange' | 'noRule';
  rule?: ComboRuleDef;
  comboId?: string;
  displayName?: string;
  /** 已套用 LevelFactor 與條件判斷（when.targetHasStatus 除外，命中時才判斷） */
  modifiersByStep?: Record<1 | 2 | 3, ResolvedModifier[]>;
  selfModifiers?: ResolvedModifier[];
}

function resolve(skillIds: string[], ranks: Map<string, number>): ComboResolution {
  const steps = skillIds;                                   // 無論結果如何都照常施放
  if (steps.length < 3) return { steps, status: 'none', reason: 'tooShort' };

  const [a, b, c] = steps.map((id) => skillDb.comboInfo(id)); // 36 技能的標籤資料
  if (a.id === b.id && b.id === c.id) return { steps, status: 'none', reason: 'tripleSame' };
  if (validateRange(a.range, b.range, c.range) === 'invalidRange') {
    return { steps, status: 'none', reason: 'invalidRange' };
  }

  const rule = findRule([a, b, c]);
  if (!rule) return { steps, status: 'none', reason: 'noRule' };

  return {
    steps,
    status: 'combo',
    rule,
    comboId: `${rule.id}|${steps.join('>')}`,
    displayName: rule.displayNames?.find((d) => d.finalSkill === c.id)?.name ?? rule.name,
    ...buildModifiers(rule, [a, b, c], ranks),              // ComboModifierFactory
  };
}
```

### 7.2 Rule Matching

```ts
function findRule(skills: [SkillComboInfo, SkillComboInfo, SkillComboInfo]): ComboRuleDef | null {
  const candidates = ruleDb.all.filter((rule) => matches(rule, skills));
  if (candidates.length === 0) return null;
  // Tier 小者優先 → Specificity 大者優先 → 規則編號小者優先
  candidates.sort((x, y) =>
    x.tier - y.tier || specificity(y) - specificity(x) || x.order - y.order);
  return candidates[0];
}

function matches(rule: ComboRuleDef, skills: SkillComboInfo[]): boolean {
  const m = rule.match;
  if (m.kind === 'exact') return m.skills.every((id, i) => id === skills[i].id);

  if (!m.steps.every((matcher, i) => stepMatches(matcher, skills[i]))) return false;
  if (m.distinctSkills && new Set(skills.map((s) => s.id)).size !== 3) return false;
  if (m.sameElement && !skills.every((s) => s.elementTags.includes(m.sameElement))) return false;
  if (m.rangePattern && !m.rangePattern.every((r, i) => skills[i].range === r)) return false;
  return true;
}

function stepMatches(m: StepMatcher, s: SkillComboInfo): boolean {
  const tags = s.allTags;                                   // 五類標籤聯集
  if (m.anyTags && !m.anyTags.some((t) => tags.has(t))) return false;
  if (m.allTags && !m.allTags.every((t) => tags.has(t))) return false;
  if (m.range && !m.range.includes(s.range)) return false;
  if (m.role && !m.role.includes(s.role)) return false;
  if (m.hasDamage && s.damageTags.length === 0) return false;
  if (m.hasElement && s.elementTags.length === 0) return false;
  return true;
}
```

### 7.3 執行（接到現有 `ComboSystem`）

```
按 Q / W / E + 右鍵
  → PlayerController 取得該組 Loadout
  → ComboResolver.resolve(steps, ranks)
  → ComboSystem 依序送出每一步的 SkillIntent，並附上 modifiersByStep[n]
  → SkillSystem / SkillExecutor 把 Modifier 放進 EffectContext
  → 各 Effect 依 4.2 表讀取需要的 Modifier（Damage、AoERadius、ProjectileCount…）
  → 第三招施放 → ComboCompleted → ComboDiscoverySystem
```

---

## 8. 模組

| 模組 | 職責 | 位置 |
|---|---|---|
| SkillComboInfo（資料） | 36 技能的 Range / Tags / Role | `data/skills.ts` 每個技能新增 `combo` 欄位 |
| SkillTagValidator | 載入時檢查標籤與效果一致（1.3） | `data/DataRegistry.ts` |
| ComboRuleDatabase（資料） | 16 條 Rule + Secret Combo | `data/comboRules.ts` |
| ComboValidator | 2.3 的 Range 與 Triple Same 檢查（純函式） | `game/combo/` |
| ComboResolver | 7.1、7.2（純函式） | `game/combo/` |
| ComboModifierFactory | Rule → 各步 Modifier，套用 LevelFactor 與條件 | `game/combo/` |
| ComboSystem | 依序施放三招並把 Modifier 交給 SkillSystem | 既有 `game/skills/ComboSystem.ts` 擴充 |
| ComboLoadout | Q/W/E × 3 格、格子解鎖等級 | 既有 `PlayerLoadout` 擴充 |
| ComboDiscoverySystem | 監聽 `ComboCompleted`，更新 Codex | `game/combo/` |
| ComboCodex | 已發現的組合（存檔內容） | `game/combo/` |

---

## 9. 測試案例

使用第 1.2 節的標籤（含 `*` 調整）。所有案例皆為 Lv1（LevelFactor 1.0），T23 除外。

| # | 分類 | Skill 1 | Skill 2 | Skill 3 | Range | Matched Rule | Combo Name | Expected Modifier | Expected Result |
|---|---|---|---|---|---|---|---|---|---|
| T01 | Exact Secret | 重砍 | 重砍 | 火球 | N→N→F | S01（同時符合 R01） | 烈焰終擊 · 巨型火球 | S3：Damage +30%、AoE +40%、ProjSize +30% | Exact 優先於 R01；三招照常施放 |
| T02 | Generic Tag | 破甲斬 | 裂地擊 | 快速射擊 | N→N→F | R01 | Heavy Chain Finisher | S3：Damage +25%、ProjSize +25%、AoE +30%（快速射擊無範圍，AoE 無效） | 快速射擊強化 |
| T03 | Triple Same | 火球 | 火球 | 火球 | F→F→F | — | — | 無 | `tripleSame`；三發火球照常施放 |
| T04 | Triple Same | 幻影連斬 | 幻影連斬 | 幻影連斬 | N→N→N | —（若不是三連同招會符合 R14） | — | 無 | Rule 1 優先於任何規則 |
| T05 | Near-Far-Near | 重砍 | 火球 | 重砍 | N→F→N | — | — | 無 | `invalidRange`；照常施放 |
| T06 | Far-Near-Far | 火球 | 重砍 | 冰球 | F→N→F | — | — | 無 | `invalidRange`；照常施放 |
| T07 | Near-Mid-Far | 重砍 | 後跳射擊 | 火球 | N→M→F | R06 | Tactical Retreat | S3：Damage +20%、ProjSpeed +25%、AoE +15% | 火球強化 |
| T08 | Far-Mid-Near | 弱點射擊 | 盾撞 | 毀滅重擊 | F→M→N | R07（含 Mark 加成） | Hunter Rush | S3：Damage +25%、Crit +25%（10 + 15） | 需採用 Q1（盾撞 = Advance） |
| T09 | 同元素三連 | 火球 | 火焰爆破 | 隕星 | F→F→F | R11 | Inferno | S3：Damage +25%、Burn +25%、AoE +20% | 隕星強化 |
| T10 | 同元素三連 | 冰球 | 冰槍 | 冰霜新星 | F→F→N | R12 | Deep Freeze | S3：Damage +20%、FreezeChance +20 百分點、FreezeDuration +20% | 冰霜新星冰凍機率 20% → 40% |
| T11 | 同元素有重複 | 火球 | 火球 | 隕星 | F→F→F | — | — | 無 | R11 要求三個 SkillID 不同；A→A→B 合法但無規則命中 |
| T12 | 同元素三連 | 電擊 | 雷擊 | 連鎖閃電 | F→F→F | R13 | Storm Surge | S3：Damage +20%、ChainCount +1（3 → 4 次跳躍）、StatusChance +15 | 連鎖閃電強化 |
| T13 | 跨系 + Priority 衝突 | 冰球 | 盾撞 | 毀滅重擊 | F→M→N | S02（同時符合 R04、R07） | Frozen Impact | S3：Damage +30%、Knockback +80%、Stagger +25%（暫不生效） | Tier 1 蓋過 Tier 3（R04）與 Tier 4（R07）。毀滅重擊不再帶 Execute，R16 不成立 |
| T14 | 跨系 | 火球 | 快斬 | 雙重斬 | F→N→N | R05 | Elemental Weapon | S2：+15% 火焰追加傷害；S3：+25% 火焰追加傷害 | 需採用 Q2（F→N→N 合理） |
| T15 | 兩同一異 + 同層衝突 | 雙重斬 | 雙重斬 | 重砍 | N→N→N | R02（R14 同為 Tier 5，Specificity 相同，編號較小者勝） | Fast Momentum | S3：Damage +20%、AnimationSpeed +15%、Crit +10% | 前兩招 Hits 2+2 = 4，即使 R14 勝出也不會有 +10% |
| T16 | Priority 衝突（跨層） | 破甲斬 | 裂地擊 | 蓄力射擊 | N→N→F | R03（同時符合 R01） | Armor Crusher | S3：ArmorPen +25%、Damage +20% | Tier 3 蓋過 Tier 5 |
| T17 | Priority 衝突（跨層） | 連鎖閃電 | 雷暴 | 雷擊 | F→F→F | R13（同時符合 R14） | Storm Surge | S3：Damage +20%、ChainCount +1（雷擊無連鎖，無效）、StatusChance +15 | Tier 2 蓋過 Tier 5；R14 的 Hits ≥ 6 加成不生效 |
| T18 | Generic Tag | 穿透箭 | 散射 | 箭雨 | F→F→F | R09 | Piercing Barrage | S3：AoE +25%、HitCount +1（箭雨無投射物）、Damage +15% | 若日後採用草案 S03，改為 S03 |
| T19 | Mid 開頭 | 翻滾射擊 | 重砍 | 毀滅重擊 | M→N→N | R10 | Momentum Strike | S3：Damage +20%、Knockback +30%（毀滅重擊無擊退，無效） | 毀滅重擊強化 |
| T20 | 合理但無規則 | 防禦姿態 | 鋼鐵意志 | 防禦姿態 | N→N→N | — | — | 無 | `noRule`；UI 顯示「—」 |
| T21 | 未滿三格 | 重砍 | 火球 | （未解鎖） | — | — | — | 無 | `tooShort`；兩招照常施放 |
| T22 | Hits 條件加成 | 散射 | 連射 | 狙殺 | F→F→F | R14 | Rapid Finisher | S3：Damage +30%（20 + 10）、Crit +15% | 前兩招 Hits 5+5 = 10 ≥ 6 |
| T23 | LevelFactor | 破甲斬 | 裂地擊 | 火球（Lv5） | N→N→F | R01 | Greater Fireball | S3：Damage +35%、ProjSize +35%、AoE +42% | 25 / 25 / 30 × 1.4；第三招是火球，顯示名稱替換 |
| T24 | 同元素但排列不合理 | 冰霜新星 | 冰球 | 絕對零度 | N→F→N | — | — | 無 | `invalidRange` 先於規則比對，即使三個冰系且不同也不給 |
| T25 | Status Setup | 冰球 | 弱點射擊 | 狙殺 | F→F→F | R16 | Elemental Execution | S3：Damage +20%；對 Slowed / Frozen / Marked 目標 Crit +20% | 弱點射擊本身會 Mark，狙殺打到時條件成立 |
| T26 | Guard 路線 | 防禦姿態 | 盾撞 | 重砍 | N→M→N | R15 | Guard Counterattack | S3：Damage +25%；整組連段期間免疫擊退 | 盾撞同時是 Impact 與 Advance；R10 因第一招無位移不成立 |

另需的 Discovery 測試：

| # | 情境 | 預期 |
|---|---|---|
| D01 | 第一次完整施放 T01 | 發出 `ComboDiscovered`，Codex 新增條目，timesUsed = 1，UI 由「???」變成「Flame Finisher」 |
| D02 | 再次施放 T01 | 不再發出 Discovered；timesUsed = 2 |
| D03 | T01 在第二招中斷（沒有魔力） | 不寫入 Codex、不增加次數 |
| D04 | R01 以 T02 發現後，改用 T23 的排列 | T23 仍顯示「???」（Codex 以具體排列為單位） |
| D05 | 清空 Codex | 戰鬥結果（傷害、範圍）與清空前完全相同 |

---

## 10. 架構檢查

| 要求 | 是否達成 | 說明 |
|---|---|---|
| 新增 Skill 不需要修改 ComboResolver | ✅ | Resolver 只讀標籤資料；新技能填好 `combo` 欄位即可 |
| 新增 Combo Rule 不需要修改 Skill | ✅ | Rule 在 `comboRules.ts`，以標籤比對 |
| 新增 Modifier 不需要修改 Rule Match Logic | ✅ | 比對只看 `match`；Modifier 由 Factory 與各 Effect 的讀取點處理 |
| Combo Rule 完全 Data-driven | ✅ | 條件（StepMatcher）、優先序、Modifier、顯示名稱都是資料 |
| Skill Tag 完全 Data-driven | ✅ | 另加 SkillTagValidator 防止標籤與效果脫節 |
| UI 不直接寫 Combo Logic | ✅ | UI 只呼叫 `resolve()` 與讀 Codex |
| Combo Codex 不影響 Combat Logic | ✅ | Codex 只訂閱事件；D05 驗證 |
| 未知 Combo 先顯示 ??? | ✅ | 6.3 |
| 玩家可以自由嘗試所有排列 | ✅ | Loadout 不做任何限制（只限已學會的主動技能） |
| 不合理排列仍可施放 | ✅ | `resolve()` 的 `steps` 永遠是原始排列 |

需要注意的限制：

- **Modifier 要能影響效果**，前提是每個 Effect 都讀取 EffectContext 裡的 Modifier。新增一種**效果**時，要記得接上相關 Modifier（例如新的投射物類效果要讀 ProjectileSize）。建議用測試涵蓋「每種 Modifier 至少有一個效果會讀它」
- Stagger 目前沒有對應系統，相關數值會被忽略，直到加入硬直機制

---

## 11. 遷移項目（已完成）

1. 每個技能新增 `combo` 欄位（Range、各類標籤、Role）；Hits 由效果推導
2. `data/combos.ts`（`replaceStep`）改為 `data/comboRules.ts`；移除 `magic.greater_fireball` 技能（改為 S01 / R01 的 Modifier + 顯示名稱）
3. `ComboResolver` 改為 7.1～7.2；`ComboSystem` 把 `modifiersByStep` 附在每一步的 `SkillIntent`
4. `EffectContext` 新增 `mods`，各 Effect 讀取對應 Modifier；`DamageRequest` 新增 `armorPenetration`
5. 現有的 `ComboTriggered`（開始時發出）改為 `ComboCompleted`（第三招施放時發出）；`discoveredCombos` 改為 `ComboCodex`
6. `PlayerLoadout` 加入格子解鎖等級（Q7）
7. 依 1.3 修正技能效果或標籤，並加入 SkillTagValidator
