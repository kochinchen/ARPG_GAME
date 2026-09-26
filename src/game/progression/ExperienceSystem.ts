import type { DataRegistry } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { StatId } from '../../data/schema/common';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { SkillTree } from '../skills/SkillTree';
import type { TargetingService } from '../targeting/TargetingService';
import type { PlayerProgress } from './PlayerProgress';

/** 從 level 升到 level + 1 所需經驗 */
export function xpToNext(level: number, balance: Pick<Balance, 'xpCurve'>): number {
  return Math.round(balance.xpCurve.base * level ** balance.xpCurve.exponent);
}

/**
 * 監聽敵人死亡給經驗；升級時給技能點、Mastery 後再給 T4 開通次數，並成長基礎屬性。
 */
export class ExperienceSystem {
  constructor(
    private readonly player: Actor,
    private readonly progress: PlayerProgress,
    private readonly skillTree: SkillTree,
    private readonly data: Pick<DataRegistry, 'balance'>,
    private readonly events: GameEventBus,
    targeting: TargetingService,
  ) {
    events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.killerId === null) return;
      // 玩家或召喚物擊殺才有經驗
      const killer = targeting.getActor(e.killerId);
      if (!killer || killer.faction === 'enemy') return;
      this.addXp(e.xp);
    });
  }

  get xpForNextLevel(): number {
    return xpToNext(this.progress.level, this.data.balance);
  }

  addXp(amount: number): void {
    if (amount <= 0) return;
    const p = this.progress;
    const maxLevel = this.data.balance.maxLevel;
    if (p.level >= maxLevel) return;
    p.xp += amount;
    this.events.emit('XpGained', { amount });
    while (p.level < maxLevel && p.xp >= this.xpForNextLevel) {
      p.xp -= this.xpForNextLevel;
      this.levelUp();
    }
    if (p.level >= maxLevel) p.xp = 0;
    p.changed();
  }

  /**
   * 讀檔：從 Lv1 的新角色還原到指定等級。只套用每級的基礎屬性成長；
   * 技能點、T4 開通次數由存檔直接還原（不重新發放），也不發出升級事件。
   */
  restore(level: number, xp: number): void {
    if (this.progress.level !== 1) throw new Error('restore() must be called on a new character');
    const { balance } = this.data;
    for (const [stat, value] of Object.entries(balance.statsPerLevel) as [StatId, number][]) {
      this.player.stats.setBase(stat, this.player.stats.getBase(stat) + value * (level - 1));
    }
    this.progress.level = level;
    this.progress.xp = xp;
  }

  /** 直接升一級（開發測試用） */
  grantLevel(): void {
    this.addXp(this.xpForNextLevel - this.progress.xp);
  }

  private levelUp(): void {
    const { balance } = this.data;
    const p = this.progress;
    p.level++;
    p.skillPoints += balance.skillPointsPerLevel;
    // Mastery 後，每升一級得到 T4 開通次數
    if (this.skillTree.mastery) p.t4Charges += balance.t4UnlockChargesPerLevel;
    for (const [stat, value] of Object.entries(balance.statsPerLevel) as [StatId, number][]) {
      this.player.stats.setBase(stat, this.player.stats.getBase(stat) + value);
    }
    this.events.emit('PlayerLeveledUp', { level: p.level });
  }
}
