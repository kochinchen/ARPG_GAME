import type { DataRegistry } from '../../data/DataRegistry';
import type { AttributeDef } from '../../data/schema/balance';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { PlayerProgress } from './PlayerProgress';

/** 屬性加成在 StatBlock 中的來源 */
const SOURCE = 'attributes';

/** 一招每升一級給的屬性（屬性 id → 點數）；不在技能樹上的招式沒有 */
export function skillGrantOf(skill: SkillDef, data: Pick<DataRegistry, 'balance'>): Record<string, number> {
  const { list, skillGrants } = data.balance.attributes;
  const grant = skill.tree ? skillGrants[skill.tree.category]?.[skill.tree.branch]?.[skill.tree.tier - 1] : undefined;
  const out: Record<string, number> = {};
  grant?.forEach((n, i) => {
    if (n > 0) out[list[i]!.id] = n;
  });
  return out;
}

/** 依技能等級算出各屬性的點數（屬性 id → 點數） */
export function skillAttributePoints(rankOf: (skillId: string) => number, data: Pick<DataRegistry, 'balance' | 'skills'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const skill of data.skills.all) {
    const rank = skill.tree ? rankOf(skill.id) : 0;
    if (rank <= 0) continue;
    for (const [id, n] of Object.entries(skillGrantOf(skill, data))) out[id] = (out[id] ?? 0) + n * rank;
  }
  return out;
}

/** 目前進度應得的自由點數總和（不含升級給的；存檔修復與補發用） */
export function earnedFreePoints(
  state: { highestFloor: number; souls: ReadonlySet<string>; hiddenKills: ReadonlySet<number>; bookComplete: boolean },
  data: Pick<DataRegistry, 'balance' | 'souls'>,
): number {
  const f = data.balance.attributes.freePoints;
  const bosses = data.souls.all.filter((s) => f.bossFloors.includes(s.floor) && state.souls.has(s.id)).length;
  return (
    f.perFloor * Math.max(0, state.highestFloor - 1) +
    f.boss * bosses +
    f.hiddenBoss * state.hiddenKills.size +
    (state.bookComplete ? data.balance.book.attributePoints : 0)
  );
}

export type AllocateCheck = { ok: true } | { ok: false; reason: 'unknown' | 'noPoints' | 'maxPoints' };

/**
 * 屬性點（攻擊 / 生命 / 魔力 / 防禦 / 暴擊，定義在 balance.attributes）有兩個來源：
 * - 技能：每招每升一級給固定的幾點（skillGrants，設計者 2026-11-21）；跟著技能等級走，不存檔。
 * - 自由點數：《井誌》等獎勵給的，玩家自己分配（存檔只存這部分的點數）。
 * 加成以 flat Modifier 套用。
 */
export class AttributeSystem {
  constructor(
    private readonly player: Actor,
    private readonly progress: PlayerProgress,
    private readonly data: Pick<DataRegistry, 'balance' | 'skills'>,
    private readonly events: GameEventBus,
  ) {
    // 技能等級變了（學習、升級、洗點）：技能給的屬性跟著變
    events.on('SkillLearned', () => this.apply());
    events.on('Respec', (e) => {
      if (e.kind === 'skills') this.apply();
    });
  }

  get defs(): readonly AttributeDef[] {
    return this.data.balance.attributes.list;
  }

  /** 自己分配的自由點數 */
  points(id: string): number {
    return this.progress.attributes.get(id) ?? 0;
  }

  /** 技能等級給的點數 */
  fromSkills(id: string): number {
    return skillAttributePoints((skillId) => this.player.skillRanks.get(skillId) ?? 0, this.data)[id] ?? 0;
  }

  /** 實際生效的點數 = 自由分配＋技能 */
  total(id: string): number {
    return this.points(id) + this.fromSkills(id);
  }

  check(id: string): AllocateCheck {
    const def = this.defs.find((d) => d.id === id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.progress.attributePoints <= 0) return { ok: false, reason: 'noPoints' };
    if (def.maxPoints !== undefined && this.points(id) >= def.maxPoints) return { ok: false, reason: 'maxPoints' };
    return { ok: true };
  }

  /** 加 count 點（點數不足或到達上限時加到能加的為止）；回傳實際加了幾點 */
  allocate(id: string, count = 1): number {
    if (!this.check(id).ok) return 0;
    const def = this.defs.find((d) => d.id === id)!;
    const room = def.maxPoints === undefined ? Infinity : def.maxPoints - this.points(id);
    const added = Math.max(0, Math.min(Math.floor(count), this.progress.attributePoints, room));
    if (added === 0) return 0;
    this.progress.attributePoints -= added;
    this.progress.attributes.set(id, this.points(id) + added);
    this.apply();
    this.progress.changed();
    this.events.emit('AttributeAllocated', { attribute: id, points: this.points(id) });
    return added;
  }

  /**
   * 依目前點數重新套用加成。上限提高時目前 HP / MP 一起增加（加生命立刻有感），
   * 上限降低時（讀檔修復）限制在新上限內。
   */
  apply(): void {
    const player = this.player;
    const maxHp = player.maxHp;
    const maxMana = player.maxMana;
    player.stats.removeBySource(SOURCE);
    const skills = skillAttributePoints((skillId) => player.skillRanks.get(skillId) ?? 0, this.data);
    for (const def of this.defs) {
      const points = this.points(def.id) + (skills[def.id] ?? 0);
      if (points === 0) continue;
      for (const effect of def.effects) {
        player.stats.addModifier({ stat: effect.stat, kind: 'flat', value: points * effect.perPoint, source: SOURCE });
      }
    }
    if (player.alive) {
      player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - maxHp));
      player.mana = Math.min(player.maxMana, player.mana + Math.max(0, player.maxMana - maxMana));
    }
  }
}
