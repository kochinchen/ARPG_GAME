import type { SkillCategory } from '../../data/schema/skill';

/**
 * 角色成長狀態（存檔內容）：等級、經驗、未使用的技能點與 T4 開通次數、已開通的類別。
 * 技能等級存在 Actor.skillRanks。
 */
export class PlayerProgress {
  level = 1;
  /** 本級已累積的經驗 */
  xp = 0;
  skillPoints = 0;
  t4Charges = 0;
  /** 尚未分配的屬性點 */
  attributePoints = 0;
  /** 已分配的屬性點（屬性 ID → 點數） */
  readonly attributes = new Map<string, number>();
  readonly t4Unlocked = new Set<SkillCategory>();
  /** 怪物圖鑑：已擊敗過的怪物（EnemyDef ID → 擊敗次數） */
  readonly bestiary = new Map<string, number>();
  /** 裝備圖鑑：拿到過的裝備（'base:<基底 ID>'、'legendary:<傳奇 / 神話 ID>'） */
  readonly collection = new Set<string>();
  /** 目前所在樓層與到過的最高樓層（測試地圖模式為 0） */
  currentFloor = 0;
  highestFloor = 0;
  /** 已通關：擊敗第 30 層的魔王（docs/ENDGAME.md） */
  cleared = false;
  /** 已完成隱藏難關：擊敗第 35 層的深淵統御者 */
  completedHidden = false;
  private _version = 0;

  get version(): number {
    return this._version;
  }

  changed(): void {
    this._version++;
  }
}
