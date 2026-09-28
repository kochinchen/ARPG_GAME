import type { Rng } from '../../core/Rng';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { LootTableDef } from '../../data/schema/loot';
import type { GroundContent } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import type { ItemGenerator } from './ItemGenerator';

/** 掉落物散開的最大距離（Tile） */
const SCATTER_RADIUS = 1.1;

/**
 * 監聽怪物死亡與寶箱開啟，依 LootTable 擲骰並在地上生成掉落物。
 */
export class LootSystem {
  constructor(
    private readonly data: Pick<DataRegistry, 'enemies' | 'lootTables' | 'balance'>,
    private readonly rng: Rng,
    private readonly generator: ItemGenerator,
    private readonly nav: NavGrid,
    private readonly spawn: (position: Vec2, content: GroundContent) => void,
    /** 掉落物品的等級；M7 起依樓層決定 */
    private readonly itemLevel: () => number,
    /** 樓層的 lootTier：越深黃以上越容易掉 */
    private readonly lootTier: () => number,
    events: GameEventBus,
  ) {
    events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.defId === null || e.summoned) return;
      const table = e.miniBoss ? this.data.balance.endgame.miniBoss.lootTable : this.data.enemies.get(e.defId).lootTable;
      if (table) this.drop(table, e.position);
      if (e.elite) this.drop(this.data.balance.elite.lootTable, e.position);
    });
    events.on('ChestOpened', (e) => this.drop(e.lootTable, e.position));
  }

  /** 擲骰但不生成（測試分布用） */
  roll(tableId: string): GroundContent[] {
    const table = this.data.lootTables.get(tableId);
    const drops: GroundContent[] = [];
    const rarityWeights = this.rarityWeights(table);
    for (let i = 0; i < table.rolls; i++) {
      const kind =
        i < table.guaranteedItems ? 'item' : i < table.guaranteedItems + table.guaranteedPotions ? 'potion' : this.rng.weighted(table.entries).kind;
      switch (kind) {
        case 'nothing':
          break;
        case 'item':
          drops.push({ kind: 'item', item: this.generator.generate(this.itemLevel(), rarityWeights) });
          break;
        case 'potion':
          drops.push({ kind: 'potion', potionId: this.data.balance.player.potionId, count: 1 });
          break;
        case 'gold':
          drops.push({ kind: 'gold', amount: this.rng.int(table.gold[0], table.gold[1]) });
          break;
      }
    }
    // 魔王：飛昇碎片
    if (table.shards && this.rng.chance(table.shards.chance)) {
      drops.push({ kind: 'material', materialId: 'ascensionShard', count: this.rng.int(table.shards.count[0], table.shards.count[1]) });
    }
    return drops;
  }

  /** 掉落表的稀有度權重 × 樓層 lootTier 的倍率（黃以上） */
  rarityWeights(table: LootTableDef): LootTableDef['rarityWeights'] {
    const bonuses = this.data.balance.loot.tierBonus;
    const bonus = bonuses[Math.min(this.lootTier(), bonuses.length) - 1]!;
    const w = table.rarityWeights;
    return {
      ...w,
      rare: w.rare * bonus.rare,
      epic: w.epic * bonus.epic,
      legendary: w.legendary * bonus.legendary,
      mythic: w.mythic * bonus.mythic,
    };
  }

  drop(tableId: string, position: Vec2): void {
    for (const content of this.roll(tableId)) this.spawn(this.scatter(position), content);
  }

  /** 在附近找一個可走的位置，讓多個掉落物不疊在一起 */
  private scatter(center: Vec2): Vec2 {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const distance = this.rng.range(0.4, SCATTER_RADIUS);
      const p = vec2(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance);
      if (this.nav.isClearAt(p, 0.2)) return p;
    }
    return center;
  }
}
