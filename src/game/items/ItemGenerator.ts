import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import { AFFIX_COUNT, type AffixDef, type ItemBaseDef, type Rarity } from '../../data/schema/item';
import type { LootTableDef } from '../../data/schema/loot';
import type { ItemInstance } from './ItemInstance';

const RARITIES: readonly Rarity[] = ['normal', 'magic', 'rare', 'legendary'];

/**
 * 擲稀有度、基底、詞綴，產生 ItemInstance。同一個 Rng 狀態一定產生相同結果。
 */
export class ItemGenerator {
  private counter = 0;

  constructor(
    private readonly data: Pick<DataRegistry, 'items' | 'affixes'>,
    private readonly rng: Rng,
  ) {}

  generate(itemLevel: number, rarityWeights: LootTableDef['rarityWeights']): ItemInstance {
    const rarity = this.rollRarity(rarityWeights);
    const bases = this.data.items.all.filter((b) => b.levelReq <= itemLevel);
    if (bases.length === 0) throw new Error(`no item base for itemLevel ${itemLevel}`);
    return this.create(this.rng.pick(bases), rarity, itemLevel);
  }

  rollRarity(weights: LootTableDef['rarityWeights']): Rarity {
    return this.rng.weighted(RARITIES.map((rarity) => ({ rarity, weight: weights[rarity] }))).rarity;
  }

  create(base: ItemBaseDef, rarity: Rarity, itemLevel: number): ItemInstance {
    const [minAffixes, maxAffixes] = AFFIX_COUNT[rarity];
    const pool = this.data.affixes.all.filter(
      (a) => a.kind === 'item' && a.minItemLevel <= itemLevel && (!a.slots || a.slots.includes(base.slot)),
    );
    const count = Math.min(this.rng.int(minAffixes, maxAffixes), pool.length);
    const affixes: ItemInstance['affixes'] = [];
    const remaining = [...pool];
    for (let i = 0; i < count; i++) {
      const affix = this.rng.weighted(remaining);
      remaining.splice(remaining.indexOf(affix), 1);
      affixes.push({ id: affix.id, rolls: [this.rollValue(affix)] });
    }
    return { uid: this.nextUid(), baseId: base.id, rarity, itemLevel, affixes };
  }

  private rollValue(affix: AffixDef): number {
    const [min, max] = affix.value;
    if (Number.isInteger(min) && Number.isInteger(max)) return this.rng.int(min, max);
    return Math.round(this.rng.range(min, max) * 100) / 100;
  }

  private nextUid(): string {
    this.counter++;
    return `${this.counter.toString(36)}-${this.rng.int(0, 0xffffff).toString(16).padStart(6, '0')}`;
  }
}
