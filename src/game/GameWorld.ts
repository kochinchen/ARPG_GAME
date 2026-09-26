import type { CommandQueue } from '../core/CommandQueue';
import { Rng } from '../core/Rng';
import { vec2, type Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import { MAP_TILES, type MapDef } from '../data/schema/map';
import type { GameCommand } from './Commands';
import type { GameEventBus } from './GameEvents';
import { AiSystem } from './ai/AiSystem';
import { DamagePipeline } from './combat/DamagePipeline';
import { StatusEffectSystem } from './combat/StatusEffectSystem';
import { DeathSystem } from './combat/DeathSystem';
import { EnemyFactory } from './enemies/EnemyFactory';
import { Actor } from './entities/Actor';
import type { Chest, ExitPortal, GroundContent, GroundItem, StairsUp } from './entities/Interactable';
import type { Projectile } from './entities/Projectile';
import { ChestSystem } from './items/ChestSystem';
import { Equipment } from './items/Equipment';
import { Inventory } from './items/Inventory';
import { ItemCursor } from './items/ItemCursor';
import { ItemGenerator } from './items/ItemGenerator';
import { LootSystem } from './items/LootSystem';
import { MovementSystem } from './movement/MovementSystem';
import { NavGrid, tileCenter } from './movement/NavGrid';
import { Pathfinder } from './movement/Pathfinder';
import { SeparationSystem } from './movement/SeparationSystem';
import { DeathHandler } from './player/DeathHandler';
import { InteractionSystem } from './player/InteractionSystem';
import { ItemActions } from './player/ItemActions';
import { PlayerController } from './player/PlayerController';
import { PlayerLoadout } from './player/PlayerLoadout';
import { PotionBelt } from './player/PotionBelt';
import { Wallet } from './player/Wallet';
import { EffectRegistry } from './skills/EffectRegistry';
import { ProjectileSystem } from './skills/ProjectileSystem';
import { SkillExecutor } from './skills/SkillExecutor';
import { SkillSystem } from './skills/SkillSystem';
import { SkillTree } from './skills/SkillTree';
import { ComboCodex } from './combo/ComboCodex';
import { ComboDiscoverySystem } from './combo/ComboDiscoverySystem';
import { ComboResolver } from './combo/ComboResolver';
import { ComboSkillIndex } from './combo/ComboSkillIndex';
import { ComboSystem } from './combo/ComboSystem';
import { EffectScheduler } from './skills/EffectScheduler';
import { SupportSystem } from './skills/SupportSystem';
import { AttributeSystem } from './progression/AttributeSystem';
import { ExperienceSystem } from './progression/ExperienceSystem';
import { PlayerProgress } from './progression/PlayerProgress';
import { RegenSystem } from './stats/RegenSystem';
import { StatBlock } from './stats/StatBlock';
import { CheckpointSystem } from './world/CheckpointSystem';
import { scaleForFloor } from './world/DifficultyScaler';
import { FloorManager } from './world/FloorManager';
import { SpawnSystem } from './world/SpawnSystem';
import { findMarker } from '../data/mapAnalysis';
import { TargetingService } from './targeting/TargetingService';

/** 讀檔時還原本層狀態（一般換層不需要） */
export interface FloorRestore {
  /** 已擊殺怪物的生成索引 */
  killed: readonly number[];
  midwayActive: boolean;
  exitOpen: boolean;
}

export interface GameWorldOptions {
  data: DataRegistry;
  /** 固定地圖模式（測試用）：使用地圖內擺放的怪物與寶箱，沒有樓層與出口 */
  mapId?: string;
  /** 樓層模式：從第幾層開始（省略 mapId 時預設第 1 層） */
  floor?: number;
  commands: CommandQueue<GameCommand>;
  events: GameEventBus;
  seed: number;
}

/**
 * 持有所有 Entity 與 System，依固定順序執行每個 Tick。
 */
export class GameWorld {
  map: MapDef;
  readonly nav: NavGrid;
  /** 本層出口（固定地圖模式沒有出口） */
  exit: ExitPortal | null = null;
  /** 往上的樓梯（第 2 層以上） */
  stairsUp: StairsUp | null = null;
  readonly checkpoints: CheckpointSystem;
  readonly floors: FloorManager;
  readonly actors: Actor[] = [];
  readonly projectiles: Projectile[] = [];
  readonly groundItems: GroundItem[] = [];
  readonly chests: Chest[] = [];
  readonly player: Actor;
  readonly loadout: PlayerLoadout;
  readonly potions: PotionBelt;
  readonly inventory: Inventory;
  readonly equipment: Equipment;
  /** 滑鼠上拿著的物品 */
  readonly cursor = new ItemCursor();
  readonly wallet = new Wallet();
  readonly interaction: InteractionSystem;
  readonly progress = new PlayerProgress();
  readonly skillTree: SkillTree;
  readonly experience: ExperienceSystem;
  readonly attributes: AttributeSystem;
  /** 掉落物品等級：等於樓層 */
  itemLevel = 1;
  readonly events: GameEventBus;
  /** 唯讀查詢服務；Render 也可用來查詢 */
  readonly targeting: TargetingService;
  readonly skills: SkillSystem;
  readonly statuses: StatusEffectSystem;
  readonly scheduler: EffectScheduler;
  readonly combos: ComboSystem;
  readonly comboResolver: ComboResolver;
  readonly codex = new ComboCodex();
  private readonly comboSlotLevels: readonly number[];
  readonly deathHandler: DeathHandler;
  readonly itemGenerator: ItemGenerator;
  /** 累計遊戲時間（秒，只算有執行的 Tick） */
  playTime = 0;

  private nextActorId = 1;
  private nextProjectileId = 1;
  private nextInteractableId = 1;
  private readonly commands: CommandQueue<GameCommand>;
  private readonly ai: AiSystem;
  private readonly regen = new RegenSystem();
  private readonly movement = new MovementSystem();
  private readonly separation: SeparationSystem;
  private readonly projectileSystem: ProjectileSystem;
  private readonly deaths: DeathSystem;
  private readonly playerController: PlayerController;
  private readonly pipeline: DamagePipeline;
  private readonly support: SupportSystem;
  private readonly data: DataRegistry;
  private readonly seed: number;
  private readonly enemyFactory = new EnemyFactory();

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.data = data;
    this.seed = options.seed;
    this.commands = options.commands;
    this.events = options.events;
    this.floors = new FloorManager(data, this.events);
    this.map = options.mapId !== undefined ? data.maps.get(options.mapId) : this.floors.mapFor(options.floor ?? 1);
    this.nav = NavGrid.fromMap(this.map);
    this.checkpoints = new CheckpointSystem(this.events, data.balance.floor.checkpointRadius);

    const rng = new Rng(options.seed);
    const pathfinder = new Pathfinder(this.nav);
    this.targeting = new TargetingService(this.actors);
    this.statuses = new StatusEffectSystem(this.events);
    this.pipeline = new DamagePipeline(data.balance, rng.fork('combat'), this.events, this.statuses);
    this.scheduler = new EffectScheduler(this.targeting, this.nav, rng.fork('scheduler'));
    const executor = new SkillExecutor(new EffectRegistry(), {
      pipeline: this.pipeline,
      targeting: this.targeting,
      statuses: this.statuses,
      events: this.events,
      nav: this.nav,
      rng: rng.fork('effects'),
      scheduler: this.scheduler,
      categoryTraits: data.balance.skillCategories,
      spawnProjectile: (p) => {
        this.projectiles.push({ ...p, id: this.nextProjectileId++ });
      },
    });
    this.comboResolver = new ComboResolver(data.comboRules, new ComboSkillIndex(data.skills), data.balance.combo.nearNearFarBonus);
    this.combos = new ComboSystem(this.comboResolver, this.targeting, this.statuses, this.events);
    new ComboDiscoverySystem(this.codex, this.events);
    this.comboSlotLevels = data.balance.player.comboSlotLevels;
    this.skills = new SkillSystem(data.skills, this.targeting, pathfinder, executor, this.events, data.balance.skillCategories);
    this.projectileSystem = new ProjectileSystem(this.nav, this.targeting, executor);
    this.ai = new AiSystem(this.targeting, this.nav, pathfinder, this.events, data.skills);
    this.separation = new SeparationSystem(this.nav);
    this.deaths = new DeathSystem(this.events);

    const p = data.balance.player;
    const start = markerPoint(this.map, MAP_TILES.spawn)!;
    const { left, combos, supports } = p.startingLoadout;
    this.loadout = new PlayerLoadout(
      left,
      [[...combos[0]], [...combos[1]], [...combos[2]]],
      [...supports],
    );
    this.player = this.addActor(
      new Actor({
        id: this.nextActorId++,
        faction: 'player',
        name: '冒險者',
        defId: null,
        position: start,
        radius: p.radius,
        stats: new StatBlock({
          maxHp: p.baseHp,
          maxMana: p.baseMana,
          manaRegen: p.manaRegenPerSec,
          moveSpeed: p.moveSpeed,
          damageMin: p.baseDamage[0],
          damageMax: p.baseDamage[1],
          spellPower: p.spellPower,
          attackSpeed: p.attackSpeed,
          attackRange: p.attackRange,
          critChance: p.critChance,
          defense: p.defense,
        }),
        skillRanks: new Map(p.startingSkills.map((id) => [id, 1])),
      }),
    );
    this.progress.skillPoints = p.startingSkillPoints;
    this.skillTree = new SkillTree(this.player, this.progress, data, this.events);
    this.experience = new ExperienceSystem(this.player, this.progress, this.skillTree, data, this.events, this.targeting);
    this.attributes = new AttributeSystem(this.player, this.progress, data, this.events);
    this.inventory = new Inventory(p.inventoryCols, p.inventoryRows, (id) => data.potions.get(id).maxStack);
    this.inventory.addPotions(p.potionId, p.startingPotions);
    this.potions = new PotionBelt(this.player, data.potions.get(p.potionId), this.inventory, this.events);
    this.equipment = new Equipment(this.player, data, this.events);
    this.interaction = new InteractionSystem(
      this.player,
      this,
      this.inventory,
      this.wallet,
      new ChestSystem(this.events),
      pathfinder,
      this.events,
    );
    this.playerController = new PlayerController(
      this.player,
      pathfinder,
      this.targeting,
      this.loadout,
      this.potions,
      this.interaction,
      new ItemActions(this.inventory, this.equipment, this.cursor, this.events, (content) => {
        this.spawnGroundItem(this.player.position, content).droppedByPlayer = true;
        this.events.emit('ItemDropped', { position: this.player.position });
      }, (baseId) => data.items.get(baseId).levelReq <= this.progress.level),
      this.skillTree,
      this.combos,
      data.skills,
      () => this.comboSlotsUnlocked,
      this.attributes,
    );
    this.support = new SupportSystem(this.player, this.loadout, data.skills);
    this.support.update();
    this.itemGenerator = new ItemGenerator(data, rng.fork('items'));
    new LootSystem(
      data,
      rng.fork('loot'),
      this.itemGenerator,
      this.nav,
      (position, content) => this.spawnGroundItem(position, content),
      () => this.itemLevel,
      this.events,
    );
    this.deathHandler = new DeathHandler(this.player, this.events, () => this.checkpoints.respawn.position, p.respawnDelay);
    // 寶箱只能開一次：記錄每層已開啟的寶箱（開發用生成的寶箱沒有索引，不記錄）
    this.events.on('ChestOpened', (e) => {
      const chest = this.chests.find((c) => c.id === e.chestId);
      if (chest?.spawnIndex !== undefined) this.floors.markChestOpened(this.floors.floor, chest.spawnIndex);
    });

    if (options.mapId !== undefined) this.loadFixedMap();
    else this.enterFloor(options.floor ?? 1);
  }

  /** 樓梯口位置 */
  get spawnPoint(): Vec2 {
    return this.checkpoints.checkpoints[0]!.position;
  }

  /** 世界種子：樓層佈局由它推導（存檔內容） */
  get runSeed(): number {
    return this.seed;
  }

  /**
   * 進入某一層：換地圖、清空本層實體、依樓層難度生成怪物與寶箱。玩家的所有進度保留。
   * 任何換層（往上或往下）都是重新進入：怪物重生、從樓梯口開始；已開過的寶箱維持開啟。
   * 已經通過的樓層（低於最高到達樓層）出口直接開啟。
   * restore：讀檔時還原本層的擊殺、中途存檔點與出口狀態。
   */
  enterFloor(floor: number, restore?: FloorRestore): void {
    const def = this.floors.defFor(floor);
    this.resetLevel(this.floors.mapFor(floor));
    this.itemLevel = floor;
    this.progress.currentFloor = floor;
    this.progress.highestFloor = Math.max(this.progress.highestFloor, floor);

    const rng = new Rng(this.seed).fork(`floor-${floor}`);
    const spawner = new SpawnSystem(this.nav, rng);
    const scaling = scaleForFloor(floor, this.data.balance.difficulty);
    const safe = [this.spawnPoint, ...this.checkpoints.checkpoints.slice(1).map((c) => c.position)];
    if (this.exit) safe.push(this.exit.position);
    const killed = new Set(restore?.killed ?? []);
    // 只生成這一層已經開放的怪物（minFloor）
    const pool = { ...def, monsterPool: def.monsterPool.filter((m) => m.minFloor <= floor) };
    const plan = spawner.planMonsters(pool, scaling.density, safe, this.data.balance.floor.safeRadius);
    const spawnedIds: [number, number][] = [];
    plan.forEach((request, index) => {
      if (killed.has(index)) return;
      const actor = this.addActor(this.enemyFactory.create(this.data.enemies.get(request.enemyId), this.nextActorId++, request.position, scaling));
      spawnedIds.push([actor.id, index]);
    });
    spawner.planChests(rng.int(def.chests[0], def.chests[1]), safe).forEach((position, index) => {
      const opened = this.floors.isChestOpened(floor, index);
      this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position, lootTable: def.chestLootTable, opened, spawnIndex: index });
    });
    this.floors.begin(floor, plan.length, {
      killed: plan.flatMap((_, i) => (killed.has(i) ? [i] : [])),
      exitOpen: (restore?.exitOpen ?? false) || floor < this.progress.highestFloor,
    });
    for (const [actorId, index] of spawnedIds) this.floors.trackSpawn(actorId, index);
    if (this.exit) this.exit.open = this.floors.exitOpen;
    this.stairsUp = floor >= 2 ? { kind: 'stairsUp', id: this.nextInteractableId++, position: this.spawnPoint } : null;
    if (restore?.midwayActive) {
      this.checkpoints.restoreMidway();
      this.placePlayer(this.checkpoints.respawn.position);
    }
    this.events.emit('FloorEntered', { floor, mapId: this.map.id });
  }

  /** 固定地圖模式：地圖內擺放的怪物與寶箱 */
  private loadFixedMap(): void {
    this.resetLevel(this.map);
    this.exit = null;
    for (const spawn of this.map.spawns) {
      this.addActor(this.enemyFactory.create(this.data.enemies.get(spawn.enemyId), this.nextActorId++, vec2(...spawn.at)));
    }
    for (const chest of this.map.chests) {
      this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position: vec2(...chest.at), lootTable: chest.lootTable, opened: false });
    }
  }

  /** 換地圖並清空本層所有實體；玩家回到樓梯口（陣列就地清空，其他系統持有的參考仍有效） */
  private resetLevel(map: MapDef): void {
    this.map = map;
    this.nav.load(map);
    this.actors.length = 0;
    this.actors.push(this.player);
    this.projectiles.length = 0;
    this.groundItems.length = 0;
    this.chests.length = 0;
    this.stairsUp = null;
    this.scheduler.clear();
    this.combos.cancel(this.player);
    this.interaction.clear();
    this.statuses.clear(this.player);

    const stairs = markerPoint(map, MAP_TILES.spawn)!;
    this.checkpoints.reset(stairs, markerPoint(map, MAP_TILES.midway));
    const exit = markerPoint(map, MAP_TILES.exit);
    this.exit = exit ? { kind: 'exit', id: this.nextInteractableId++, position: exit, open: false } : null;

    this.placePlayer(stairs);
  }

  private placePlayer(position: Vec2): void {
    const player = this.player;
    player.position = position;
    player.prevPosition = position;
    player.path = [];
    player.intent = null;
    player.cast = null;
  }

  /** 玩家點了出口。地上還有稀有以上物品時先詢問（換層後地上物品會消失） */
  useExit(): void {
    if (!this.floors.exitOpen) {
      this.events.emit('ExitLocked', { remaining: this.floors.remainingToOpen });
      return;
    }
    if (this.askBeforeLeaving('down')) return;
    this.floors.requestDescend();
  }

  /** 玩家點了往上的樓梯 */
  useStairsUp(): void {
    if (this.floors.floor <= 1 || this.askBeforeLeaving('up')) return;
    this.floors.requestAscend();
  }

  /** 地上稀有以上的物品數量（離開樓層前提醒） */
  get valuableGroundItems(): number {
    return this.groundItems.filter((g) => g.content.kind === 'item' && (g.content.item.rarity === 'rare' || g.content.item.rarity === 'legendary')).length;
  }

  private askBeforeLeaving(direction: 'down' | 'up'): boolean {
    const valuableItems = this.valuableGroundItems;
    if (valuableItems === 0) return false;
    const toFloor = this.floors.floor + (direction === 'down' ? 1 : -1);
    this.events.emit('LeaveFloorConfirm', { direction, toFloor, valuableItems });
    return true;
  }

  private confirmLeave(direction: 'down' | 'up'): void {
    if (direction === 'down') this.floors.requestDescend();
    else this.floors.requestAscend();
  }

  /**
   * 讀檔：還原 HP / MP。先重新套用 Support 被動（可能影響上限），再限制在上限內。
   */
  restoreResources(hp: number, mana: number): void {
    this.support.update();
    this.player.hp = Math.min(Math.max(1, hp), this.player.maxHp);
    this.player.mana = Math.min(Math.max(0, mana), this.player.maxMana);
  }

  /** 目前等級已解鎖的連段格數（1～3） */
  get comboSlotsUnlocked(): number {
    return this.comboSlotLevels.filter((level) => this.progress.level >= level).length;
  }

  /** 由 GameWorld 直接處理的指令（樓層確認、開發用指令）；回傳是否已處理 */
  private handleWorldCommand(command: GameCommand): boolean {
    switch (command.type) {
      case 'DebugLevelUp':
        this.experience.grantLevel();
        return true;
      case 'DebugSpawnChests':
        this.spawnChestsNear(this.player.position, command.count);
        return true;
      case 'ConfirmLeaveFloor':
        if (this.player.alive) this.confirmLeave(command.direction);
        return true;
      default:
        return false;
    }
  }

  /** 在某點周圍的地板上生成寶箱（避開牆壁、角色與其他寶箱） */
  spawnChestsNear(center: Vec2, count: number, lootTable = 'loot.chest'): Chest[] {
    const spawned: Chest[] = [];
    const occupied = (p: Vec2) =>
      [...this.chests.map((c) => c.position), ...this.actors.map((a) => a.position)].some(
        (q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.9,
      );
    for (let ring = 1.5; ring <= 4.5 && spawned.length < count; ring += 1) {
      const steps = Math.ceil(ring * 6);
      for (let i = 0; i < steps && spawned.length < count; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const p = vec2(center.x + Math.cos(angle) * ring, center.y + Math.sin(angle) * ring);
        if (!this.nav.isClearAt(p, 0.4) || occupied(p)) continue;
        const chest: Chest = { kind: 'chest', id: this.nextInteractableId++, position: p, lootTable, opened: false };
        this.chests.push(chest);
        spawned.push(chest);
      }
    }
    return spawned;
  }

  /** 背包 / 裝備 / 手上物品的變動版本號；UI 只在變動時重建快照 */
  get itemsVersion(): number {
    return this.inventory.version + this.equipment.version + this.cursor.version;
  }

  spawnGroundItem(position: Vec2, content: GroundContent): GroundItem {
    const item: GroundItem = { kind: 'ground', id: this.nextInteractableId++, position, content };
    this.groundItems.push(item);
    return item;
  }

  update(dt: number): void {
    this.playTime += dt;
    for (const actor of this.actors) actor.prevPosition = actor.position;
    for (const command of this.commands.drain()) {
      if (!this.handleWorldCommand(command)) this.playerController.handle(command);
    }
    this.support.update();
    this.potions.update(dt);
    this.regen.update(this.actors, dt);
    this.statuses.update(this.actors, dt, this.pipeline);
    this.ai.update(this.actors);
    this.combos.update(this.actors);
    this.skills.update(this.actors, dt);
    this.movement.update(this.actors, dt);
    this.separation.update(this.actors);
    this.interaction.update();
    this.projectileSystem.update(this.projectiles, dt);
    this.scheduler.update(dt);
    this.checkpoints.update(this.player);
    this.deaths.update(this.actors);
    this.deathHandler.update(dt);
    this.removeDead();
    if (this.exit) this.exit.open = this.floors.exitOpen;
    // 切換樓層放在 Tick 最後，避免在系統更新途中替換實體
    const next = this.floors.takePending();
    if (next !== null) this.enterFloor(next);
  }

  private addActor(actor: Actor): Actor {
    this.actors.push(actor);
    return actor;
  }

  /** 玩家死亡由 DeathHandler 處理（送回存檔點），不移除 */
  private removeDead(): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const actor = this.actors[i]!;
      if (!actor.alive && actor !== this.player) this.actors.splice(i, 1);
    }
  }
}

/** 地圖記號（S / M / X）所在 Tile 的中心點 */
function markerPoint(map: MapDef, marker: string): Vec2 | null {
  const tile = findMarker(map, marker);
  return tile ? tileCenter(vec2(tile.x, tile.y)) : null;
}
