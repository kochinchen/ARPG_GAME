import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { ComboCastInfo } from '../../../src/game/combo/StepMods';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import type { Actor } from '../../../src/game/entities/Actor';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld as GameWorldClass, type GameWorld } from '../../../src/game/GameWorld';
import { describeItem } from '../../../src/game/items/ItemDescriber';
import { ItemGenerator } from '../../../src/game/items/ItemGenerator';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { createWorld, run } from '../helpers';

/** 傳奇（橘）/ 神話（紅）：固定設計與特殊效果 */
const data = DataRegistry.load(gameData);
const KINDS = ['sword', 'axe', 'bow', 'staff', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];
const ONLY = (rarity: 'legendary' | 'mythic') => ({ normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, [rarity]: 1 });

/** 讓玩家穿上一件指定的傳奇 / 神話 */
function wear(world: GameWorld, id: string, level = 12) {
  const item = world.itemGenerator.createLegendary(data.legendaries.get(id), level);
  world.equipment.equip(item);
  world.itemEffects.update(0);
  return item;
}
const dummy = (world: GameWorld): Actor => world.actors.find((a) => a.defId === 'enemy.training_dummy' && a.position.x === 8.5)!;
const hit = (world: GameWorld, target: Actor, skillId: string, amount = 100, combo: ComboCastInfo | null = null, extra: { isCrit?: boolean; killed?: boolean } = {}) =>
  world.events.emit('SkillHit', { casterId: world.player.id, targetId: target.id, skillId, amount, isCrit: extra.isCrit ?? false, killed: extra.killed ?? false, combo });
/** 敵人受到的傷害紀錄 */
function damageLog(world: GameWorld, target: Actor) {
  const log: { amount: number; element: string }[] = [];
  world.events.on('ActorDamaged', (e) => {
    if (e.targetId === target.id) log.push({ amount: e.amount, element: e.element });
  });
  return log;
}

describe('傳奇 / 神話的設計', () => {
  it('橘 30 件、紅 20 件；每種裝備橘 3、紅 2', () => {
    const all = data.legendaries.all;
    expect(all.filter((d) => d.rarity === 'legendary')).toHaveLength(30);
    expect(all.filter((d) => d.rarity === 'mythic')).toHaveLength(20);
    for (const kind of KINDS) {
      expect(all.filter((d) => d.kind === kind && d.rarity === 'legendary'), kind).toHaveLength(3);
      expect(all.filter((d) => d.kind === kind && d.rarity === 'mythic'), kind).toHaveLength(2);
    }
    expect(new Set(all.map((d) => d.name)).size).toBe(all.length);
  });

  it('產生：名稱與屬性固定；基底在樓層階 −1 ～ +2（飾品 = 能用的最高階）；主倍率與數值在設計範圍內', () => {
    const gen = new ItemGenerator(data, new Rng(5));
    for (const def of data.legendaries.all) {
      const item = gen.createLegendary(def, 20);
      const base = data.items.get(item.baseId);
      expect(base.weaponType ?? base.slot).toBe(def.kind);
      if (base.tier === undefined) {
        const better = data.items.all.filter((b) => (b.weaponType ?? b.slot) === def.kind && b.levelReq <= 20 && b.levelReq > base.levelReq);
        expect(better, def.id).toHaveLength(0);
      } else {
        // 第 20 層的樓層階 = T4（等級需求 18）
        expect(base.tier, def.id).toBeGreaterThanOrEqual(3);
        expect(base.tier, def.id).toBeLessThanOrEqual(6);
      }
      if (def.main) {
        expect(item.quality!).toBeGreaterThanOrEqual(def.main[0]);
        expect(item.quality!).toBeLessThanOrEqual(def.main[1]);
      } else expect(item.quality).toBeUndefined();
      const d = describeItem(item, data);
      expect(d.name).toBe(def.name);
      expect((d.mainLine ? 1 : 0) + d.legendary!.lines.length).toBe(def.rarity === 'legendary' ? 6 : 8);
      expect(d.legendary!.lines.filter((l) => l.kind === 'unique').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('紫 / 橘 / 紅的基底階級偏態分布：第 10 層多為 T2～T4、第 20 層 T3～T6、第 30 層 T5～T8', () => {
    const gen = new ItemGenerator(data, new Rng(21));
    const tiers = (level: number, rarity: 'epic' | 'mythic') => {
      const weights = { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, [rarity]: 1 };
      const counts = new Map<number, number>();
      let n = 0;
      while (n < 2000) {
        const tier = data.items.get(gen.generate(level, weights).baseId).tier;
        if (tier === undefined) continue;
        counts.set(tier, (counts.get(tier) ?? 0) + 1);
        n++;
      }
      return (t: number) => (counts.get(t) ?? 0) / n;
    };
    for (const rarity of ['epic', 'mythic'] as const) {
      const f10 = tiers(10, rarity);
      expect(f10(1)).toBeGreaterThan(0.08);
      expect(f10(2)).toBeGreaterThan(0.33);
      expect(f10(2) + f10(3) + f10(4)).toBeGreaterThan(0.8);
      expect(f10(5)).toBe(0);
      const f20 = tiers(20, rarity);
      expect(f20(3) + f20(4) + f20(5) + f20(6)).toBeCloseTo(1);
      expect(f20(4)).toBeGreaterThan(f20(6));
      const f30 = tiers(30, rarity);
      expect(f30(5) + f30(6) + f30(7) + f30(8)).toBeCloseTo(1);
      expect(f30(6) + f30(7) + f30(8)).toBeGreaterThan(0.8);
      // 最高階以上合併到 T8
      expect(tiers(42, rarity)(8)).toBeGreaterThan(0.8);
    }
  });

  it('神話只在第 10 層以上出現；更低的樓層降為傳奇', () => {
    const gen = new ItemGenerator(data, new Rng(8));
    for (let i = 0; i < 100; i++) {
      expect(gen.generate(5, ONLY('mythic')).rarity).toBe('legendary');
      const deep = gen.generate(20, ONLY('mythic'));
      expect(deep.rarity).toBe('mythic');
      expect(deep.legendaryId).toBeDefined();
    }
  });

  it('固定屬性套用到角色；存檔讀檔後擲骰結果不變', () => {
    const floorWorld = (seed: number) =>
      new GameWorldClass({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
    const world = floorWorld(3);
    // 物品等級 1（角色 1 級也能穿；等級需求高於角色的裝備讀檔時會被脫下）
    const item = wear(world, 'legendary.cold_moon', 1);
    expect(world.player.stats.get('coldDamagePct')).toBeGreaterThanOrEqual(0.16);
    const save = SaveMapper.capture(world, 'T');
    const saved = save.equipment.weapon!;
    expect(saved.legendaryId).toBe('legendary.cold_moon');
    expect(saved.legendaryRolls).toEqual(item.legendaryRolls);
    const fresh = floorWorld(save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.equipment.get('weapon')).toEqual(item);
  });
});

describe('特殊效果', () => {
  it('技能加成：焚星 → 火球傷害 +30%、火系 +25%；其他技能沒有', () => {
    const { world } = createWorld();
    wear(world, 'legendary.star_burner');
    const fireball = world.itemEffects.modsFor(world.player, data.skills.get('magic.fireball'), NO_MODS).mods;
    expect(fireball.damage).toBeCloseTo(0.55);
    const iceOrb = world.itemEffects.modsFor(world.player, data.skills.get('magic.ice_orb'), NO_MODS).mods;
    expect(iceOrb.damage).toBe(0);
  });

  it('命中觸發：裂山 → 重擊類技能命中時震波造成該擊 35% 傷害；非重擊不觸發', () => {
    const { world } = createWorld();
    wear(world, 'legendary.mountain_splitter');
    const target = dummy(world);
    const log = damageLog(world, target);
    hit(world, target, 'melee.quick_slash', 100);
    expect(log).toHaveLength(0);
    hit(world, target, 'melee.heavy_slash', 100);
    expect(log.length).toBe(1);
    // 該擊 35%，再套用近戰加成與木樁的防禦減傷
    const expected = 35 * (1 + world.player.stats.get('meleeDamageBonus'));
    expect(log[0]!.amount).toBeGreaterThan(expected * 0.7);
    expect(log[0]!.amount).toBeLessThanOrEqual(Math.ceil(expected));
  });

  it('每 N 次：寒月 → 每第 5 次近戰命中釋放冰霜新星', () => {
    const { world } = createWorld();
    wear(world, 'legendary.cold_moon');
    const target = dummy(world);
    world.player.position = vec2(target.position.x - 1, target.position.y);
    const log = damageLog(world, target);
    for (let i = 0; i < 4; i++) hit(world, target, 'melee.quick_slash');
    expect(log.filter((l) => l.element === 'cold')).toHaveLength(0);
    hit(world, target, 'melee.quick_slash');
    // 冰霜新星的寒冰傷害（劍本身的「附加寒冰傷害」也會再追加一段）
    expect(log.filter((l) => l.element === 'cold').length).toBeGreaterThanOrEqual(1);
    const count = log.length;
    for (let i = 0; i < 4; i++) hit(world, target, 'melee.quick_slash');
    expect(log.length).toBe(count);
  });

  it('層數：獸神之齒 → 近戰命中 +2 層（最多 7）、每層攻速 +3%；重擊每層傷害 +5%', () => {
    const { world } = createWorld();
    wear(world, 'mythic.beast_god_fang', 15);
    const speed = world.player.stats.get('attackSpeed');
    const target = dummy(world);
    hit(world, target, 'melee.quick_slash');
    expect(world.itemEffects.activeBuffs).toEqual([expect.objectContaining({ id: 'beast', stacks: 2 })]);
    for (let i = 0; i < 5; i++) hit(world, target, 'melee.quick_slash');
    expect(world.itemEffects.activeBuffs[0]!.stacks).toBe(7);
    expect(world.player.stats.get('attackSpeed')).toBeGreaterThan(speed);
    const heavy = world.itemEffects.modsFor(world.player, data.skills.get('melee.heavy_slash'), NO_MODS).mods;
    expect(heavy.damage).toBeCloseTo(0.35);
    run(world, 6);
    expect(world.itemEffects.activeBuffs).toHaveLength(0);
  });

  it('條件：黑曜壁壘 → 近身 2.5 格內有敵人時受到傷害 -8%', () => {
    const { world } = createWorld();
    wear(world, 'legendary.obsidian_bulwark');
    world.player.position = vec2(3.5, 9.5);
    world.itemEffects.update(0);
    const base = world.player.stats.get('damageReduction');
    world.player.position = vec2(dummy(world).position.x - 1.5, dummy(world).position.y);
    world.itemEffects.update(0);
    expect(world.player.stats.get('damageReduction')).toBeCloseTo(base + 0.08);
  });

  it('預備加成：幽影步 → 閃避後下一招必定暴擊，用過即消失', () => {
    const { world } = createWorld();
    wear(world, 'mythic.phantom_step', 15);
    world.events.emit('AttackDodged', { targetId: world.player.id, position: world.player.position });
    const first = world.itemEffects.modsFor(world.player, data.skills.get('melee.heavy_slash'), NO_MODS);
    expect(first.mods.crit).toBeGreaterThanOrEqual(1);
    first.commit();
    expect(world.itemEffects.modsFor(world.player, data.skills.get('melee.heavy_slash'), NO_MODS).mods.crit).toBe(0);
  });

  it('Combo 條件：踏界者 → 只有「近 → 中 → 遠」Combo 的第三招 +30%', () => {
    const { world } = createWorld();
    wear(world, 'mythic.realm_walker', 15);
    const info = (skills: string[], step: number): ComboCastInfo => ({ step, skills, success: true, comboId: 'x', ruleTier: 2, slot: 0 });
    const nmf = ['melee.heavy_slash', 'ranged.backstep_shot', 'ranged.quick_shot'];
    const mods = (skills: string[], step: number) =>
      world.itemEffects.modsFor(world.player, data.skills.get(skills[step - 1]!), { ...NO_MODS, combo: info(skills, step) }).mods;
    expect(mods(nmf, 3).damage).toBeCloseTo(0.3);
    expect(mods(nmf, 1).damage).toBe(0);
    expect(mods(['melee.heavy_slash', 'melee.quick_slash', 'ranged.quick_shot'], 3).damage).toBe(0);
    // 中距離技能魔力 -30%
    expect(mods(nmf, 2).mp).toBeCloseTo(-0.3);
  });

  it('Q → W → E 輪轉：輪迴之環', () => {
    const { world } = createWorld();
    wear(world, 'mythic.samsara', 15);
    const complete = (slot: number) =>
      world.events.emit('ComboCompleted', { comboId: `c${slot}`, ruleId: 'r', name: 'n', skills: ['melee.heavy_slash', 'melee.quick_slash', 'magic.fireball'], description: [], slot, ruleTier: 2 });
    const damageFor = (slot: number) =>
      world.itemEffects.modsFor(world.player, data.skills.get('melee.quick_slash'), {
        ...NO_MODS,
        combo: { step: 2, skills: ['melee.heavy_slash', 'melee.quick_slash', 'magic.fireball'], success: true, comboId: 'x', ruleTier: 2, slot },
      }).mods.damage;
    expect(damageFor(1)).toBe(0);
    complete(0);
    expect(damageFor(1)).toBeCloseTo(0.15);
    complete(1);
    expect(damageFor(2)).toBeCloseTo(0.15);
    complete(2);
    expect(damageFor(0)).toBeCloseTo(0.4);
    complete(0);
    expect(damageFor(0)).toBe(0);
  });

  it('脫下裝備時移除所有效果', () => {
    const { world } = createWorld();
    wear(world, 'legendary.obsidian_bulwark');
    world.player.position = vec2(dummy(world).position.x - 1.5, dummy(world).position.y);
    world.itemEffects.update(0);
    world.equipment.unequip('armor');
    world.itemEffects.update(0);
    expect(world.player.stats.get('damageReduction')).toBe(0);
  });

  it('實戰：穿著焚星施放火球，火球命中後分裂成小火球（整合）', () => {
    const { world, commands } = createWorld();
    wear(world, 'legendary.star_burner');
    world.player.mana = world.player.maxMana;
    const target = dummy(world);
    // 法杖主倍率放大法術強度後，火球會直接打倒 60 HP 的木樁；加厚才看得到分裂
    target.stats.setBase('maxHp', 5000);
    target.hp = 5000;
    const log = damageLog(world, target);
    world.loadout.left = 'magic.fireball';
    commands.push({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: false }, { type: 'PrimaryRelease' });
    run(world, 3);
    // 火球本身 + 至少一顆小火球
    expect(log.filter((l) => l.element === 'fire').length).toBeGreaterThanOrEqual(2);
  });
});
