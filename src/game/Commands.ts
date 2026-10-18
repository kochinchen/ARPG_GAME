import type { ComboKey } from './player/PlayerLoadout';
import type { Vec2 } from '../core/math/Vec2';
import type { ActorId } from './entities/Actor';
import type { SkillCategory } from '../data/schema/skill';
import type { EquipmentSlot } from './items/ItemInstance';
import type { EquipSlot } from '../data/schema/item';
import type { LegendaryKind } from '../data/schema/legendary';

/**
 * Input / UI 能對遊戲送出的所有指令。
 * 送出者只描述「玩家想做什麼」，由 game 內的系統決定實際結果。
 *
 * targetId：畫面層判斷游標下的角色（角色有高度，點到頭或身體都算），
 * 由 game 再驗證是否為合法目標。
 * interactId：游標下的地上物品或寶箱（優先於角色）。
 */
export type GameCommand =
  /** 左鍵按下（held=false）或按住期間的重複送出（held=true） */
  | {
      type: 'PrimaryAction';
      worldPos: Vec2;
      targetId: ActorId | null;
      interactId?: number | null;
      held: boolean;
      /** 按住 Shift：原地朝游標施放左鍵技能，不移動 */
      standStill?: boolean;
    }
  /** 左鍵放開 */
  | { type: 'PrimaryRelease' }
  /** 右鍵：依序施放目前選中的 Q / W / E 連段 */
  | { type: 'CastRight'; worldPos: Vec2; targetId: ActorId | null; standStill?: boolean }
  /** 觸控搖桿：朝 World 方向持續移動（dir 不必是單位向量）；null = 放開搖桿、停下 */
  | { type: 'MoveDirection'; dir: Vec2 | null }
  /** 觸控攻擊鈕：自動瞄準最近的敵人施放左鍵技能（held 同 PrimaryAction）；放開送 PrimaryRelease */
  | { type: 'AutoAttack'; held: boolean }
  /** 觸控招式鈕：自動瞄準最近的敵人施放目前的 Q / W / E 連段 */
  | { type: 'AutoCastRight' }
  /** Q / W / E：選擇右鍵要施放的連段 */
  | { type: 'SelectRightSlot'; slot: ComboKey }
  /** Space：同時回復 HP 與 MP */
  | { type: 'UsePotion' }
  /** 背包格：手上沒東西 → 拿起；有東西 → 放下（互換 / 合併） */
  | { type: 'InventoryClick'; cell: number }
  /** 裝備欄：手上沒東西 → 拿起；有東西 → 穿上（互換） */
  | { type: 'EquipmentClick'; slot: EquipmentSlot }
  /** 技能樹：學習或升級一級 */
  | { type: 'LearnSkill'; skillId: string }
  /** 技能樹：花一次開通次數打開某類別的 T4 */
  | { type: 'UnlockT4'; category: SkillCategory }
  /** 把已學會的主動技能指定到左鍵 */
  | { type: 'AssignLeft'; skillId: string }
  /** 設定 Q / W / E 連段的某一步（null = 清空） */
  | { type: 'SetComboSlot'; combo: ComboKey; step: 0 | 1 | 2; skillId: string | null }
  /** 設定 Support 欄位（null = 卸下） */
  | { type: 'SetSupportSlot'; slot: 0 | 1 | 2; skillId: string | null }
  /** 角色面板：把屬性點加到某個屬性（count 點，不足時加到用完為止） */
  | { type: 'AllocateAttribute'; attribute: string; count: number }
  /** 背包「整理」：依裝備類別、物品等級（高到低）排列，藥水合併放最後 */
  | { type: 'SortInventory' }
  /** 洗點：花金幣重置技能點 / 屬性點（費用隨等級提高） */
  | { type: 'Respec'; kind: 'skills' | 'attributes' }
  /** 商人：購買第 index 件販賣物品 */
  | { type: 'ShopBuy'; index: number }
  /** 商人：購買藥水 */
  | { type: 'ShopBuyPotion'; count: number }
  /** 商人：賣出背包某一格 */
  | { type: 'ShopSell'; cell: number }
  /** 商人：賣出手上拿著的物品 */
  | { type: 'ShopSellHeld' }
  /** 商人：賣出背包裡所有普通（白色）物品 */
  | { type: 'ShopSellUpTo'; rarity: 'normal' | 'magic' | 'rare' }
  /** 商人：賭博，指定裝備種類（劍 / 斧 / 弓 / 法杖、防具與飾品部位） */
  | { type: 'ShopGamble'; kind: LegendaryKind }
  /** 拆解區：點格子（放下 / 互換 / 拿起） */
  | { type: 'SalvageClick'; slot: number }
  /** 拆解區：拆掉所有格子裡的裝備 */
  | { type: 'SalvageAll' }
  /** 商人：點飛昇格（放進 / 互換 / 拿回） */
  | { type: 'ShopAscendSlotClick' }
  /** 商人：飛昇飛昇格裡的裝備（基底升一階，結果留在飛昇格） */
  | { type: 'ShopAscend' }
  /** 商人面板關閉（按 ×、Esc、離開商人、開其他面板）：鍛造格裡的裝備放回背包 */
  | { type: 'ShopClosed' }
  /** 商人：重鑄飛昇格裡裝備的第 index 行詞綴 */
  | { type: 'ShopReroll'; index: number }
  /** 商人：鍛造格裡的裝備鑿一個孔（v0.5.0） */
  | { type: 'ShopDrill' }
  /** 商人：把背包第 cell 格的熔核鑲進鍛造格裡裝備的空孔 */
  | { type: 'ShopInsertCore'; cell: number }
  /** 商人：拆下鍛造格裡裝備的第 index 顆熔核（熔核毀掉、孔保留） */
  | { type: 'ShopRemoveCore'; index: number }
  /** 商人：點融合格（合成區 = 武器、飾品區 = 戒指 / 護身符）：放進 / 互換 / 拿回 */
  | { type: 'ShopFusionSlotClick'; zone: 'inputs' | 'jewelry'; index: number }
  /** 商人：融合；有傳奇 / 神話投入時要 confirm（介面先二次確認） */
  | { type: 'ShopFuse'; confirm: boolean }
  /** 離開樓層確認對話框按「確定」（地上還有稀有以上物品時才會詢問） */
  | { type: 'ConfirmLeaveFloor'; direction: 'down' | 'up' }
  /** 確認進入極限挑戰（第 31 層，之後回不到 1～30 層） */
  | { type: 'ConfirmEnterChallenge' }
  /** 開發用：直接升一級（只有 dev 版的 Input 會送出） */
  | { type: 'DebugLevelUp' }
  /** 開發用：在玩家周圍生成寶箱 */
  | { type: 'DebugSpawnChests'; count: number }
  /** 開發用：不需清怪，直接前往下一層 */
  | { type: 'DebugNextFloor' }
  /** 開發用：在玩家周圍掉落每種稀有度各一件裝備（檢查光柱、名稱與光芒） */
  | { type: 'DebugSpawnLoot'; uniques?: boolean };

export type GameCommandType = GameCommand['type'];
