import type { Rng } from '../../core/Rng';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { LootTableDef } from '../../data/schema/loot';
import type { GroundContent } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import { fuse } from './FusionResolver';
import type { ItemGenerator } from './ItemGenerator';

/** 保底：高於或等於這個稀有度都算 */
const RARITY_ORDER = ['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'];
/** 魔王印記的數值：亂數的次方（越大越容易擲到低的） */
const MARK_SKEW = { shallow: 2, deep: 0.5 };
/** 融合要用到的資料 */
type FuseData = Parameters<typeof fuse>[2];

/** 掉落物散開的最大距離（Tile） */
const SCATTER_RADIUS = 1.1;

/**
 * 監聽怪物死亡與寶箱開啟，依 LootTable 擲骰並在地上生成掉落物。
 */
export class LootSystem {
  constructor(
    private readonly data: Pick<DataRegistry, 'enemies' | 'lootTables' | 'balance'> & FuseData,
    private readonly rng: Rng,
    private readonly generator: ItemGenerator,
    private readonly nav: NavGrid,
    private readonly spawn: (position: Vec2, content: GroundContent) => void,
    /** 掉落物品的等級；M7 起依樓層決定 */
    private readonly itemLevel: () => number,
    /** 樓層的 lootTier：越深黃以上越容易掉 */
    private readonly lootTier: () => number,
    private readonly floor: () => number,
    events: GameEventBus,
  ) {
    events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.defId === null || e.summoned) return;
      const table = e.miniBoss ? this.data.balance.endgame.miniBoss.lootTable : this.data.enemies.get(e.defId).lootTable;
      if (table) this.drop(table, e.position);
      if (e.elite) this.drop(this.data.balance.elite.lootTable, e.position);
      if (this.data.enemies.get(e.defId).treasure) this.dropGoldBurst(e.position);
    });
    events.on('ChestOpened', (e) => this.drop(e.lootTable, e.position));
    events.on('BossPairDefeated', (e) => this.drop(e.lootTable, e.position));
  }

  /** 擲骰但不生成（測試分布用） */
  roll(tableId: string): GroundContent[] {
    const table = this.data.lootTables.get(tableId);
    const drops: GroundContent[] = [];
    const rarityWeights = this.rarityWeights(table);
    // 越深掉越多：0 = 表上的數量，1 = 最多
    const { deeper } = table;
    const depth = deeper ? Math.min(1, Math.max(0, (this.floor() - deeper.fromFloor) / (deeper.toFloor - deeper.fromFloor))) : 0;
    const extraItems = deeper ? Math.round(deeper.extraItems * depth) : 0;
    const guaranteedItems = table.guaranteedItems + extraItems;
    for (let i = 0; i < table.rolls + extraItems; i++) {
      const kind =
        i < guaranteedItems ? 'item' : i < guaranteedItems + table.guaranteedPotions ? 'potion' : this.rng.weighted(table.entries).kind;
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
    // 隱藏魔王：其中一件換成孔數全滿的白裝
    const whiteChance = table.fullSocketWhite && deeper ? table.fullSocketWhite + (deeper.fullSocketWhite - table.fullSocketWhite) * depth : table.fullSocketWhite;
    if (whiteChance && this.rng.chance(whiteChance)) {
      const index = drops.findIndex((d) => d.kind === 'item');
      if (index >= 0) drops[index] = { kind: 'item', item: this.generator.generateFullSocketWhite(this.itemLevel()) };
    }
    // 隱藏魔王：保底稀有度（在白裝之後，白裝換第一件、保底換最後一件，不會互相蓋掉）
    if (table.atLeast) {
      const items = drops.filter((d) => d.kind === 'item');
      const lucky = items.some((d) => RARITY_ORDER.indexOf(d.item.rarity) >= RARITY_ORDER.indexOf(table.atLeast!));
      if (!lucky && items.length > 0) {
        const index = drops.lastIndexOf(items[items.length - 1]!);
        drops[index] = { kind: 'item', item: this.generator.generateOfRarity(this.itemLevel(), table.atLeast) };
      }
    }
    // 隱藏魔王：有機會多幾顆熔核
    for (const entry of table.cores) {
      if (this.rng.chance(entry.chance)) drops.push({ kind: 'core', core: this.rollCore(entry, depth) });
    }
    // 隱藏魔王：額外的金幣
    if (table.bonusGold) {
      const { amount, piles } = table.bonusGold;
      const total = Math.round(this.rng.int(amount[0], amount[1]) * (deeper ? 1 + (deeper.goldMultiplier - 1) * depth : 1));
      for (let i = 0; i < piles; i++) drops.push({ kind: 'gold', amount: Math.floor(total / piles) + (i < total % piles ? 1 : 0) });
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

  /** 純核：四件同種類走正常的融合（紫 = 三紫一黃，橘 = 四紫）；戒指、護身符不能融合，重擲。depth：0 = 最淺、1 = 最深 */
  private rollCore(entry: LootTableDef['cores'][number], depth: number) {
    const kindOf = (item: { baseId: string }) => {
      const base = this.data.items.get(item.baseId);
      return base.weaponType ?? base.slot;
    };
    const ofKind = (rarity: 'epic' | 'rare', kind: string | null) => {
      for (;;) {
        const item = this.generator.generateOfRarity(this.itemLevel(), rarity);
        const k = kindOf(item);
        if (kind ? k === kind : k !== 'ring' && k !== 'amulet') return item;
      }
    };
    const first = ofKind('epic', null);
    const kind = kindOf(first);
    const core = fuse([first, ofKind('epic', kind), ofKind('epic', kind), ofKind(entry.rarity === 'epic' ? 'rare' : 'epic', kind)], [], this.data, this.rng, this.generator.newUid());
    if (entry.mark) {
      // 越深越容易擲到高的：平均值從範圍的 1/3 升到 2/3
      const skew = MARK_SKEW.shallow + (MARK_SKEW.deep - MARK_SKEW.shallow) * depth;
      core.mark = { id: entry.mark, rolls: this.data.cores.marks.get(entry.mark).lines.map((l) => l.value[0] + (l.value[1] - l.value[0]) * this.rng.next() ** skew) };
    }
    return core;
  }

  drop(tableId: string, position: Vec2): void {
    for (const content of this.roll(tableId)) this.spawn(this.scatter(position), content);
  }

  /** 噴錢的結晶獸：金幣隨樓層增加（第 1 層 → 最後一層線性），分成幾堆噴出來 */
  private dropGoldBurst(position: Vec2): void {
    const { gold, variance, piles } = this.data.balance.goldWalker;
    const progress = Math.min(1, (this.floor() - 1) / (this.data.balance.endgame.lastFloor - 1));
    const total = Math.round((gold[0] + (gold[1] - gold[0]) * progress) * this.rng.range(1 - variance, 1 + variance));
    for (let i = 0; i < piles; i++) {
      const amount = Math.floor(total / piles) + (i < total % piles ? 1 : 0);
      this.spawn(this.scatter(position), { kind: 'gold', amount });
    }
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
