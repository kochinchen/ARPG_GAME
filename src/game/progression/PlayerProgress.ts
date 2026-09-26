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
  readonly t4Unlocked = new Set<SkillCategory>();
  /** 目前所在樓層與到過的最高樓層（測試地圖模式為 0） */
  currentFloor = 0;
  highestFloor = 0;
  private _version = 0;

  get version(): number {
    return this._version;
  }

  changed(): void {
    this._version++;
  }
}
