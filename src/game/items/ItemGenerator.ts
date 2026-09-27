import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import { AFFIX_COUNT, RARITIES, STRONG_COUNT, type AffixDef, type EquipSlot, type ItemBaseDef, type Rarity } from '../../data/schema/item';
import type { LootTableDef } from '../../data/schema/loot';
import type { ItemInstance } from './ItemInstance';
import { epicTheme } from './ItemNamer';
import { mainTargetOf } from './ItemStats';

/** 只掉落等級需求在物品等級往下這個範圍內的基底（深層不再掉最初級的短劍） */
const BASE_LEVEL_WINDOW = 15;

/**
 * 擲稀有度、基底、詞綴，產生 ItemInstance。同一個 Rng 狀態一定產生相同結果。
 */
export class ItemGenerator {
  private counter = 0;

  constructor(
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'balance'>,
    private readonly rng: Rng,
  ) {}

  /** 流水號（存檔用）：讀檔後從這裡接續，避免 uid 與已存在的物品重複 */
  get uidCounter(): number {
    return this.counter;
  }

  set uidCounter(value: number) {
    this.counter = value;
  }

  generate(itemLevel: number, rarityWeights: LootTableDef['rarityWeights']): ItemInstance {
    const rarity = this.rollRarity(rarityWeights);
    return this.create(this.rng.pick(this.basesFor(itemLevel)), rarity, itemLevel);
  }

  /** 指定裝備類別（賭博）：從該類別中等級需求符合的基底抽一件 */
  generateForSlot(slot: EquipSlot, itemLevel: number, rarityWeights: LootTableDef['rarityWeights']): ItemInstance | null {
    const bases = this.basesFor(itemLevel).filter((b) => b.slot === slot);
    if (bases.length === 0) return null;
    return this.create(this.rng.pick(bases), this.rollRarity(rarityWeights), itemLevel);
  }

  /** 可以掉落的基底：等級需求 ≤ 物品等級，且不低於物品等級 − BASE_LEVEL_WINDOW（每個部位至少保留最高的一種） */
  private basesFor(itemLevel: number): ItemBaseDef[] {
    const eligible = this.data.items.all.filter((b) => b.levelReq <= itemLevel);
    if (eligible.length === 0) throw new Error(`no item base for itemLevel ${itemLevel}`);
    const floor = itemLevel - BASE_LEVEL_WINDOW;
    return eligible.filter((b) => b.levelReq >= floor || !eligible.some((o) => o.slot === b.slot && (o.weaponType ?? '') === (b.weaponType ?? '') && o.levelReq > b.levelReq));
  }

  /** 取一個新的 uid（商人販賣的物品在購買時換成主產生器的 uid，避免重複） */
  newUid(): string {
    return this.nextUid();
  }

  rollRarity(weights: LootTableDef['rarityWeights']): Rarity {
    return this.rng.weighted(RARITIES.map((rarity) => ({ rarity, weight: weights[rarity] }))).rarity;
  }

  create(base: ItemBaseDef, rarity: Rarity, itemLevel: number): ItemInstance {
    const uid = this.nextUid();
    const eligible = (a: AffixDef) => !a.slots || a.slots.includes(base.slot);
    // 稀有度倍率：同一件物品的所有詞綴共用（紫 120%～150%、紅最高 300%）
    const [lo, hi] = this.data.balance.affixPower.rarity[rarity];
    const power = lo === hi ? lo : this.rng.range(lo, hi);
    const tier = affixTier(itemLevel, this.data.balance);
    const affixes: ItemInstance['affixes'] = [];
    const pick = (pool: AffixDef[], count: number) => {
      const remaining = pool.filter((a) => !affixes.some((x) => x.id === a.id));
      for (let i = 0; i < count && remaining.length > 0; i++) {
        const affix = this.rng.weighted(remaining);
        remaining.splice(remaining.indexOf(affix), 1);
        affixes.push({ id: affix.id, rolls: [this.rollValue(affix, tier, power)] });
      }
    };

    // 強屬性（紫 1、橘 2、紅 3）：紫的那一條由名稱決定，其餘從部位的強屬性池抽
    const strongCount = STRONG_COUNT[rarity];
    if (strongCount > 0) {
      if (rarity === 'epic') {
        const theme = this.data.affixes.get(epicTheme(uid, base)[1]);
        affixes.push({ id: theme.id, rolls: [this.rollValue(theme, tier, power)] });
      }
      pick(this.data.affixes.all.filter((a) => a.kind === 'strong' && eligible(a)), strongCount - affixes.length);
    }
    // 普通詞綴
    const [minAffixes, maxAffixes] = AFFIX_COUNT[rarity];
    pick(
      this.data.affixes.all.filter((a) => a.kind === 'item' && a.minItemLevel <= itemLevel && eligible(a)),
      this.rng.int(minAffixes, maxAffixes),
    );

    // 主倍率：武器傷害 / 防具防禦 / 飾品所有詞綴 +X%
    const main = this.data.balance.mainRoll[mainTargetOf(base) === 'affixes' ? 'jewelry' : 'base'][rarity];
    const quality = main[1] > 0 ? Math.round(this.rng.range(main[0], main[1]) * 100) / 100 : 0;
    return { uid, baseId: base.id, rarity, itemLevel, ...(quality > 0 ? { quality } : {}), affixes };
  }

  /** 擲一條詞綴的數值：基礎範圍 × 階級成長 × 稀有度倍率 */
  private rollValue(affix: AffixDef, tier: number, power: number): number {
    const [min, max] = affix.value;
    const scale = (1 + affix.growth * (tier - 1)) * power;
    if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(this.rng.int(min, max) * scale);
    return Math.round(this.rng.range(min, max) * scale * 10000) / 10000;
  }

  private nextUid(): string {
    this.counter++;
    return `${this.counter.toString(36)}-${this.rng.int(0, 0xffffff).toString(16).padStart(6, '0')}`;
  }
}

/** 詞綴階級：物品等級每 levelsPerTier 提高一階（T1 = 1～9 層、T2 = 10～19 層…，最高 maxTier） */
export function affixTier(itemLevel: number, balance: Pick<DataRegistry, 'balance'>['balance']): number {
  const { levelsPerTier, maxTier } = balance.affixPower;
  return Math.min(maxTier, 1 + Math.floor(itemLevel / levelsPerTier));
}
