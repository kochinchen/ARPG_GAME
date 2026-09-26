import type { DataRegistry } from '../../data/DataRegistry';
import type { AttributeDef } from '../../data/schema/balance';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { PlayerProgress } from './PlayerProgress';

/** 屬性加成在 StatBlock 中的來源 */
const SOURCE = 'attributes';

export type AllocateCheck = { ok: true } | { ok: false; reason: 'unknown' | 'noPoints' | 'maxPoints' };

/**
 * 屬性點：每升一級得到固定點數，自由加到攻擊 / 生命 / 魔力 / 防禦 / 暴擊等項目（定義在 balance.attributes）。
 * 分配後不能退回（與 Diablo 相同）。加成以 flat Modifier 套用，存檔只存點數。
 */
export class AttributeSystem {
  constructor(
    private readonly player: Actor,
    private readonly progress: PlayerProgress,
    private readonly data: Pick<DataRegistry, 'balance'>,
    private readonly events: GameEventBus,
  ) {}

  get defs(): readonly AttributeDef[] {
    return this.data.balance.attributes.list;
  }

  points(id: string): number {
    return this.progress.attributes.get(id) ?? 0;
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
    for (const def of this.defs) {
      const points = this.points(def.id);
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
