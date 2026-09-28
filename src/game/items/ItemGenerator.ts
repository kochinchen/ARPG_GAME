import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import { AFFIX_COUNT, RARITIES, STRONG_COUNT, type AffixDef, type EquipSlot, type ItemBaseDef, type Rarity } from '../../data/schema/item';
import type { LegendaryDef, LegendaryKind } from '../../data/schema/legendary';
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
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'balance' | 'legendaries'>,
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
    return this.create(this.baseFor(this.rng.pick(this.basesFor(itemLevel)), rarity, itemLevel), rarity, itemLevel);
  }

  /**
   * 指定裝備種類（賭博）：劍 / 斧 / 弓 / 法杖、各防具與飾品部位；'weapon' = 任一種武器。
   * 從該種類中等級需求符合的基底抽一件；傳奇 / 神話也只從同種類的設計挑（沒有時降一級）。
   */
  generateForKind(kind: LegendaryKind | EquipSlot, itemLevel: number, rarityWeights: LootTableDef['rarityWeights']): ItemInstance | null {
    const bases = this.basesFor(itemLevel).filter((b) => baseIsKind(b, kind));
    if (bases.length === 0) return null;
    const rarity = this.rollRarity(rarityWeights);
    return this.create(this.baseFor(this.rng.pick(bases), rarity, itemLevel), rarity, itemLevel, true);
  }

  /** 可以掉落的基底：等級需求 ≤ 物品等級，且不低於物品等級 − BASE_LEVEL_WINDOW（每個部位至少保留最高的一種） */
  private basesFor(itemLevel: number): ItemBaseDef[] {
    const eligible = this.data.items.all.filter((b) => b.levelReq <= itemLevel);
    if (eligible.length === 0) throw new Error(`no item base for itemLevel ${itemLevel}`);
    const floor = itemLevel - BASE_LEVEL_WINDOW;
    return eligible.filter((b) => b.levelReq >= floor || !eligible.some((o) => o.slot === b.slot && (o.weaponType ?? '') === (b.weaponType ?? '') && o.levelReq > b.levelReq));
  }

  /** 紫裝換成偏態分布的階級；橘 / 紅在 createLegendary 挑基底，白～黃維持原本的基底 */
  private baseFor(base: ItemBaseDef, rarity: Rarity, itemLevel: number): ItemBaseDef {
    return rarity === 'epic' ? this.tieredBase(base, itemLevel) : base;
  }

  /**
   * 紫 / 橘 / 紅的基底階級：同種類中「樓層階」（等級需求 ≤ 物品等級的最高階）加上依權重抽的偏移，
   * 限制在 T1～最高階。可能高於玩家等級（先收著，升級後才能穿）或低於樓層（靠飛昇跟上）。飾品沒有階級，不變。
   */
  private tieredBase(base: ItemBaseDef, itemLevel: number): ItemBaseDef {
    if (base.tier === undefined) return base;
    const kind = this.data.items.all.filter((b) => b.tier !== undefined && b.slot === base.slot && b.weaponType === base.weaponType);
    const tiers = kind.map((b) => b.tier!);
    const floorTier = Math.max(Math.min(...tiers), ...kind.filter((b) => b.levelReq <= itemLevel).map((b) => b.tier!));
    const { offsets, weights } = this.data.balance.loot.highRarityTier;
    const { offset } = this.rng.weighted(offsets.map((offset, i) => ({ offset, weight: weights[i]! })));
    const tier = Math.min(Math.max(floorTier + offset, Math.min(...tiers)), Math.max(...tiers));
    return kind.find((b) => b.tier === tier) ?? base;
  }

  /** 取一個新的 uid（商人販賣的物品在購買時換成主產生器的 uid，避免重複） */
  newUid(): string {
    return this.nextUid();
  }

  rollRarity(weights: LootTableDef['rarityWeights']): Rarity {
    return this.rng.weighted(RARITIES.map((rarity) => ({ rarity, weight: weights[rarity] }))).rarity;
  }

  /** sameKindOnly：傳奇 / 神話只從同種類的設計挑（賭博指定了種類） */
  create(base: ItemBaseDef, rarity: Rarity, itemLevel: number, sameKindOnly = false): ItemInstance {
    // 傳奇 / 神話：固定設計（同部位優先；該部位沒有時從全部挑）
    if (rarity === 'legendary' || rarity === 'mythic') {
      const all = this.data.legendaries.all.filter((d) => d.rarity === rarity && d.minItemLevel <= itemLevel);
      const sameKind = all.filter((d) => kindMatches(d, base));
      const pool = sameKind.length > 0 || sameKindOnly ? sameKind : all;
      if (pool.length > 0) return this.createLegendary(this.rng.weighted(pool), itemLevel);
      // 這個等級還沒有可掉落的設計（例如神話要第 10 層以上）：降一級
      return this.create(base, rarity === 'mythic' ? 'legendary' : 'epic', itemLevel, sameKindOnly);
    }
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

    // 主倍率：武器傷害（法杖為法術強度）/ 防具防禦 / 飾品所有詞綴 +X%
    const main = this.data.balance.mainRoll[mainTargetOf(base) === 'affixes' ? 'jewelry' : 'base'][rarity];
    const quality = main[1] > 0 ? Math.round(this.rng.range(main[0], main[1]) * 100) / 100 : 0;
    return { uid, baseId: base.id, rarity, itemLevel, ...(quality > 0 ? { quality } : {}), affixes };
  }

  /** 產生一件指定的傳奇 / 神話裝備：基底階級依偏態分布（樓層階 −1 ～ +2）；固定屬性在小範圍內擲骰並隨階級成長 */
  createLegendary(def: LegendaryDef, itemLevel: number): ItemInstance {
    const candidates = this.data.items.all.filter((b) => kindMatches(def, b));
    const eligible = candidates.filter((b) => b.levelReq <= itemLevel);
    // 樓層能用的最高階；有階級的（武器、防具）再依偏態分布換階
    const top = (eligible.length > 0 ? eligible : candidates).reduce((best, b) => (b.levelReq > best.levelReq ? b : best));
    const base = this.tieredBase(top, itemLevel);
    const uid = this.nextUid();
    const tier = affixTier(itemLevel, this.data.balance);
    const legendaryRolls = def.lines
      .filter((l) => l.type === 'stat')
      .map((l) => {
        const [min, max] = l.value;
        const raw = min === max ? min : this.rng.range(min, max);
        return Math.round(raw * (1 + l.growth * (tier - 1)) * 10000) / 10000;
      });
    const quality = def.main ? Math.round(this.rng.range(def.main[0], def.main[1]) * 100) / 100 : 0;
    return { uid, baseId: base.id, rarity: def.rarity, itemLevel, ...(quality > 0 ? { quality } : {}), affixes: [], legendaryId: def.id, legendaryRolls };
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

/** 傳奇設計的種類是否對應這個基底（武器看武器種類，其他看部位） */
function kindMatches(def: LegendaryDef, base: ItemBaseDef): boolean {
  return baseIsKind(base, def.kind);
}

/** 基底是否屬於某個裝備種類（武器看武器類型；'weapon' = 任一種武器） */
export function baseIsKind(base: ItemBaseDef, kind: LegendaryKind | EquipSlot): boolean {
  return base.slot === 'weapon' && kind !== 'weapon' ? base.weaponType === kind : base.slot === kind;
}
