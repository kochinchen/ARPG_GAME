import type { CommandQueue } from '../core/CommandQueue';
import { Rng } from '../core/Rng';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { RARITIES } from '../data/schema/item';
import type { DataRegistry } from '../data/DataRegistry';
import { MAP_TILES, type MapDef } from '../data/schema/map';
import type { GameCommand } from './Commands';
import type { GameEventBus } from './GameEvents';
import { AiSystem } from './ai/AiSystem';
import { DamagePipeline } from './combat/DamagePipeline';
import { StatusEffectSystem } from './combat/StatusEffectSystem';
import { DeathSystem } from './combat/DeathSystem';
import { BossSystem } from './enemies/BossSystem';
import { applyFloorResist, EnemyFactory, rollSize, type FloorResist } from './enemies/EnemyFactory';
import { ItemEffectSystem } from './items/ItemEffectSystem';
import { SalvageSystem } from './items/SalvageSystem';
import { Materials } from './player/Materials';
import { EQUIPMENT_SLOTS, type ItemInstance } from './items/ItemInstance';
import { Actor } from './entities/Actor';
import type { Chest, ExitPortal, GroundContent, GroundItem, Merchant, StairsUp, Waypoint } from './entities/Interactable';
import { ShopSystem } from './items/ShopSystem';
import { sortInventory } from './items/InventorySort';
import type { Projectile } from './entities/Projectile';
import { ChestSystem } from './items/ChestSystem';
import { Equipment } from './items/Equipment';
import { Inventory } from './items/Inventory';
import { ItemCursor } from './items/ItemCursor';
import { ItemGenerator } from './items/ItemGenerator';
import { LootSystem } from './items/LootSystem';
import { MovementSystem } from './movement/MovementSystem';
import { NavGrid } from './movement/NavGrid';
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
import { floorResistFor, scaleForFloor } from './world/DifficultyScaler';
import { FloorManager, mapIdForFloor } from './world/FloorManager';
import { canAscend, descendKind, selectableFloors } from './world/Endgame';
import { generateMap, generatedMapId, generateThroneMap } from './world/MapGenerator';
import { SpawnSystem } from './world/SpawnSystem';
import { findMarker, reachableTiles } from '../data/mapAnalysis';
import { TargetingService } from './targeting/TargetingService';


/** 魔王競技場的大小：魔王身體寬度的幾倍（19 × 19，約為原本 15 倍的 1.27 倍，大型魔王也不擁擠） */
const ARENA_BODIES = 19;
/** 讀檔時還原本層狀態（一般換層不需要） */
export interface FloorRestore {
  /** 已擊殺怪物的生成索引 */
  killed: readonly number[];
  midwayActive: boolean;
  /** 魔王門前的存檔點已啟動（v11） */
  bossGateActive?: boolean;
  exitOpen: boolean;
  /** 商人貨架已買走的位置 */
  shopBought?: readonly number[];
}

/** 需要存檔的亂數序列名稱（存檔的 key，改名需寫 Migration） */
export const RNG_STREAMS = ['combat', 'scheduler', 'effects', 'items', 'loot', 'ai', 'legendary', 'salvage'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

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
  /** 本層的商人（樓梯口、中途存檔點、出口旁），共用 shop 的同一個貨架；固定地圖模式沒有 */
  merchants: Merchant[] = [];
  /** 傳送口（中途存檔點啟動後：樓梯口 ⇄ 中途） */
  waypoints: Waypoint[] = [];
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
  /** 傳奇 / 神話裝備的特殊效果 */
  readonly itemEffects: ItemEffectSystem;
  private collectionVersion = -1;
  /** 滑鼠上拿著的物品 */
  readonly cursor = new ItemCursor();
  readonly wallet = new Wallet();
  /** 材料：武器精華、防具精華、飛昇碎片 */
  readonly materials = new Materials();
  /** 背包裡的拆解區 */
  readonly salvage: SalvageSystem;
  readonly interaction: InteractionSystem;
  readonly progress = new PlayerProgress();
  readonly skillTree: SkillTree;
  readonly experience: ExperienceSystem;
  readonly attributes: AttributeSystem;
  /** 掉落物品等級：等於樓層 */
  itemLevel = 1;
  /** 樓層的掉寶階級（FloorDef.lootTier） */
  lootTier = 1;
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
  /**
   * 會隨遊玩持續推進的亂數。狀態要存進存檔：否則讀檔後每條序列都從 seed 重新開始，
   * 會重跑同一串結果（例如掉出屬性完全相同的裝備）。樓層、商人等依層數重新 fork 的亂數不在這裡。
   */
  readonly rngStreams: Readonly<Record<RngStream, Rng>>;
  readonly bosses: BossSystem;
  readonly shop: ShopSystem;
  /** 累計遊戲時間（秒，只算有執行的 Tick） */
  playTime = 0;

  private nextActorId = 1;
  private nextProjectileId = 1;
  private nextInteractableId = 1;
  private readonly commands: CommandQueue<GameCommand>;
  private readonly ai: AiSystem;
  private readonly regen: RegenSystem;
  private readonly movement = new MovementSystem();
  private readonly separation: SeparationSystem;
  private readonly projectileSystem: ProjectileSystem;
  private readonly deaths: DeathSystem;
  private readonly playerController: PlayerController;
  private readonly pipeline: DamagePipeline;
  private readonly support: SupportSystem;
  private readonly data: DataRegistry;
  private readonly seed: number;
  private generated: { floor: number; map: MapDef } | null = null;
  private readonly enemyFactory = new EnemyFactory();

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.data = data;
    this.seed = options.seed;
    this.commands = options.commands;
    this.events = options.events;
    this.regen = new RegenSystem(this.events, data.balance.player.outOfCombatRegen);
    this.floors = new FloorManager(data, this.events);
    this.map = options.mapId !== undefined ? data.maps.get(options.mapId) : this.mapFor(options.floor ?? 1);
    this.nav = NavGrid.fromMap(this.map);
    this.checkpoints = new CheckpointSystem(this.events, data.balance.floor.checkpointRadius);

    // 前五條依序從同一個母序列 fork（順序不可變，否則同一個 seed 的結果會改變）
    const rng = new Rng(options.seed);
    const streams = {
      combat: rng.fork('combat'),
      scheduler: rng.fork('scheduler'),
      effects: rng.fork('effects'),
      items: rng.fork('items'),
      loot: rng.fork('loot'),
      ai: new Rng(options.seed).fork('ai'),
      legendary: new Rng(options.seed).fork('legendary'),
      salvage: new Rng(options.seed).fork('salvage'),
    };
    this.rngStreams = streams;
    const pathfinder = new Pathfinder(this.nav);
    this.targeting = new TargetingService(this.actors);
    this.statuses = new StatusEffectSystem(this.events, data.balance.combat.maxControlResist);
    this.pipeline = new DamagePipeline(data.balance, streams.combat, this.events, this.statuses);
    this.scheduler = new EffectScheduler(this.targeting, this.nav, streams.scheduler);
    const executor = new SkillExecutor(new EffectRegistry(), {
      pipeline: this.pipeline,
      targeting: this.targeting,
      statuses: this.statuses,
      events: this.events,
      nav: this.nav,
      rng: streams.effects,
      scheduler: this.scheduler,
      categoryTraits: data.balance.skillCategories,
      summon: (caster, enemyId, count, maxAlive) => this.summon(caster, enemyId, count, maxAlive),
      spawnProjectile: (p) => {
        this.projectiles.push({ ...p, id: this.nextProjectileId++ });
      },
    });
    const comboIndex = new ComboSkillIndex(data.skills);
    this.comboResolver = new ComboResolver(data.comboRules, comboIndex, data.balance.combo.nearNearFarBonus);
    this.combos = new ComboSystem(this.comboResolver, this.targeting, this.statuses, this.events);
    new ComboDiscoverySystem(this.codex, this.events);
    this.comboSlotLevels = data.balance.player.comboSlotLevels;
    this.skills = new SkillSystem(data.skills, this.targeting, pathfinder, executor, this.events, data.balance.skillCategories, this.statuses);
    this.projectileSystem = new ProjectileSystem(this.nav, this.targeting, executor);
    // 閒置走動用獨立的亂數：不影響其他系統（掉寶、戰鬥）的亂數順序
    this.ai = new AiSystem(this.targeting, this.nav, pathfinder, this.events, data.skills, streams.ai);
    this.separation = new SeparationSystem(this.nav);
    this.deaths = new DeathSystem(this.events);
    this.bosses = new BossSystem(data, this.events);

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
          hpRegenPct: p.hpRegenPctPerSec,
          manaRegenPct: p.manaRegenPctPerSec,
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
    this.inventory = new Inventory(
      p.inventoryCols,
      p.inventoryRows,
      (id) => data.potions.get(id).maxStack,
      (id) => data.potions.get(id).maxCarry,
    );
    this.inventory.addPotions(p.potionId, p.startingPotions);
    this.potions = new PotionBelt(this.player, data.potions.get(p.potionId), this.inventory, this.events);
    this.equipment = new Equipment(this.player, data, this.events);
    // 傳奇 / 神話裝備的特殊效果（施放加成由 SkillSystem 在施放瞬間詢問）
    this.itemEffects = new ItemEffectSystem(
      this.player,
      data,
      (slot) => this.equipment.get(slot),
      comboIndex,
      this.codex,
      executor,
      this.targeting,
      streams.legendary,
      this.events,
    );
    this.skills.modsHook = (actor, skill, mods) => this.itemEffects.modsFor(actor, skill, mods);
    this.interaction = new InteractionSystem(
      this.player,
      this,
      this.inventory,
      this.wallet,
      new ChestSystem(this.events),
      pathfinder,
      this.events,
      this.materials,
    );
    this.salvage = new SalvageSystem(data, this.cursor, this.materials, streams.salvage, this.events);
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
    this.itemGenerator = new ItemGenerator(data, streams.items);
    new LootSystem(
      data,
      streams.loot,
      this.itemGenerator,
      this.nav,
      (position, content) => this.spawnGroundItem(position, content),
      () => this.itemLevel,
      () => this.lootTier,
      this.events,
    );
    this.shop = new ShopSystem(
      {
        player: this.player,
        inventory: this.inventory,
        cursor: this.cursor,
        wallet: this.wallet,
        generator: this.itemGenerator,
        potionId: p.potionId,
        materials: this.materials,
      },
      data,
      this.events,
    );
    this.deathHandler = new DeathHandler(this.player, this.events, () => this.checkpoints.respawn.position, p.respawnDelay);
    // 寶箱只能開一次：記錄每層已開啟的寶箱（開發用生成的寶箱沒有索引，不記錄）
    // 怪物圖鑑：記錄擊敗過的怪物（召喚物也算）
    this.events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.defId === null) return;
      this.progress.bestiary.set(e.defId, (this.progress.bestiary.get(e.defId) ?? 0) + 1);
      this.progress.changed();
    });
    // 終局紀錄（docs/ENDGAME.md）：擊敗第 30 層的魔王 = 已通關；擊敗第 35 層的魔王 = 已完成隱藏難關
    this.events.on('ExitOpened', (e) => {
      const { lastNormalFloor, lastFloor } = this.data.balance.endgame;
      const p = this.progress;
      if (e.floor === lastNormalFloor && !p.cleared) {
        p.cleared = true;
        p.changed();
        this.events.emit('GameCleared', { stage: 'normal' });
      } else if (e.floor === lastFloor && this.floors.bossFloor && !p.completedHidden) {
        p.completedHidden = true;
        p.changed();
        this.events.emit('GameCleared', { stage: 'hidden' });
      }
    });
    this.events.on('ChestOpened', (e) => {
      const chest = this.chests.find((c) => c.id === e.chestId);
      if (chest?.spawnIndex !== undefined) this.floors.markChestOpened(this.floors.floor, chest.spawnIndex);
    });
    // 到過中途存檔點：記在這一層（以後重新進入也維持啟動），並出現傳送口
    this.events.on('CheckpointActivated', (e) => {
      if (e.kind !== 'midway') return;
      this.floors.midwayFloors.add(this.floors.floor);
      this.syncWaypoints();
    });

    if (options.mapId !== undefined) this.loadFixedMap();
    else this.enterFloor(options.floor ?? 1);
  }

  /** 這一層的地圖：隨機產生（世界種子 + 樓層，固定不變）或資料中的固定地圖 */
  private mapFor(floor: number): MapDef {
    const def = this.floors.defFor(floor);
    if (!def.layout) return this.data.maps.get(mapIdForFloor(this.data, floor));
    // 產生一次就記住（開場與讀檔時會連續要求同一層）
    if (this.generated?.floor !== floor) {
      const bodyWidth = (id: string) => {
        const e = this.data.enemies.get(id);
        return 2 * e.radius * e.size;
      };
      if (def.throne) {
        // 王座廳：整層一個直徑 = throne.bodies 個魔王身體寬度的圓形空間
        const map = generateThroneMap(generatedMapId(floor), def.throne.bodies * bodyWidth(def.throne.enemyId), def.layout.cellSize);
        this.generated = { floor, map };
        return map;
      }
      // 魔王層：以魔王的身體寬度為 1 格，競技場直徑 = ARENA_BODIES 格；挑戰樓層另有中途小王的空地
      const bossDef = def.boss && floor % def.boss.every === 0 ? this.data.enemies.get(def.boss.enemyId) : null;
      const mini = this.data.balance.endgame.miniBoss;
      const subArenas = (def.miniBosses ?? []).length
        ? Array.from({ length: mini.maxPerFloor }, (_, i) => mini.arenaBodies * bodyWidth(def.miniBosses![i % def.miniBosses!.length]!))
        : [];
      const arena = bossDef ? { diameter: ARENA_BODIES * 2 * bossDef.radius * bossDef.size, subArenas } : undefined;
      this.generated = { floor, map: generateMap(generatedMapId(floor), new Rng(this.seed).fork(`map-${floor}`), def.layout, arena) };
    }
    return this.generated.map;
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
   * 任何換層（往上或往下）都是重新進入：怪物（含魔王）重生、從樓梯口開始、出口關閉（要重新打過才能往下）；
   * 已開過的寶箱維持開啟；到過中途存檔點的樓層，中途點維持啟動並有傳送口。
   * restore：讀檔時還原本層的擊殺、存檔點與出口狀態，並回到最後啟動的存檔點。
   */
  enterFloor(floor: number, restore?: FloorRestore): void {
    const def = this.floors.defFor(floor);
    this.resetLevel(this.mapFor(floor));
    // 魔王層：通往競技場的路上、競技場外面一點的地方有魔王門前的存檔點（王座廳整層都是競技場，沒有）
    const gate = def.throne ? null : this.bossGatePosition();
    if (gate) this.checkpoints.addBossGate(gate);
    this.itemLevel = floor;
    this.lootTier = def.lootTier;
    this.progress.currentFloor = floor;
    this.progress.highestFloor = Math.max(this.progress.highestFloor, floor);

    const rng = new Rng(this.seed).fork(`floor-${floor}`);
    const spawner = new SpawnSystem(this.nav, rng);
    const scaling = scaleForFloor(floor, this.data.balance.difficulty);
    // 樓梯口與出口（上下樓的地方）的安全範圍大於怪物的偵測距離，換層時不會馬上被圍
    const { safeRadius, stairsSafeRadius } = this.data.balance.floor;
    const zones = [
      { center: this.spawnPoint, radius: stairsSafeRadius },
      ...this.checkpoints.checkpoints.slice(1).map((c) => ({ center: c.position, radius: safeRadius })),
      ...(this.exit ? [{ center: this.exit.position, radius: stairsSafeRadius }] : []),
      // 魔王競技場、小王空地裡只有魔王 / 小王
      ...(this.map.arena ? [{ center: vec2(this.map.arena.x, this.map.arena.y), radius: this.map.arena.radius + 2 }] : []),
      ...this.map.subArenas.map((a) => ({ center: vec2(a.x, a.y), radius: a.radius + 2 })),
    ];
    const safe = zones.map((z) => z.center);
    const killed = new Set(restore?.killed ?? []);
    // 只生成這一層已經開放的怪物（minFloor）
    const pool = { ...def, monsterPool: def.monsterPool.filter((m) => m.minFloor <= floor) };
    const eliteConfig = this.data.balance.elite;
    const elite =
      floor >= eliteConfig.minFloor
        ? {
            chance: def.eliteChance,
            count: def.affixCount,
            pool: this.data.eliteAffixes.all.filter((a) => a.minFloor <= floor),
            rng: new Rng(this.seed).fork(`elite-${floor}`),
          }
        : undefined;
    const plan = spawner.planMonsters(pool, scaling.density, zones, elite);
    // 隨機體型用獨立亂數：每個生成索引都擲一次（包含已擊殺的），讀檔後體型不變
    const sizeRng = new Rng(this.seed).fork(`size-${floor}`);
    const sizes = plan.map((request) => rollSize(this.data.enemies.get(request.enemyId), this.data.balance.enemySize, sizeRng));
    // 樓層減傷：精英隨機物理或屬性其一、Boss 兩種都有；同樣每個索引都擲一次，讀檔後不變
    const resistRng = new Rng(this.seed).fork(`resist-${floor}`);
    const eliteResist = floorResistFor(floor, false, eliteConfig.floorResist);
    const resists = plan.map((): FloorResist =>
      resistRng.chance(0.5) ? { physical: eliteResist, elemental: 0 } : { physical: 0, elemental: eliteResist },
    );
    const spawnedIds: [number, number][] = [];
    plan.forEach((request, index) => {
      if (killed.has(index)) return;
      const eliteSpec = request.eliteAffixes
        ? { config: eliteConfig, affixes: request.eliteAffixes.map((id) => this.data.eliteAffixes.get(id)) }
        : undefined;
      const enemyDef = this.data.enemies.get(request.enemyId);
      const enemy = this.enemyFactory.create(enemyDef, this.nextActorId++, request.position, scaling, eliteSpec, null, sizes[index]);
      if (eliteSpec) applyFloorResist(enemy, resists[index]!);
      const actor = this.addActor(enemy);
      spawnedIds.push([actor.id, index]);
    });
    // Boss 層：Boss 放在競技場中央，生成索引接在一般怪物之後（存檔的擊殺紀錄一併適用）；王座廳是最終魔王
    const bossId = def.throne?.enemyId ?? (def.boss && floor % def.boss.every === 0 ? def.boss.enemyId : null);
    const bossIndex = bossId !== null ? plan.length : undefined;
    if (bossId !== null && bossIndex !== undefined && !killed.has(bossIndex)) {
      const bossDef = this.data.enemies.get(bossId);
      const bossActor = this.enemyFactory.create(bossDef, this.nextActorId++, this.bossSpot(Math.min(0.8, bossDef.radius * bossDef.size)), scaling);
      // 最終魔王有固定的全抗性（取代樓層減傷）
      const bossResist = bossDef.fixedResist ?? floorResistFor(floor, true, eliteConfig.floorResist);
      applyFloorResist(bossActor, { physical: bossResist, elemental: bossResist });
      const boss = this.addActor(bossActor);
      spawnedIds.push([boss.id, bossIndex]);
    }
    // 挑戰樓層的中途小王：每塊空地中央一隻，依序輪流；生成索引接在魔王之後（存檔的擊殺紀錄一併適用）
    const miniConfig = this.data.balance.endgame.miniBoss;
    const miniStart = plan.length + (bossIndex === undefined ? 0 : 1);
    const minis = def.miniBosses ? this.map.subArenas.slice(0, miniConfig.maxPerFloor) : [];
    minis.forEach((spot, i) => {
      const index = miniStart + i;
      if (killed.has(index)) return;
      const miniDef = this.data.enemies.get(def.miniBosses![i % def.miniBosses!.length]!);
      const at = this.spotNear(vec2(spot.x, spot.y), 0, Math.min(0.8, miniDef.radius * miniDef.size));
      const actor = this.addActor(this.enemyFactory.create(miniDef, this.nextActorId++, at, scaling, undefined, null, undefined, miniConfig));
      applyFloorResist(actor, { physical: eliteResist, elemental: eliteResist });
      spawnedIds.push([actor.id, index]);
    });
    const monsterCount = miniStart + minis.length;
    const arenaZone = this.map.arena ? [{ center: vec2(this.map.arena.x, this.map.arena.y), radius: this.map.arena.radius + 2 }] : [];
    const chestCount = rng.int(def.chests[0], def.chests[1]);
    // 王座廳的寶箱沿外圈等距擺放（整層都是競技場，一般的擺放規則放不下）
    const chestSpots = def.throne ? this.throneChestSpots(chestCount) : spawner.planChests(chestCount, safe, [...arenaZone, ...this.map.subArenas.map((a) => ({ center: vec2(a.x, a.y), radius: a.radius + 2 }))]);
    chestSpots.forEach((position, index) => {
      const opened = this.floors.isChestOpened(floor, index);
      this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position, lootTable: def.chestLootTable, opened, spawnIndex: index });
    });
    this.floors.begin(floor, monsterCount, {
      killed: [...killed].filter((i) => i < monsterCount),
      exitOpen: restore?.exitOpen ?? false,
      ...(bossIndex === undefined ? {} : { bossIndex }),
    });
    for (const [actorId, index] of spawnedIds) this.floors.trackSpawn(actorId, index);
    if (this.exit) this.exit.open = this.floors.exitOpen;
    // 往上的樓梯：挑戰的第一層不能回到一般模式（完成隱藏難關後解除）
    this.stairsUp = canAscend(floor, this.progress, this.data.balance.endgame) ? { kind: 'stairsUp', id: this.nextInteractableId++, position: this.spawnPoint } : null;
    // 商人擺在樓梯口、中途存檔點與出口旁（背包滿了不用走回頭）；三位共用同一個貨架，貨架由世界種子 + 樓層決定
    // 王座廳沒有出口：只有樓梯口與中途存檔點的商人
    const merchantSpots = this.exit || def.throne
      ? [this.spawnPoint, this.checkpoints.checkpoints[1]?.position, this.exit?.position]
          .filter((p): p is Vec2 => p !== undefined)
          .map((p) => this.spotNear(p, 2, 0.4))
      : [];
    this.merchants = merchantSpots.map((position) => ({ kind: 'merchant', id: this.nextInteractableId++, position }));
    this.shop.open(floor, merchantSpots, new Rng(this.seed).fork(`shop-${floor}`), restore?.shopBought);
    if (restore?.midwayActive) this.floors.midwayFloors.add(floor);
    if (this.floors.midwayFloors.has(floor)) this.checkpoints.restore('midway');
    if (restore?.bossGateActive) this.checkpoints.restore('boss');
    this.syncWaypoints();
    // 讀檔：回到最後啟動的存檔點（一般換層從樓梯口開始）
    if (restore) this.placePlayer(this.checkpoints.respawn.position);
    this.events.emit('FloorEntered', { floor, mapId: this.map.id });
  }

  /**
   * 魔王門前存檔點的位置：從樓梯口沿可走的格子擴散（BFS），第一個進入「競技場半徑 + 2.5 格」的空地
   * （競技場只有這條路進得去，出口在競技場後面）。沒有競技場時為 null。
   */
  private bossGatePosition(): Vec2 | null {
    const arena = this.map.arena;
    if (!arena) return null;
    const nav = this.nav;
    const reach = arena.radius + 2.5;
    const start = nav.cellOf(this.spawnPoint);
    const w = nav.width;
    const seen = new Uint8Array(w * nav.height);
    const queue: number[] = [start.y * w + start.x];
    seen[queue[0]!] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % w;
      const y = (i - x) / w;
      const p = nav.cellCenter(vec2(x, y));
      if (Math.hypot(p.x - arena.x, p.y - arena.y) <= reach && nav.isClearAt(p, 0.5)) return p;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!nav.isWalkable(nx, ny) || seen[ny * w + nx]) continue;
        seen[ny * w + nx] = 1;
        queue.push(ny * w + nx);
      }
    }
    return null;
  }

  /** 傳送口：中途存檔點啟動後，樓梯口與中途旁各一個（位置離存檔點約 3 格，避開商人） */
  private syncWaypoints(): void {
    const stairs = this.checkpoints.get('stairs');
    const midway = this.checkpoints.get('midway');
    if (!stairs || !midway?.active) {
      this.waypoints = [];
      return;
    }
    if (this.waypoints.length > 0) return;
    this.waypoints = [
      { kind: 'waypoint', id: this.nextInteractableId++, position: this.spotNear(stairs.position, 3.2, 0.5), to: 'midway' },
      { kind: 'waypoint', id: this.nextInteractableId++, position: this.spotNear(midway.position, 3.2, 0.5), to: 'stairs' },
    ];
  }

  /** 玩家點了傳送口：傳送到另一端的存檔點 */
  useWaypoint(to: Waypoint['to']): void {
    const target = this.checkpoints.get(to);
    if (!target?.active || !this.player.alive) return;
    const from = this.player.position;
    this.placePlayer(target.position);
    this.events.emit('WaypointUsed', { from, to: target.position });
  }

  /** 王座廳的寶箱：外圈 85% 半徑上等距擺放，避開樓梯口那一側 */
  private throneChestSpots(count: number): Vec2[] {
    const arena = this.map.arena!;
    const start = Math.atan2(this.spawnPoint.y - arena.y, this.spawnPoint.x - arena.x);
    return Array.from({ length: count }, (_, i) => {
      const angle = start + ((i + 1) / (count + 1)) * Math.PI * 2;
      const p = vec2(arena.x + Math.cos(angle) * arena.radius * 0.85, arena.y + Math.sin(angle) * arena.radius * 0.85);
      return this.spotNear(p, 0, 0.45);
    });
  }

  /**
   * 讀檔時選擇前往的樓層（docs/ENDGAME.md 第 2 節）：從該層的樓梯口開始（等同重新進入該層）。
   * 不在可選範圍內的樓層會被忽略，回傳是否已前往。
   */
  startAtFloor(floor: number): boolean {
    if (floor === this.floors.floor) return false;
    if (!selectableFloors(this.progress, this.data.balance.endgame).includes(floor)) return false;
    this.enterFloor(floor);
    return true;
  }

  /** Boss 的位置：競技場中央（沒有競技場的固定地圖：出口前方約 4.5 格） */
  private bossSpot(radius: number): Vec2 {
    const arena = this.map.arena;
    if (arena) return this.spotNear(vec2(arena.x, arena.y), 0, radius);
    return this.spotNear(this.exit?.position ?? this.spawnPoint, 4.5, radius);
  }

  /** 離 target 約 distance 格、從樓梯口走得到的空地（同一張地圖一定是同一個位置） */
  private spotNear(target: Vec2, distance: number, radius: number): Vec2 {
    const exit = target;
    const stairs = findMarker(this.map, MAP_TILES.spawn)!;
    let best: Vec2 = exit;
    let bestScore = Infinity;
    for (const key of reachableTiles(this.map, stairs)) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      const p = this.nav.cellCenter(vec2(x, y));
      if (!this.nav.isClearAt(p, radius)) continue;
      const score = Math.abs(Math.hypot(p.x - exit.x, p.y - exit.y) - distance);
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }

  /** 召喚怪物（Boss 技能）：在施放者周圍的空地生成，立刻追擊施放者的目標 */
  private summon(caster: Actor, enemyId: string, count: number, maxAlive: number): void {
    const alive = this.actors.filter((a) => a.alive && a.summonedBy === caster.id).length;
    const def = this.data.enemies.get(enemyId);
    const scaling = scaleForFloor(Math.max(1, this.floors.floor), this.data.balance.difficulty);
    let spawned = 0;
    for (let i = 0; i < 12 && spawned < Math.min(count, maxAlive - alive); i++) {
      const angle = (i / 12) * Math.PI * 2;
      const p = vec2(caster.position.x + Math.cos(angle) * 1.4, caster.position.y + Math.sin(angle) * 1.4);
      if (!this.nav.isClearAt(p, def.radius)) continue;
      const minion = this.enemyFactory.create(def, this.nextActorId++, p, { ...scaling, xp: 0 }, undefined, caster.id);
      if (minion.ai && caster.ai?.targetId != null) {
        minion.ai.targetId = caster.ai.targetId;
        minion.ai.state = 'chase';
      }
      this.addActor(minion);
      spawned++;
    }
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
    this.merchants = [];
    this.waypoints = [];
    this.scheduler.clear();
    this.bosses.clear();
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
      this.events.emit('ExitLocked', { remaining: this.floors.remainingToOpen, boss: this.floors.bossFloor });
      return;
    }
    const kind = descendKind(this.floors.floor, this.progress, this.data.balance.endgame);
    if (kind === 'none') return;
    // 一般模式的最後一層：先詢問是否進入極限挑戰（進入後回不到 1～30 層）
    if (kind === 'confirmChallenge') {
      this.events.emit('ChallengeConfirm', { toFloor: this.floors.floor + 1, valuableItems: this.valuableGroundItems });
      return;
    }
    if (this.askBeforeLeaving('down')) return;
    this.floors.requestDescend();
  }

  /** 玩家點了商人（UI 開啟商店） */
  openShop(): void {
    if (this.shop.isNear()) this.events.emit('ShopOpened', {});
  }

  /** 玩家點了往上的樓梯 */
  useStairsUp(): void {
    if (!canAscend(this.floors.floor, this.progress, this.data.balance.endgame) || this.askBeforeLeaving('up')) return;
    this.floors.requestAscend();
  }

  /** 地上稀有以上的物品數量（離開樓層前提醒） */
  get valuableGroundItems(): number {
    return this.groundItems.filter((g) => g.content.kind === 'item' && RARITIES.indexOf(g.content.item.rarity) >= RARITIES.indexOf('rare')).length;
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
      case 'DebugNextFloor':
        // 開發用：不需清怪，也不詢問是否進入挑戰；最後一層沒有下一層
        if (this.floors.floor < this.data.balance.endgame.lastFloor) this.floors.forceDescend();
        return true;
      case 'ConfirmEnterChallenge':
        if (this.player.alive && this.floors.exitOpen) this.floors.requestDescend();
        return true;
      case 'DebugSpawnLoot':
        if (command.uniques) this.spawnUniqueSamples();
        else this.spawnLootSamples();
        return true;
      case 'SortInventory':
        sortInventory(this.inventory, this.data);
        return true;
      case 'ShopBuy':
        this.shop.buy(command.index);
        return true;
      case 'ShopBuyPotion':
        this.shop.buyPotions(command.count);
        return true;
      case 'ShopSell':
        this.shop.sellCell(command.cell);
        return true;
      case 'ShopSellHeld':
        this.shop.sellHeld();
        return true;
      case 'ShopSellNormals':
        this.shop.sellNormals();
        return true;
      case 'SalvageClick':
        this.salvage.click(command.slot);
        return true;
      case 'SalvageAll':
        this.salvage.salvageAll();
        return true;
      case 'ShopAscendSlotClick':
        this.shop.clickAscendSlot();
        return true;
      case 'ShopAscend':
        this.shop.ascend();
        return true;
      case 'ShopGamble':
        this.shop.gamble(command.kind);
        return true;
      case 'ConfirmLeaveFloor':
        if (this.player.alive) this.confirmLeave(command.direction);
        return true;
      default:
        return false;
    }
  }

  /** 在某點周圍的地板上生成寶箱（避開牆壁、角色與其他寶箱） */
  /** 開發用：玩家周圍一圈，每種稀有度各一件（物品等級 = 目前樓層） */
  private spawnLootSamples(): void {
    const level = Math.max(1, this.itemLevel);
    const bases = this.data.items.all.filter((b) => b.levelReq <= level);
    // 開發用：每次按都不同（不影響遊戲的亂數）
    const rng = new Rng(Date.now() % 1000003);
    RARITIES.forEach((rarity, i) => {
      const angle = (i / RARITIES.length) * Math.PI * 2;
      const at = vec2(this.player.position.x + Math.cos(angle) * 1.6, this.player.position.y + Math.sin(angle) * 1.6);
      const position = this.nav.isWalkableAt(at.x, at.y) ? at : this.player.position;
      // 橘 / 紅：從全部設計中隨機挑（任何部位，不受出現樓層限制）；其他：隨機部位的基底
      const designs = this.data.legendaries.all.filter((d) => d.rarity === rarity);
      const item =
        designs.length > 0 ? this.itemGenerator.createLegendary(rng.pick(designs), level) : this.itemGenerator.create(rng.pick(bases), rarity, level);
      this.spawnGroundItem(position, { kind: 'item', item });
    });
  }

  /** 開發用：隨機 5 件傳奇 + 5 件神話（不受出現樓層限制） */
  private spawnUniqueSamples(): void {
    const level = Math.max(1, this.itemLevel);
    const rng = new Rng(Date.now() % 100000);
    const picks = (['legendary', 'mythic'] as const).flatMap((rarity) => {
      const pool = [...this.data.legendaries.all.filter((d) => d.rarity === rarity)];
      return Array.from({ length: Math.min(5, pool.length) }, () => pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
    });
    picks.forEach((def, i) => {
      const angle = (i / picks.length) * Math.PI * 2;
      const at = vec2(this.player.position.x + Math.cos(angle) * 2, this.player.position.y + Math.sin(angle) * 2);
      const position = this.nav.isWalkableAt(at.x, at.y) ? at : this.player.position;
      this.spawnGroundItem(position, { kind: 'item', item: this.itemGenerator.createLegendary(def, level) });
    });
  }

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

  /** 裝備圖鑑：背包、裝備或手上的物品有變動時，記錄拿到過的基底與傳奇 / 神話 */
  private recordCollection(): void {
    const version = this.itemsVersion;
    if (version === this.collectionVersion) return;
    this.collectionVersion = version;
    const items: ItemInstance[] = [];
    for (const entry of [...this.inventory.cells, this.cursor.entry]) if (entry?.kind === 'item') items.push(entry.item);
    for (const slot of EQUIPMENT_SLOTS) {
      const item = this.equipment.get(slot);
      if (item) items.push(item);
    }
    const before = this.progress.collection.size;
    for (const item of items) {
      this.progress.collection.add(`base:${item.baseId}`);
      if (item.legendaryId) this.progress.collection.add(`legendary:${item.legendaryId}`);
    }
    if (this.progress.collection.size !== before) this.progress.changed();
  }

  /** 背包 / 裝備 / 手上物品的變動版本號；UI 只在變動時重建快照 */
  get itemsVersion(): number {
    return this.inventory.version + this.equipment.version + this.cursor.version + this.salvage.version + this.materials.version + this.shop.version;
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
    this.itemEffects.update(dt);
    this.bosses.update(this.actors);
    this.ai.update(this.actors, dt);
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
    this.recordCollection();
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
  return tile ? vec2((tile.x + 0.5) * map.cellSize, (tile.y + 0.5) * map.cellSize) : null;
}
