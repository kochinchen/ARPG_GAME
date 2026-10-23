import type { DataRegistry } from '../../data/DataRegistry';
import { MATERIAL_LABELS, RARITIES, RARITY_LABELS, WEAPON_TYPE_LABELS, type EquipSlot, type MaterialId, type WeaponType } from '../../data/schema/item';
import { LegendaryKindSchema, type LegendaryKind } from '../../data/schema/legendary';
import { baseIsKind } from '../../game/items/ItemGenerator';
import type { GameWorld } from '../../game/GameWorld';
import { affixLineTexts, SLOT_LABELS } from '../../game/items/ItemDescriber';
import type { ItemInstance } from '../../game/items/ItemInstance';
import { itemStats } from '../../game/items/ItemStats';
import { buyPrice, sellPrice } from '../../game/items/Pricing';
import { coreEntryView, itemEntryView, type EntryView } from './InventoryView';
import { CORE_ELEMENT_LABELS, coreExtraTexts, coreRangeText, matchBonusText } from '../../game/items/CoreDescriber';
import { coreWeaponDamage } from '../../game/items/SocketBonus';
import { coreGem, type CoreGem } from '../../render/icons/CoreIcons';
import { describeItem, STAT_LABELS } from '../../game/items/ItemDescriber';
import type { StatId } from '../../data/schema/common';
import { FUSION_KIND_LABELS, type FusionPreview } from '../../game/items/FusionResolver';

export interface ShopView {
  /** 站在商人附近（離開後 UI 自動關閉商店） */
  near: boolean;
  /** compare：同欄位目前穿著的裝備（Tooltip 並排比較） */
  stock: {
    index: number;
    entry: EntryView;
    price: number;
    affordable: boolean;
    compare: EntryView[];
  }[];
  potionPrice: number;
  /** 身上的藥水 / 攜帶上限 */
  potions: { count: number; max: number };
  gamblePrice: number;
  /** 可以賭的種類：四種武器分開，再加上防具與飾品部位 */
  gambleKinds: { kind: LegendaryKind; label: string; glyph: string }[];
  /** 賭博的稀有度機率（例：普通 15% · 魔法 56.5% …） */
  gambleOdds: string;
  /** 手上拿著的物品賣出價格（沒拿東西為 null） */
  heldSellPrice: number | null;
  /**
   * 飛昇：手上拿著的裝備換成下一階基底的預覽（沒拿裝備為 null）。
   * canAscend = false 時 note 說明原因（飾品、已是最高階、還沒到達該樓層）。
   */
  /** 飛昇格裡的裝備（沒放時為 null） */
  ascendSlot: EntryView | null;
  ascend: {
    from: string;
    to: string | null;
    fromStat: string;
    toStat: string | null;
    price: number;
    affordable: boolean;
    /** 需要的材料與持有數量 */
    materials: { label: string; need: number; have: number }[];
    canAscend: boolean;
    note: string;
  } | null;
  /** 一鍵賣出：白 / 白＋藍 / 白＋藍＋黃 的件數與總價 */
  sellTiers: { rarity: 'normal' | 'magic' | 'rare'; label: string; count: number; gold: number }[];
  /** 重鑄：飛昇格裡裝備的每一行詞綴（沒放裝備時為 null） */
  reroll: {
    lines: { index: number; text: string; strong: boolean; locked: boolean; price: number; affordable: boolean }[];
    /** 已重鑄的次數（每次都會更貴） */
    rerolls: number;
    note: string;
  } | null;
  /** 鑲嵌：鍛造格裡裝備的孔位與鑿孔費用（沒放裝備時為 null）；鑲嵌 / 取下熔核在背包自己做 */
  sockets: {
    socketable: boolean;
    limit: number;
    holes: number;
    cores: { index: number; entry: EntryView }[];
    drill: { gold: number; essence: number; affordable: boolean } | null;
    note: string;
  } | null;
  /** 融合：4 格合成區、2 格飾品區與確認面板 */
  fusion: {
    inputs: (EntryView | null)[];
    jewelry: (EntryView | null)[];
    preview: FusionPanel | null;
    /** 剛融合出的熔核（揭曉動畫） */
    result: { uid: string; gem: CoreGem; entry: EntryView; branded: boolean; brand: string | null } | null;
  };
  gold: number;
}

/** 融合確認面板（SPEC §2.5）：一定會是 / 有機會 / 部位預覽 / 提醒 / 費用 */
export interface FusionPanel {
  problems: string[];
  certain: string[];
  chance: string[];
  slots: { label: string; lines: string[] }[];
  warnings: string[];
  /** 金幣與精華（武器多付武器精華、防具多付防具精華；平手各付一半），並列持有量 */
  cost: { gold: number; haveGold: number; materials: { label: string; need: number; have: number }[] };
  canFuse: boolean;
  needsConfirm: boolean;
}

export function emptyShopView(): ShopView {
  return {
    near: false,
    stock: [],
    potionPrice: 0,
    potions: { count: 0, max: 0 },
    gamblePrice: 0,
    gambleKinds: [],
    gambleOdds: '',
    heldSellPrice: null,
    ascendSlot: null,
    ascend: null,
    sellTiers: [],
    reroll: null,
    sockets: null,
    fusion: { inputs: [], jewelry: [], preview: null, result: null },
    gold: 0,
  };
}

const GLYPHS: Record<EquipSlot, string> = {
  weapon: '劍',
  shield: '盾',
  helmet: '盔',
  armor: '甲',
  gloves: '手',
  boots: '靴',
  ring: '戒',
  amulet: '符',
};

const WEAPON_GLYPHS: Record<WeaponType, string> = { sword: '劍', axe: '斧', bow: '弓', staff: '杖' };

/** 賭博的種類：資料中有基底的才列出（新增武器類型只要加資料） */
function gambleKinds(data: DataRegistry): ShopView['gambleKinds'] {
  return LegendaryKindSchema.options
    .filter((kind) => data.items.all.some((b) => baseIsKind(b, kind)))
    .map((kind) => {
      const weapon = kind in WEAPON_GLYPHS ? (kind as WeaponType) : null;
      return weapon
        ? { kind, label: WEAPON_TYPE_LABELS[weapon], glyph: WEAPON_GLYPHS[weapon] }
        : { kind, label: SLOT_LABELS[kind as EquipSlot], glyph: GLYPHS[kind as EquipSlot] };
    });
}

function gambleOdds(data: DataRegistry): string {
  const weights = data.balance.shop.gamble.rarityWeights;
  const total = RARITIES.reduce((sum, r) => sum + (weights[r] ?? 0), 0);
  return RARITIES.filter((r) => (weights[r] ?? 0) > 0)
    .map((r) => `${RARITY_LABELS[r]} ${Number((((weights[r] ?? 0) / total) * 100).toFixed(2))}%`)
    .join(' · ');
}

/** 貨架、金幣、背包改變時重建 */
export function shopSignature(world: GameWorld): string {
  return `${world.shop.version}|${world.wallet.gold}|${world.itemsVersion}|${world.materials.version}|${world.shop.isNear()}|${world.floors.floor}|${world.progress.highestFloor}`;
}

export function buildShopView(world: GameWorld, data: DataRegistry): ShopView {
  const shop = world.shop;
  const gold = world.wallet.gold;
  const held = world.cursor.entry;
  return {
    near: shop.isNear(),
    stock: shop.stock.flatMap((item, index) => {
      if (!item) return [];
      const price = buyPrice(item, data);
      const entry = itemEntryView(item, data);
      const compare = entry.equipSlots.flatMap((slot) => {
        const equipped = world.equipment.get(slot);
        return equipped ? [itemEntryView(equipped, data)] : [];
      });
      return [{ index, entry, price, affordable: gold >= price, compare }];
    }),
    potionPrice: shop.potionPrice,
    potions: {
      count: world.potions.count,
      max: data.potions.get(data.balance.player.potionId).maxCarry,
    },
    gamblePrice: shop.gamblePrice,
    gambleKinds: gambleKinds(data),
    gambleOdds: gambleOdds(data),
    heldSellPrice: held ? sellPrice(held, data) : null,
    ascendSlot: shop.ascendSlot ? itemEntryView(shop.ascendSlot, data) : null,
    ascend: shop.ascendSlot ? ascendView(world, data, shop.ascendSlot, gold) : null,
    sellTiers: SELL_TIERS.map(({ rarity, label }) => {
      const max = RARITIES.indexOf(rarity);
      const cells = world.inventory.cells.filter((c) => c?.kind === 'item' && RARITIES.indexOf(c.item.rarity) <= max);
      return { rarity, label, count: cells.length, gold: cells.reduce((sum, c) => sum + (c ? sellPrice(c, data) : 0), 0) };
    }),
    reroll: shop.ascendSlot ? rerollView(world, data, shop.ascendSlot, gold) : null,
    sockets: shop.ascendSlot ? socketsView(world, data, shop.ascendSlot, gold) : null,
    fusion: {
      inputs: shop.fusionInputs.map((i) => (i ? itemEntryView(i, data) : null)),
      jewelry: shop.fusionJewelry.map((i) => (i ? itemEntryView(i, data) : null)),
      preview: shop.fusionInputs.some(Boolean) || shop.fusionJewelry.some(Boolean) ? fusionPanel(world, data, shop.fusionPreview(), gold) : null,
      result: shop.lastFused
        ? {
            uid: shop.lastFused.uid,
            gem: coreGem(shop.lastFused),
            entry: coreEntryView(shop.lastFused, data),
            branded: shop.lastFused.brand !== undefined,
            brand: coreExtraTexts(shop.lastFused, data).brand,
          }
        : null,
    },
    gold,
  };
}

/** 鑲嵌：鍛造格裡裝備的孔位與鑿孔費用 */
function socketsView(world: GameWorld, data: DataRegistry, item: ItemInstance, gold: number): ShopView['sockets'] {
  const info = world.shop.socketInfo(item);
  const cores = (item.sockets?.cores ?? []).map((core, index) => ({ index, entry: coreEntryView(core, data) }));
  const note = !info.socketable
    ? '只有武器、盾牌、頭盔、盔甲、手套、鞋子可以鑲嵌'
    : info.limit === 0
      ? '神話裝備不能打孔'
      : `${RARITY_LABELS[item.rarity]}裝備最多 ${info.limit} 孔。鑲嵌不用找商人：在背包拿著熔核點有空孔的裝備；右鍵裝備把熔核一顆一顆取回背包`;
  return {
    socketable: info.socketable,
    limit: info.limit,
    holes: info.holes,
    cores,
    drill: info.drill ? { ...info.drill, affordable: gold >= info.drill.gold && world.materials.get('armorEssence') >= info.drill.essence } : null,
    note,
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 融合確認面板的文字 */
function fusionPanel(world: GameWorld, data: DataRegistry, pv: FusionPreview, gold: number): FusionPanel {
  const materials = (Object.entries(pv.cost.materials) as [MaterialId, number][]).map(([id, need]) => ({ label: MATERIAL_LABELS[id], need, have: world.materials.get(id) }));
  const enough = world.materials.has(pv.cost.materials);
  const cost = { gold: pv.cost.gold, haveGold: gold, materials };
  const empty = { problems: pv.problems, certain: [], chance: [], slots: [], warnings: [], cost, canFuse: false, needsConfirm: false };
  if (pv.types.length === 0) return empty;
  const typeName = (t: string) => data.cores.types.get(t as never).name;
  const votes = (Object.entries(pv.votes) as [string, number][]).map(([k, n]) => `${FUSION_KIND_LABELS[k] ?? k} ${n}`).join('、');
  const certain = [
    `核種：${pv.mixed ? `混核（${pv.types.map(typeName).join('＋')}）` : typeName(pv.types[0]!)}（${votes}）`,
    `核階：T${pv.tier}（平均物品等級 ${Math.round(pv.avgItemLevel * 10) / 10}）`,
    `核色：${RARITY_LABELS[pv.rarity]}（權重 ${pv.weight}${pv.next ? `，距${RARITY_LABELS[pv.next.rarity]}還差 ${pv.next.gap}` : ''}）`,
    ...(pv.hasElement ? [`元素：${pv.element ? CORE_ELEMENT_LABELS[pv.element] : '隨機（火 / 冰 / 雷）'}`] : []),
    `屬性：${pv.lineCount} 條（主屬性＋${pv.lineCount - 1} 條副屬性）${pv.pure ? '・純核' : ''}`,
  ];
  const chance: string[] = [];
  if (pv.brand.candidates.length) {
    const base = `每件橘裝 ${pct(pv.brand.baseChance)}${pv.brand.jewelryBoost > 0 ? ` ＋ 飾品 ${pct(pv.brand.jewelryBoost)}` : ''}`;
    chance.push(`印記機率 ${pct(pv.brand.chance)}（${base}${pv.brand.capped ? '，已達上限' : ''}）`);
    const f = data.balance.fusion.brand.valueMultiplier;
    for (const c of pv.brand.candidates) chance.push(`可能印記：${data.legendaries.get(c.legendaryId).name}「${c.roll === undefined ? c.text : STAT_LABELS[c.text as StatId]}」× ${f}`);
  } else chance.push('沒有印記（投入橘色裝備才有機會傳入強屬性）');
  if (pv.secondary.length && pv.lineCount > 1) chance.push(`副屬性：從 ${pv.secondary.length} 條中抽 ${pv.lineCount - 1} 條，每條 ${pct(pv.secondary[0]!.chance)}`);
  chance.push(matchBonusText(data));
  const slots = pv.slots.map((s) => ({
    label: `鑲${SLOT_LABELS[s.slot]}`,
    lines: [
      // 鑲武器：依核階的武器傷害（法杖為法術強度）
      ...(s.slot === 'weapon' ? [`+${Math.round(coreWeaponDamage({ tier: pv.tier }, data.balance) * 100)}% 武器傷害（法杖：法術強度）`] : []),
      ...s.options.map((o) => o.lines.map((l) => coreRangeText(l.line, l.range, pv.element)).join(' 或 ')),
    ],
  }));
  const nameOf = (uid: string) => {
    const item = [...world.shop.fusionInputs].find((i) => i?.uid === uid);
    return item ? describeItem(item, data).name : uid;
  };
  const warnings = [...pv.warnings, ...pv.rarityCritical.map((uid) => `拿掉「${nameOf(uid)}」會降低核色`)];
  if (!enough) warnings.push('精華不足（在背包的拆解區拆裝備：武器 → 武器精華、防具 → 防具精華）');
  const canFuse = pv.problems.length === 0 && gold >= pv.cost.gold && enough;
  return { problems: pv.problems, certain, chance, slots, warnings, cost, canFuse, needsConfirm: world.shop.fusionNeedsConfirm };
}

const SELL_TIERS: { rarity: 'normal' | 'magic' | 'rare'; label: string }[] = [
  { rarity: 'normal', label: '白色' },
  { rarity: 'magic', label: '白＋藍' },
  { rarity: 'rare', label: '白＋藍＋黃' },
];

/** 重鑄預覽：每一行的文字、價格、能不能重鑄 */
function rerollView(world: GameWorld, data: DataRegistry, item: ItemInstance, gold: number): ShopView['reroll'] {
  const texts = affixLineTexts(item, data);
  const legendary = item.legendaryId !== undefined;
  const lines = world.shop.rerollLines(item).map((l) => ({ index: l.index, text: texts[l.index] ?? '', strong: l.strong, locked: l.locked, price: l.price, affordable: gold >= l.price }));
  const note =
    lines.length === 0
      ? '這件裝備沒有詞綴可以重鑄'
      : legendary
        ? '橘 / 紅裝備的特殊效果固定，只能在設計範圍內重擲固定屬性的數值'
        : '重抽一條詞綴（同一類：一般 / 強屬性），可能抽到同一條只換數值；其他詞綴不變';
  return { lines, rerolls: item.rerolls ?? 0, note };
}

/** 飛昇預覽：基底名稱與基礎攻防（已含主倍率）的前後比較 */
function ascendView(world: GameWorld, data: DataRegistry, item: ItemInstance, gold: number): ShopView['ascend'] {
  const info = world.shop.ascendInfo(item);
  const statOf = (baseId: string) => {
    const s = itemStats({ ...item, baseId }, data).baseStats;
    if (s.damageMin !== undefined) return `傷害 ${s.damageMin}–${s.damageMax ?? 0}${s.spellPower !== undefined ? `・法術強度 ${s.spellPower}` : ''}`;
    if (s.defense !== undefined) return `防禦 ${s.defense}`;
    return '';
  };
  const base = data.items.get(item.baseId);
  const note =
    info.reason === 'jewelry'
      ? '戒指與護身符沒有階級，不能飛昇'
      : info.reason === 'maxTier'
        ? '已經是最高階（第 8 階）'
        : `第 ${base.tier} 階 → 第 ${info.next!.tier} 階（名稱、詞綴、主倍率與特殊效果保留）${
            info.next!.levelReq > world.progress.level ? `。飛昇後需要等級 ${info.next!.levelReq} 才能裝備` : ''
          }`;
  return {
    from: base.name,
    to: info.next?.name ?? null,
    fromStat: statOf(item.baseId),
    toStat: info.next ? statOf(info.next.id) : null,
    price: info.price,
    // 金幣與材料都要夠
    affordable: gold >= info.price && world.materials.has(info.materials),
    materials: (Object.entries(info.materials) as [MaterialId, number][]).map(([id, need]) => ({
      label: MATERIAL_LABELS[id],
      need,
      have: world.materials.get(id),
    })),
    canAscend: info.reason === null,
    note,
  };
}
