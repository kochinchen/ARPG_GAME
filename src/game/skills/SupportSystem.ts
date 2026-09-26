import type { DataTable } from '../../data/DataRegistry';
import { rankValue } from '../../data/schema/common';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { PlayerLoadout } from '../player/PlayerLoadout';

/**
 * 常駐被動（Support）：只有裝備中的 Support 會生效，依技能等級加成屬性。
 * 裝備或等級改變時重新套用。
 */
export class SupportSystem {
  private signature = '';
  private applied: string[] = [];

  constructor(
    private readonly player: Actor,
    private readonly loadout: PlayerLoadout,
    private readonly skills: DataTable<SkillDef>,
  ) {}

  update(): void {
    const equipped = this.loadout.supports.filter((id): id is string => id !== null && (this.player.skillRanks.get(id) ?? 0) > 0);
    const signature = equipped.map((id) => `${id}:${this.player.skillRanks.get(id)}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;

    for (const source of this.applied) this.player.stats.removeBySource(source);
    this.applied = [];
    for (const id of equipped) {
      const skill = this.skills.get(id);
      const rank = this.player.skillRanks.get(id) ?? 1;
      const source = `support:${id}`;
      for (const bonus of skill.passive) {
        this.player.stats.addModifier({ stat: bonus.stat, kind: bonus.modifier, value: rankValue(bonus.values, rank), source });
      }
      this.applied.push(source);
    }
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.player.mana = Math.min(this.player.mana, this.player.maxMana);
  }
}
