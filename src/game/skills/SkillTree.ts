import type { DataRegistry } from '../../data/DataRegistry';
import type { SkillCategory, SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { PlayerProgress } from '../progression/PlayerProgress';
import {
  checkLearn,
  checkUnlockT4,
  masteryAchieved,
  SkillTreeIndex,
  type LearnCheck,
  type TreeRules,
  type TreeState,
  type UnlockCheck,
} from './MasteryRule';

/**
 * 玩家的技能樹：學習 / 升級技能、開通其他類別的 T4。規則判斷交給 MasteryRule。
 */
export class SkillTree {
  readonly index: SkillTreeIndex;
  private readonly rules: TreeRules;

  constructor(
    private readonly player: Actor,
    private readonly progress: PlayerProgress,
    private readonly data: Pick<DataRegistry, 'skills' | 'balance'>,
    private readonly events: GameEventBus,
  ) {
    this.index = new SkillTreeIndex(data.skills.all);
    this.rules = { maxSkillRank: data.balance.maxSkillRank, tierLevelReq: data.balance.tierLevelReq };
  }

  get state(): TreeState {
    const p = this.progress;
    return { level: p.level, ranks: this.player.skillRanks, skillPoints: p.skillPoints, t4Charges: p.t4Charges, t4Unlocked: p.t4Unlocked };
  }

  get mastery(): boolean {
    return masteryAchieved(this.state, this.index);
  }

  rank(skillId: string): number {
    return this.player.skillRanks.get(skillId) ?? 0;
  }

  check(skill: SkillDef): LearnCheck {
    return checkLearn(this.state, this.rules, this.index, skill);
  }

  checkUnlock(category: SkillCategory): UnlockCheck {
    return checkUnlockT4(this.state, this.index, category);
  }

  /** 學習或升級一級；回傳是否成功 */
  learn(skillId: string): boolean {
    if (!this.data.skills.has(skillId)) return false;
    const skill = this.data.skills.get(skillId);
    if (!this.check(skill).ok) return false;

    const hadMastery = this.mastery;
    const rank = this.rank(skillId) + 1;
    this.player.skillRanks.set(skillId, rank);
    this.progress.skillPoints--;
    this.progress.changed();
    this.events.emit('SkillLearned', { skillId, rank });
    if (!hadMastery && this.mastery) this.events.emit('MasteryAchieved', { category: skill.tree!.category });
    return true;
  }

  /** 花一次開通次數打開某類別的 T4 */
  unlockT4(category: SkillCategory): boolean {
    if (!this.checkUnlock(category).ok) return false;
    this.progress.t4Charges--;
    this.progress.t4Unlocked.add(category);
    this.progress.changed();
    this.events.emit('T4CategoryUnlocked', { category });
    return true;
  }
}
