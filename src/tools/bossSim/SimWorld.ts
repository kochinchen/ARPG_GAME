import { CommandQueue } from '../../core/CommandQueue';
import { EventBus } from '../../core/EventBus';
import { vec2 } from '../../core/math/Vec2';
import { gameData } from '../../data';
import { DataRegistry } from '../../data/DataRegistry';
import type { GameCommand } from '../../game/Commands';
import type { GameEvents } from '../../game/GameEvents';
import { GameWorld } from '../../game/GameWorld';
import type { Actor } from '../../game/entities/Actor';
import type { EquipmentSlot } from '../../game/items/ItemInstance';

/** 主角的裝備：none = 只有等級給的生命；其他 = 比照難度測試的「正常玩到這裡」（藍黃紫、屬性點分配） */
export type GearId = 'none' | 'shield' | 'noShield';

export const GEAR_LABELS: Record<GearId, string> = {
  none: '裸身（無裝備、無屬性點）',
  shield: '一般裝備：劍盾（會格擋）',
  noShield: '一般裝備：法杖（無盾）',
};

export interface SimConfig {
  enemyId: string;
  floor: number;
  level: number;
  gear: GearId;
  /** 從第幾階段開始（1 = 初始）；沒有階段的敵人固定 1 */
  phase: number;
  /** 額外穿上的傳奇 / 神話（檢查裝備效果的外觀）；只能從網址指定 */
  wear?: readonly string[];
}

export interface Sim {
  config: SimConfig;
  data: DataRegistry;
  world: GameWorld;
  commands: CommandQueue<GameCommand>;
  enemy: Actor;
}

/** 固定種子：同樣的等級與樓層，每次換敵人都穿同一套裝備，紀錄才能互相比較 */
const SEED = 20261102;
const ARENA_SIZE = 40;
/** 主角與敵人一開始的距離（Tile） */
const START_GAP = 8;

/** 空曠的方形競技場；主角站在西側，S 是地圖的出生點 */
function arenaRows(): string[] {
  const wall = '#'.repeat(ARENA_SIZE);
  const open = `#${'.'.repeat(ARENA_SIZE - 2)}#`;
  const rows = Array.from({ length: ARENA_SIZE }, (_, y) => (y === 0 || y === ARENA_SIZE - 1 ? wall : open));
  const mid = ARENA_SIZE / 2;
  rows[mid] = `${open.slice(0, mid - START_GAP / 2)}S${open.slice(mid - START_GAP / 2 + 1)}`;
  return rows;
}

const GEAR_RARITY = { normal: 0, magic: 40, rare: 50, epic: 10, legendary: 0, mythic: 0 };

function equipPlayer(world: GameWorld, config: SimConfig, data: DataRegistry): void {
  const shield = config.gear === 'shield';
  const points = (config.level - 1) * data.balance.attributes.pointsPerLevel;
  world.progress.attributePoints = points;
  const shares: [string, number][] = shield ? [['attack', 0.45], ['vitality', 0.35], ['defense', 0.2]] : [['attack', 0.45], ['vitality', 0.3], ['mana', 0.25]];
  for (const [id, share] of shares) world.attributes.allocate(id, Math.floor(points * share));
  const slots: [EquipmentSlot, Parameters<GameWorld['itemGenerator']['generateForKind']>[0]][] = [
    ['weapon', shield ? 'sword' : 'staff'],
    ['helmet', 'helmet'],
    ['armor', 'armor'],
    ['gloves', 'gloves'],
    ['boots', 'boots'],
    ['ring1', 'ring'],
    ['ring2', 'ring'],
    ['amulet', 'amulet'],
  ];
  if (shield) slots.push(['shield', 'shield']);
  const itemLevel = Math.max(1, Math.min(config.floor, config.level));
  for (const [slot, kind] of slots) {
    const item = world.itemGenerator.generateForKind(kind, itemLevel, GEAR_RARITY);
    if (item && world.equipment.canEquip(item, slot)) world.equipment.equipTo(slot, item);
  }
}

/** 建立模擬世界：一個競技場、一個不會倒下的主角、一隻套用樓層倍率的敵人 */
export function createSim(config: SimConfig): Sim {
  const data = DataRegistry.load({
    ...gameData,
    maps: [...gameData.maps, { id: 'map.boss_sim', rows: arenaRows(), spawns: [], chests: [] }],
  });
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, mapId: 'map.boss_sim', commands, events, seed: SEED });
  // 地面與牆用這一層的主題（Renderer 建立時讀取）
  world.floors.floor = config.floor;
  world.floors.def = world.floors.defFor(config.floor);

  world.experience.restore(config.level, 0);
  if (config.gear !== 'none') equipPlayer(world, config, data);
  for (const id of config.wear ?? []) world.equipment.equip(world.itemGenerator.createLegendary(data.legendaries.get(id), config.level));
  world.player.hp = world.player.maxHp;
  world.player.mana = world.player.maxMana;

  // 木樁：每次受傷立刻補滿，死亡判定永遠不會發生；傷害由紀錄器累計
  events.on('ActorDamaged', (e) => {
    if (e.targetId === world.player.id) world.player.hp = world.player.maxHp;
  });

  // 隱藏魔王每次出招從屬性裡抽一種（兩種，或全部）
  const hidden = data.balance.hiddenBoss.bosses.find((b) => b.enemyId === config.enemyId);
  const at = vec2(world.player.position.x + START_GAP, world.player.position.y);
  const enemy = world.spawnScaledEnemy(config.enemyId, config.floor, at, hidden ? (hidden.allElements ? hidden.elements : hidden.elements.slice(0, 2)) : null);
  // 階段由血量決定：血量放在該階段的門檻，第一個 Tick 由遊戲的 BossSystem 進入階段（畫面也會收到事件）
  const start = data.enemies.get(config.enemyId).phases[config.phase - 2];
  if (start) enemy.hp = enemy.maxHp * start.hpBelow;
  return { config, data, world, commands, enemy };
}

/** 推進一個 Tick。敵人閒置時直接把主角當目標，不必走進偵測範圍才開打 */
export function tickSim(sim: Sim, dt: number): void {
  const { enemy, world } = sim;
  if (enemy.ai?.state === 'idle') enemy.ai.provokedBy = world.player.id;
  world.update(dt);
}
