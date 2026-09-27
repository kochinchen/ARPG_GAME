import type { PotionDef } from '../../data/schema/item';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { Inventory } from '../items/Inventory';

/**
 * 喝藥水（Space）：從背包裡的藥水疊取一瓶，同時回復 HP 與 MP。
 * 藥水只能從怪物或寶箱取得，存放在背包（每 20 瓶一疊，可以有很多疊）。
 */
export class PotionBelt {
  private cooldown = 0;

  constructor(
    private readonly player: Actor,
    private readonly potion: PotionDef,
    private readonly inventory: Inventory,
    private readonly events: GameEventBus,
  ) {}

  get potionId(): string {
    return this.potion.id;
  }

  /** 背包內此種藥水的總數 */
  get count(): number {
    return this.inventory.potionCount(this.potion.id);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** 回傳是否成功使用 */
  use(): boolean {
    const player = this.player;
    if (!player.alive || this.cooldown > 0) return false;
    // HP 與 MP 都滿時不浪費藥水
    if (player.hp >= player.maxHp && player.mana >= player.maxMana) return false;
    if (!this.inventory.takePotion(this.potion.id)) return false;
    const hpBefore = player.hp;
    const mpBefore = player.mana;
    // 藥水效果（裝備詞綴）提高回復量
    const effect = 1 + player.stats.get('potionEffect');
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * this.potion.hpPct * effect);
    player.mana = Math.min(player.maxMana, player.mana + player.maxMana * this.potion.mpPct * effect);
    this.cooldown = this.potion.cooldown;
    this.events.emit('PotionUsed', {
      hpRestored: player.hp - hpBefore,
      mpRestored: player.mana - mpBefore,
      remaining: this.count,
    });
    return true;
  }
}
