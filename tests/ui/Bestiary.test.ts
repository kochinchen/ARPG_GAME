import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { SaveMapper } from '../../src/save/SaveMapper';
import { repairSave } from '../../src/save/SaveRepair';
import { buildBestiary, statsAtFloor } from '../../src/ui/bridge/BestiaryView';
import { run } from '../game/helpers';

/** 怪物圖鑑：擊敗紀錄（存檔）與圖鑑內容 */
const data = DataRegistry.load(gameData);

function world(floor = 1, seed = 5) {
  return new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
}

describe('擊敗紀錄', () => {
  it('擊敗怪物時記錄種類與次數，存檔讀檔後保留', () => {
    const w = world();
    const [a, b] = w.actors.filter((x) => x.faction === 'enemy' && x.defId === w.actors.find((y) => y.faction === 'enemy')!.defId);
    for (const e of [a!, b!]) {
      e.lastDamagedBy = w.player.id;
      e.hp = 0;
    }
    run(w, 1 / 60);
    expect(w.progress.bestiary.get(a!.defId!)).toBe(2);

    const save = SaveMapper.capture(w, 'T');
    expect(save.bestiary[a!.defId!]).toBe(2);
    const fresh = world(1, save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.progress.bestiary.get(a!.defId!)).toBe(2);
  });

  it('已刪除的怪物會從圖鑑移除', () => {
    const save = SaveMapper.capture(world(), 'T');
    save.bestiary = { 'enemy.skeleton': 3, 'enemy.removed_monster': 1 };
    expect(repairSave(save, data).data.bestiary).toEqual({ 'enemy.skeleton': 3 });
  });
});

describe('圖鑑內容', () => {
  const entries = buildBestiary(data);
  const byId = (id: string) => entries.find((e) => e.id === id)!;

  it('列出所有怪物（不含訓練木樁），依分類排列', () => {
    expect(entries.some((e) => e.id === 'enemy.training_dummy')).toBe(false);
    expect(entries.length).toBe(data.enemies.all.length - 1);
    expect(entries[0]!.family).toBe('undead');
    expect(entries[entries.length - 1]!.family).toBe('boss');
    for (const e of entries) expect(e.lore.length, e.id).toBeGreaterThan(0);
  });

  it('出現樓層：一般怪物、魔王、只會被召喚的眷屬', () => {
    expect(byId('enemy.bone_hound').appears).toBe('第 10 層起');
    expect(byId('enemy.crypt_guardian').appears).toBe('第 5 層（魔王）');
    expect(byId('enemy.abyss_lord').appears).toMatch(/^第 30、35、40… 層/);
    expect(byId('enemy.cultist').appears).toBe('由墮落神官召喚');
    expect(byId('enemy.cultist').firstFloor).toBe(10);
  });

  it('魔王列出階段變化與所有階段的技能', () => {
    const knight = byId('enemy.fallen_knight');
    expect(knight.phases.map((p) => p.label)).toEqual(['火焰附魔', '寒冰附魔', '雷霆附魔']);
    expect(knight.skills.map((s) => s.name)).toContain('雷暴');
  });

  it('各樓層數值套用樓層倍率', () => {
    const e = byId('enemy.skeleton');
    const f1 = statsAtFloor(e, 1, data);
    const f10 = statsAtFloor(e, 10, data);
    expect(f1.hp).toBe(e.base.hp);
    expect(f10.hp).toBeGreaterThan(f1.hp);
    expect(f10.damage[1]).toBeGreaterThan(f1.damage[1]);
  });
});
