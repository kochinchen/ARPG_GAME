import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { RARITIES, type Rarity } from '../../../src/data/schema/item';
import type { GroundContent } from '../../../src/game/entities/Interactable';
import { itemValue } from '../../../src/game/items/Pricing';
import { run } from '../../game/helpers';
import { data, makeWorld } from '../sim/run';

/**
 * 除錯用：每一層的金幣表（OUT=輸出檔，JSON；SEEDS=每層幾個種子，預設 8；FLOORS=最後一層，預設到最後）。
 * 用遊戲真正的生怪與掉落：依序把結晶獸、隱藏魔王、魔王、首領、精英、一般怪打倒，再把寶箱全開，
 * 記下每個來源掉在地上的金幣、各稀有度的裝備件數與賣價、藥水、熔核、碎片（全清一次的平均）。
 * 噴錢的結晶獸另外附上期望值（出現幾隻是擲機率的，樣本少時起伏大）。
 */
const SOURCES = ['一般怪', '精英', '首領', '魔王', '隱藏魔王', '結晶獸', '寶箱', '首領寶箱'] as const;
type Source = (typeof SOURCES)[number];
interface Tally {
  gold: number;
  piles: number;
  items: Record<Rarity, number>;
  value: Record<Rarity, number>;
  potions: number;
  kills: number;
}
const emptyTally = (): Tally => ({
  gold: 0,
  piles: 0,
  items: Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>,
  value: Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>,
  potions: 0,
  kills: 0,
});
const HIDDEN_TABLES = ['loot.hidden_boss', 'loot.abyss_hand', 'loot.abyss_eye'];

it('goldsheet', () => {
  const last = Number(process.env.FLOORS ?? data.balance.endgame.lastFloor);
  const seeds = Number(process.env.SEEDS ?? 8);
  const walker = data.balance.goldWalker;
  const out: { floor: number; seeds: number; walkerExpected: number; sources: Record<Source, Tally> }[] = [];
  for (let floor = 1; floor <= last; floor++) {
    const sources = Object.fromEntries(SOURCES.map((s) => [s, emptyTally()])) as Record<Source, Tally>;
    for (let seed = 1; seed <= seeds; seed++) {
      const { world, events } = makeWorld(floor, seed);
      let source: Source = '一般怪';
      const spawn = world.spawnGroundItem.bind(world);
      world.spawnGroundItem = (position, content: GroundContent) => {
        const t = sources[source];
        if (content.kind === 'gold') {
          t.gold += content.amount;
          t.piles++;
        } else if (content.kind === 'item') {
          t.items[content.item.rarity]++;
          t.value[content.item.rarity] += itemValue(content.item, data);
        } else if (content.kind === 'potion') t.potions += content.count;
        return spawn(position, content);
      };
      const foes = () => world.actors.filter((a) => a.faction === 'enemy' && a.alive && a.summonedBy === null);
      const def = (a: { defId: string | null }) => (a.defId !== null && data.enemies.has(a.defId) ? data.enemies.get(a.defId) : null);
      const tick = () => run(world, 3 / 60, () => (world.player.hp = world.player.stats.get('maxHp')));
      const kill = (label: Source, pick: (a: ReturnType<typeof foes>[number]) => boolean) => {
        source = label;
        // 分幾輪：倒下時才出現的（背上的同伴、分裂的）也算在同一個來源
        for (let round = 0; round < 4; round++) {
          const list = foes().filter(pick);
          if (list.length === 0) break;
          for (const a of list) {
            a.lastDamagedBy = world.player.id;
            a.hp = 0;
          }
          sources[label].kills += list.length;
          tick();
        }
      };
      kill('結晶獸', (a) => def(a)?.treasure === true);
      kill('隱藏魔王', (a) => HIDDEN_TABLES.includes(def(a)?.lootTable ?? ''));
      kill('魔王', (a) => a.isBoss || a.miniBoss);
      kill('首領', (a) => a.name.startsWith('首領'));
      kill('精英', (a) => a.elite);
      kill('一般怪', () => true);
      for (const chest of [...world.chests]) {
        if (chest.opened) continue;
        source = chest.lootTable === data.balance.champion.chestLootTable ? '首領寶箱' : '寶箱';
        chest.opened = true;
        sources[source].kills++;
        events.emit('ChestOpened', { chestId: chest.id, position: chest.position, lootTable: chest.lootTable });
      }
    }
    const count = walker.chances.reduce((s, c) => s + c, 0);
    const progress = Math.min(1, (floor - 1) / (data.balance.endgame.lastFloor - 1));
    const walkerExpected = floor < walker.minFloor ? 0 : count * (walker.gold[0] + (walker.gold[1] - walker.gold[0]) * progress);
    out.push({ floor, seeds, walkerExpected, sources });
  }
  writeFileSync(process.env.OUT!, JSON.stringify(out));
});
