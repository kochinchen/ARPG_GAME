import type { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { Rarity, WeaponType } from '../../../src/data/schema/item';
import { fuse, previewFusion } from '../../../src/game/items/FusionResolver';
import { xpToNext } from '../../../src/game/progression/ExperienceSystem';
import type { CombatCategory } from '../../../src/game/skills/skillCategory';
import type { GameWorld } from '../../../src/game/GameWorld';
import type { EquipmentSlot, ItemInstance } from '../../../src/game/items/ItemInstance';
import type { ComboKey } from '../../../src/game/player/PlayerLoadout';

/**
 * 快照法的角色：第 N 層的「正常玩到這裡」的主角。
 * 等級 = 第 1～N-1 層擊殺 KILL_SHARE 的怪物所得的經驗；裝備 = 每個部位一件物品等級 N 的藍 / 黃 / 紫；
 * 技能只學自己這一系（先每招學一級再往上加），屬性點依流派比例分配。
 * 沒有傳奇、熔核、飛昇（之後的整局法再算）。
 */
export interface Build {
  id: string;
  label: string;
  category: CombatCategory;
  weapon: WeaponType;
  shield: boolean;
  /** 左鍵技能 */
  left: string;
  /** 屬性點分配比例 */
  attributes: Record<string, number>;
  /** 遠程流派：正常型會保持距離 */
  ranged: boolean;
}

export const BUILDS: readonly Build[] = [
  {
    id: 'melee',
    label: '近戰（劍盾）',
    category: 'melee',
    weapon: 'sword',
    shield: true,
    left: 'melee.heavy_slash',
    attributes: { attack: 0.45, vitality: 0.35, defense: 0.2 },
    ranged: false,
  },
  {
    id: 'ranged',
    label: '弓箭',
    category: 'ranged',
    weapon: 'bow',
    shield: false,
    left: 'ranged.quick_shot',
    attributes: { attack: 0.5, vitality: 0.3, crit: 0.2 },
    ranged: true,
  },
  {
    id: 'magic',
    label: '法術（法杖）',
    category: 'magic',
    weapon: 'staff',
    shield: false,
    left: 'magic.fireball',
    attributes: { attack: 0.45, vitality: 0.3, mana: 0.25 },
    ranged: true,
  },
];

/** 正常玩家大約打掉多少怪（出口只要求一部分，但多數人會順手清掉） */
const KILL_SHARE = 0.85;
/** 身上裝備的稀有度分布（藍 / 黃為主，偶爾紫） */
const GEAR_RARITY = { normal: 0, magic: 40, rare: 50, epic: 10, legendary: 0, mythic: 0 };

/** 各層可得的經驗（第 f 層全清）：用遊戲本身生成的怪物算，結果依世界種子固定 */
export function xpPerFloor(makeWorld: (floor: number) => GameWorld, lastFloor: number): number[] {
  const out = [0];
  for (let f = 1; f <= lastFloor; f++) {
    const world = makeWorld(f);
    out.push(world.actors.filter((a) => a.faction === 'enemy').reduce((sum, a) => sum + a.xpReward, 0));
  }
  return out;
}

/**
 * 預設角色（設計者 2026-10-30）：固定等級、每個部位一件紫裝（或橘裝）、可鑲的部位鑿滿孔並鑲滿黃核（核階依物品等級）。
 * 每件裝備上的熔核都是同一種（同核加成）：武器用自己武器的攻核，防具用該部位融合出的護核。
 */
export interface Preset {
  level: number;
  itemLevel: number;
  /** 裝備稀有度：紫（2 孔）或橘（傳奇，1 孔）；孔數 = 該稀有度的上限 */
  rarity: 'epic' | 'legendary';
}

export const PRESET: Preset = { level: 50, itemLevel: 50, rarity: 'epic' };

/** 部位 → 鑲的核種要用哪種裝備融合（四件同種類 = 純核） */
const CORE_SOURCE: Partial<Record<EquipmentSlot, (build: Build) => string>> = {
  weapon: (b) => b.weapon,
  helmet: () => 'helmet',
  armor: () => 'armor',
  gloves: () => 'gloves',
  boots: () => 'boots',
  shield: () => 'armor',
};

/** 融合一顆黃核：四件同種類的材料，挑能融出黃色的稀有度組合 */
function fuseRareCore(world: GameWorld, data: DataRegistry, kind: string, itemLevel: number, uid: string) {
  const make = (rarity: Rarity) => world.itemGenerator.generateForKind(kind as Parameters<GameWorld['itemGenerator']['generateForKind']>[0], itemLevel, { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, [rarity]: 1 })!;
  const combos: Rarity[][] = [['rare', 'rare', 'rare', 'magic'], ['rare', 'rare', 'magic', 'magic'], ['rare', 'rare', 'rare', 'rare']];
  for (const combo of combos) {
    const inputs = combo.map(make);
    if (previewFusion(inputs, [], data).rarity === 'rare') return fuse(inputs, [], data, world.rngStreams.fusion, uid);
  }
  throw new Error(`fuseRareCore: ${kind} 融不出黃核`);
}

function presetGear(world: GameWorld, data: DataRegistry, build: Build, preset: Preset, slots: [EquipmentSlot, Parameters<GameWorld['itemGenerator']['generateForKind']>[0]][]): void {
  const weights = { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, [preset.rarity]: 1 };
  let n = 0;
  for (const [slot, kind] of slots) {
    let item: ItemInstance | null = world.itemGenerator.generateForKind(kind, preset.itemLevel, weights);
    if (!item) continue;
    const source = CORE_SOURCE[slot];
    if (source) {
      const holes = data.balance.sockets.max[item.rarity];
      const cores = Array.from({ length: holes }, () => fuseRareCore(world, data, source(build), preset.itemLevel, `preset-core-${n++}`));
      item = { ...item, sockets: { max: holes, cores } };
    }
    if (world.equipment.canEquip(item, slot)) world.equipment.equipTo(slot, item);
  }
}

export function setupCharacter(world: GameWorld, data: DataRegistry, floor: number, build: Build, xpTable: readonly number[], preset?: Preset): void {
  // 等級
  if (preset) {
    while (world.progress.level < preset.level) world.experience.addXp(xpToNext(world.progress.level, data.balance));
  } else {
    world.experience.addXp(xpTable.slice(1, floor).reduce((s, v) => s + v, 0) * KILL_SHARE);
  }

  // 技能：只學這一系的技能，每輪挑目前等級最低的（同等級挑高階），能開 T4 就開
  const own = data.skills.all.filter((s) => s.tree?.category === build.category);
  const rank = (id: string) => world.player.skillRanks.get(id) ?? 0;
  for (;;) {
    if (world.progress.t4Charges > 0) world.skillTree.unlockT4(build.category);
    if (world.progress.skillPoints <= 0) break;
    const candidates = own.filter((s) => world.skillTree.check(s).ok);
    if (candidates.length === 0) break;
    candidates.sort((a, b) => rank(a.id) - rank(b.id) || b.tree!.tier - a.tree!.tier);
    world.skillTree.learn(candidates[0]!.id);
  }

  // 屬性點
  const points = world.progress.attributePoints;
  const entries = Object.entries(build.attributes);
  let spent = 0;
  entries.forEach(([id, share], i) => {
    const n = i === entries.length - 1 ? points - spent : Math.floor(points * share);
    spent += world.attributes.allocate(id, n);
  });

  // 裝備：物品等級不超過角色等級（穿得上）
  const itemLevel = Math.max(1, Math.min(floor, world.progress.level));
  const slots: [EquipmentSlot, Parameters<GameWorld['itemGenerator']['generateForKind']>[0]][] = [
    ['weapon', build.weapon],
    ['helmet', 'helmet'],
    ['armor', 'armor'],
    ['gloves', 'gloves'],
    ['boots', 'boots'],
    ['ring1', 'ring'],
    ['ring2', 'ring'],
    ['amulet', 'amulet'],
  ];
  if (build.shield) slots.push(['shield', 'shield']);
  if (preset) presetGear(world, data, build, preset, slots);
  else for (const [slot, kind] of slots) {
    const item = world.itemGenerator.generateForKind(kind, itemLevel, GEAR_RARITY);
    if (item && world.equipment.canEquip(item, slot)) world.equipment.equipTo(slot, item);
  }

  // 配置：左鍵 + 連段（主動技能依階級由高到低，每組放滿已解鎖的格數）
  world.loadout.left = build.left;
  const actives = own
    .filter((s) => s.kind !== 'passive' && rank(s.id) > 0 && s.id !== build.left)
    .sort((a, b) => b.tree!.tier - a.tree!.tier);
  const keys = world.comboKeysUnlocked;
  const perCombo = world.comboSlotsUnlocked;
  for (let k = 0; k < world.loadout.combos.length; k++) world.loadout.combos[k] = [null, null, null];
  let next = 0;
  for (let k = 0; k < keys && next < actives.length; k++) {
    const combo = world.loadout.combos[k as ComboKey]!;
    for (let step = 0; step < perCombo && next < actives.length; step++) combo[step] = actives[next++]!.id;
  }
  if (actives.length === 0) world.loadout.combos[0] = [build.left, null, null];

  // 藥水帶滿、生命魔力回滿
  const potionId = data.balance.player.potionId;
  world.inventory.addPotions(potionId, data.potions.get(potionId).maxCarry);
  world.player.hp = world.player.stats.get('maxHp');
  world.player.mana = world.player.stats.get('maxMana');
}
