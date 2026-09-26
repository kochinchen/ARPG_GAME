import type { PotionDef } from '../../data/schema/item';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/**
 * 回復藥水：一次同時回復 HP 與 MP，只能從怪物或寶箱取得。
 */
export class PotionBelt {
  private cooldown = 0;

  constructor(
    private readonly player: Actor,
    private readonly potion: PotionDef,
    private readonly events: GameEventBus,
    public count: number,
  ) {}

  get max(): number {
    return this.potion.maxStack;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** 回傳是否成功使用 */
  use(): boolean {
    const player = this.player;
    if (!player.alive || this.count <= 0 || this.cooldown > 0) return false;
    // HP 與 MP 都滿時不浪費藥水
    if (player.hp >= player.maxHp && player.mana >= player.maxMana) return false;
    const hpBefore = player.hp;
    const mpBefore = player.mana;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * this.potion.hpPct);
    player.mana = Math.min(player.maxMana, player.mana + player.maxMana * this.potion.mpPct);
    this.count--;
    this.cooldown = this.potion.cooldown;
    this.events.emit('PotionUsed', {
      hpRestored: player.hp - hpBefore,
      mpRestored: player.mana - mpBefore,
      remaining: this.count,
    });
    return true;
  }

  /** 撿到藥水；回傳實際放入的數量（達上限時不撿） */
  add(amount: number): number {
    const added = Math.min(amount, this.potion.maxStack - this.count);
    this.count += added;
    return added;
  }
}
