import { gameData } from '../src/data';
import { DataRegistry } from '../src/data/DataRegistry';
import { isRangeSequenceValid } from '../src/data/schema/combo';
import { rankRange, rankValue } from '../src/data/schema/common';
import type { WeaponType } from '../src/data/schema/item';
import type { SkillCategory } from '../src/data/schema/skill';
import { SKILL_CATEGORY_LABELS, SKILL_ROUTE_LABELS } from '../src/data/skillTree';
import { defenseMitigation } from '../src/game/combat/DamagePipeline';
import { ComboResolver } from '../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../src/game/combo/ComboSkillIndex';
import { STAT_LABELS } from '../src/game/items/ItemDescriber';
import { xpToNext } from '../src/game/progression/ExperienceSystem';
import { categoriesWithT4, checkLearn, checkUnlockT4, isT4Open, masteryAchieved, SkillTreeIndex, type TreeState } from '../src/game/skills/MasteryRule';
import { describeSkill } from '../src/game/skills/SkillDescriber';
import { combatCategory, weaponDenial } from '../src/game/skills/skillCategory';
import type { Rarity } from '../src/data/schema/item';
import type { CoreElement } from '../src/data/schema/core';
import { previewFusion } from '../src/game/items/FusionResolver';
import { CORE_ELEMENT_LABELS, coreRangeText } from '../src/game/items/CoreDescriber';
import type { ItemInstance } from '../src/game/items/ItemInstance';
import { coreIcon } from '../src/render/icons/CoreIcons';
import { coreLineValue } from '../src/game/items/CoreStats';

/**
 * 角色成長模擬頁的遊戲邏輯（npm run docs:sim → release/設計文件/sim.js，全域變數 window.Sim）：
 * 與遊戲共用資料、Combo 判定、技能樹規則、技能說明與武器允許矩陣，頁面不自己重寫規則。
 */
const data = DataRegistry.load(gameData);
const profiles = new ComboSkillIndex(data.skills);
const resolver = new ComboResolver(data.comboRules, profiles, data.balance.combo.nearNearFarBonus);
const tree = new SkillTreeIndex(data.skills.all);

/** 某等級的魔力（套用類別倍率，不含裝備的魔力消耗降低） */
function manaCost(skillId: string, rank: number): number {
  const skill = data.skills.get(skillId);
  const category = combatCategory(skill);
  return rankValue(skill.cost.mana, Math.max(1, rank)) * (category ? data.balance.skillCategories[category].manaCost : 1);
}

/** 融合試算的一件投入物（武器種類或防具部位） */
interface FusionInputSpec {
  kind: string;
  rarity: Rarity;
  itemLevel: number;
  legendaryId?: string;
  /** 元素詞綴（法杖 = 附加元素傷害、頭盔 = 元素抗性；決定靈核 / 冠核的元素） */
  element?: CoreElement;
}

const ELEMENT_AFFIX: Record<CoreElement, string> = { fire: 'affix.burning', cold: 'affix.frozen', lightning: 'affix.thunder' };
const RESIST_AFFIX: Record<CoreElement, string> = { fire: 'affix.fireproof', cold: 'affix.coldproof', lightning: 'affix.grounded' };

/** v0.5.0 融合試算：用遊戲的 previewFusion（不擲骰）算出融合前面板的內容 */
function fusionPreview(inputs: FusionInputSpec[], jewelry: Rarity[]) {
  const items: ItemInstance[] = inputs.map((x, i) => ({
    uid: `in${i}`,
    baseId: data.items.all.find((b) => (b.weaponType ?? b.slot) === x.kind)!.id,
    rarity: x.rarity,
    itemLevel: Math.max(1, Math.round(x.itemLevel)),
    affixes: x.element && x.kind === 'staff' ? [{ id: ELEMENT_AFFIX[x.element], rolls: [0.08] }] : x.element && x.kind === 'helmet' ? [{ id: RESIST_AFFIX[x.element], rolls: [0.08] }] : [],
    ...(x.legendaryId ? { legendaryId: x.legendaryId } : {}),
  }));
  const ring = data.items.all.find((b) => b.slot === 'ring')!.id;
  const jewels: ItemInstance[] = jewelry.map((rarity, i) => ({ uid: `j${i}`, baseId: ring, rarity, itemLevel: 10, affixes: [] }));
  const pv = previewFusion(items, jewels, data);
  const typeName = (t: string) => data.cores.types.get(t as never).name;
  return {
    ...pv,
    typeNames: pv.types.map(typeName),
    elementLabel: pv.element ? CORE_ELEMENT_LABELS[pv.element] : null,
    brandLines: pv.brand.candidates.map((c) => ({ name: data.legendaries.get(c.legendaryId).name, text: c.roll === undefined ? c.text : STAT_LABELS[c.text as keyof typeof STAT_LABELS], chance: c.chance })),
    slotLines: pv.slots.map((s) => ({ slot: s.slot, lines: s.options.map((o) => o.lines.map((l) => coreRangeText(l.line, l.range, pv.element)).join(' 或 ')) })),
    // 副屬性池：每條在這個核階、核色的範圍（以紫裝為準）
    secondaryLines: pv.secondary.map((x) => {
      const [lo, hi] = data.balance.affixPower.rarity[pv.rarity];
      return coreRangeText(x.line, [coreLineValue(x.line, { tier: pv.tier, power: lo }, 0, data.balance), coreLineValue(x.line, { tier: pv.tier, power: hi }, 1, data.balance)], pv.element);
    }),
    icon: pv.types.length ? coreIcon({ types: pv.types as never, tier: pv.tier, rarity: pv.rarity, ...(pv.element ? { element: pv.element } : {}) }) : null,
  };
}

/** 橘 / 紅裝備（融合試算的選單；飾品以外） */
const uniqueWeapons = data.legendaries.all
  .filter((d) => d.kind !== 'ring' && d.kind !== 'amulet')
  .map((d) => ({ id: d.id, name: d.name, kind: d.kind, rarity: d.rarity, strong: d.lines.find((l) => l.strong)?.type === 'effect' ? (d.lines.find((l) => l.strong) as { text: string }).text : null }));

export const Sim = {
  balance: data.balance,
  skills: data.skills.all,
  enemies: data.enemies.all,
  items: data.items.all,
  comboRules: data.comboRules.all,
  tree,
  labels: { category: SKILL_CATEGORY_LABELS, route: SKILL_ROUTE_LABELS, stat: STAT_LABELS },
  resolve: (ids: string[], rankOf: (id: string) => number) => resolver.resolve(ids, rankOf),
  profile: (id: string) => profiles.get(id),
  checkLearn: (state: TreeState, id: string) => checkLearn(state, data.balance, tree, data.skills.get(id)),
  checkUnlockT4: (state: TreeState, category: SkillCategory) => checkUnlockT4(state, tree, category),
  masteryAchieved: (state: TreeState) => masteryAchieved(state, tree),
  isT4Open: (state: TreeState, category: SkillCategory) => isT4Open(state, tree, category),
  categoriesWithT4: (state: TreeState) => [...categoriesWithT4(state, tree)],
  describe: (id: string, rank: number) => describeSkill(data.skills.get(id), rank, manaCost(id, rank)),
  manaCost,
  category: (id: string) => combatCategory(data.skills.get(id)),
  /** v0.4.0 武器允許矩陣：拿這把武器不能用時回傳原因（空手 = 不限制） */
  weaponDenial: (id: string, weapon: WeaponType | '') => weaponDenial(data.skills.get(id), weapon || undefined, data.balance.weaponRules),
  xpToNext: (level: number) => xpToNext(level, data.balance),
  defenseMitigation,
  rankValue,
  rankRange,
  isRangeSequenceValid,
  fusionPreview,
  uniqueWeapons,
  matchBonus: data.balance.sockets.matchBonus,
  weaponDamage: data.balance.sockets.weaponDamage,
};

(globalThis as { Sim?: typeof Sim }).Sim = Sim;
