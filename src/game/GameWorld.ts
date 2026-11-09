import type { CommandQueue } from '../core/CommandQueue';
import { Rng } from '../core/Rng';
import { distance, vec2, type Vec2 } from '../core/math/Vec2';
import { RARITIES } from '../data/schema/item';
import type { DataRegistry } from '../data/DataRegistry';
import type { FloorDef } from '../data/schema/floor';
import { MAP_TILES, type MapDef } from '../data/schema/map';
import type { GameCommand } from './Commands';
import type { GameEventBus } from './GameEvents';
import { AiSystem } from './ai/AiSystem';
import { DamagePipeline } from './combat/DamagePipeline';
import { StatusEffectSystem } from './combat/StatusEffectSystem';
import { DeathSystem } from './combat/DeathSystem';
import { BossSystem } from './enemies/BossSystem';
import { PassiveSkillSystem } from './enemies/PassiveSkillSystem';
import { applyFloorResist, EnemyFactory, NORMAL_SIZE, rollSize, visualRadiusOf, type FloorResist, rollVariant } from './enemies/EnemyFactory';
import { rollMimic, rollSpellbook, teachMimic, teachSpellbook } from './enemies/MimicSkills';
import { ItemEffectSystem } from './items/ItemEffectSystem';
import { SalvageSystem } from './items/SalvageSystem';
import { Materials } from './player/Materials';
import { EQUIPMENT_SLOTS, type ItemInstance } from './items/ItemInstance';
import { Actor } from './entities/Actor';
import type { Chest, ExitPortal, GroundContent, GroundItem, Merchant, Relic, StairsUp, StashChest, Waypoint } from './entities/Interactable';
import { ShopSystem } from './items/ShopSystem';
import { sortInventory } from './items/InventorySort';
import type { Projectile } from './entities/Projectile';
import { ChestSystem } from './items/ChestSystem';
import { Equipment } from './items/Equipment';
import { weaponDenial } from './skills/skillCategory';
import { DeviceSystem } from './skills/DeviceSystem';
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
import { SharedStash } from './items/SharedStash';
import { PlayerController } from './player/PlayerController';
import { PlayerLoadout, type ComboSlots } from './player/PlayerLoadout';
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
import { floorResistFor, hiddenBossResistFor, scaleForFloor, type FloorScaling } from './world/DifficultyScaler';
import { FloorManager, mapIdForFloor } from './world/FloorManager';
import { canAscend, descendKind, selectableFloors } from './world/Endgame';
import type { Element, StatId } from '../data/schema/common';
import { generateMap, generatedMapId, generateThroneMap, openHiddenRoom } from './world/MapGenerator';
import { placeSetPieces, setPieceSpot } from './world/SetPieces';
import { bookQuarter, buildBook, type BookPage } from '../data/book';
import { notePageInChest } from './world/Notebook';
import { BossPairSystem } from './enemies/BossPairSystem';
import { fuse } from './items/FusionResolver';
import { coreName } from './items/CoreDescriber';
import type { CoreInstance } from './items/CoreInstance';
import { rollElite, SpawnSystem, type SafeZone } from './world/SpawnSystem';
import { findMarker, reachableTiles } from '../data/mapAnalysis';
import { TargetingService } from './targeting/TargetingService';


/** 魔王競技場的大小：魔王身體寬度的幾倍（19 × 19，約為原本 15 倍的 1.27 倍，大型魔王也不擁擠） */
const ARENA_BODIES = 19;
/** 共用倉庫的寶箱：離商人的距離（格）、箱子的半徑、和樓梯 / 出口 / 存檔點、其他可以點的東西至少隔多遠 */
const STASH_MIN_DISTANCE = 2.5;
const STASH_BEST_DISTANCE = 3;
const STASH_MAX_DISTANCE = 5;
const STASH_RADIUS = 0.7;
const STASH_CLEARANCE = 2.5;
const STASH_ITEM_CLEARANCE = 1.6;
/** 首領寶箱的生成索引（一般寶箱是 0 起的流水號，不會撞到） */
const CHAMPION_CHEST_INDEX = 1000;
/**
 * 屍體：怪物死後留在地上，換樓層才消失（重新進入樓層時怪物重生）。不是 Actor：不擋路、不能被選取、AI 與技能都看不到，只給畫面用。
 * 存檔只記生成索引、位置與面向；外觀（哪一種怪、體型）讀檔時由生成索引推導。
 */
export interface Corpse {
  /** 生成索引（沒有索引的怪不存檔） */
  index: number | null;
  defId: string;
  position: Vec2;
  facing: Vec2;
  visualRadius: number;
  /** 讀檔還原的（直接躺在地上，不播倒地動作） */
  restored: boolean;
}

/** 存檔裡的屍體 */
export interface SavedCorpse {
  index: number;
  x: number;
  y: number;
  /** 面向（弧度） */
  facing: number;
}

/** 讀檔時還原本層狀態（一般換層不需要） */
export interface FloorRestore {
  /** 本層的屍體（v18） */
  corpses?: readonly SavedCorpse[];
  /** 已擊殺怪物的生成索引 */
  killed: readonly number[];
  midwayActive: boolean;
  /** 魔王門前的存檔點已啟動（v11） */
  bossGateActive?: boolean;
  exitOpen: boolean;
  /** 商人貨架已買走的位置 */
  shopBought?: readonly number[];
  /** 這一層的隱藏魔王（v22） */
  hiddenBoss?: HiddenBossState | null;
}

/** 這一層的隱藏魔王：魔王、抽到的兩種屬性（順序決定上色）、是否已被打倒 */
export interface HiddenBossState {
  enemyId: string;
  /** 每次出招從中抽一種（萬骸之口抽兩種並決定上色；噬界足眼是吐息的三種） */
  elements: Element[];
  /** 這次隨機抽到的抗性（再和樓層減傷疊加） */
  resists: { stat: StatId; value: number }[];
  dead: boolean;
}

/** 需要存檔的亂數序列名稱（存檔的 key，改名需寫 Migration） */
export const RNG_STREAMS = ['combat', 'scheduler', 'effects', 'items', 'loot', 'ai', 'legendary', 'salvage', 'sockets', 'fusion'] as const;
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
  private reachableCache: { map: MapDef; tiles: readonly Vec2[] } | null = null;
  /** 共用倉庫的寶箱（每位商人旁邊一個，都連到同一個倉庫） */
  stashChests: StashChest[] = [];
  /** 本層散落的遺物 */
  relics: Relic[] = [];
  /** 傳送口（中途存檔點啟動後：樓梯口 ⇄ 中途） */
  waypoints: Waypoint[] = [];
  readonly checkpoints: CheckpointSystem;
  readonly floors: FloorManager;
  readonly actors: Actor[] = [];
  readonly projectiles: Projectile[] = [];
  readonly groundItems: GroundItem[] = [];
  readonly chests: Chest[] = [];
  /** 本層的屍體（換樓層時清空） */
  readonly corpses: Corpse[] = [];
  /** 怪物尋路繞開主角放在地上的區域（每個 Tick 更新 hazards） */
  private readonly pathfinder: Pathfinder;
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
  readonly stash: SharedStash;
  readonly interaction: InteractionSystem;
  readonly progress = new PlayerProgress();
  readonly skillTree: SkillTree;
  readonly experience: ExperienceSystem;
  readonly attributes: AttributeSystem;
  /** 掉落物品等級：等於樓層 */
  itemLevel = 1;
  /** 《井誌》的所有頁 */
  private readonly bookPages: readonly BookPage[];
  /** 本層一般寶箱的數量（筆記頁選寶箱用） */
  private floorChestCount = 0;
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
  private readonly comboKeyLevels: readonly number[];
  readonly deathHandler: DeathHandler;
  readonly itemGenerator: ItemGenerator;
  /**
   * 會隨遊玩持續推進的亂數。狀態要存進存檔：否則讀檔後每條序列都從 seed 重新開始，
   * 會重跑同一串結果（例如掉出屬性完全相同的裝備）。樓層、商人等依層數重新 fork 的亂數不在這裡。
   */
  readonly rngStreams: Readonly<Record<RngStream, Rng>>;
  readonly bosses: BossSystem;
  private readonly passives: PassiveSkillSystem;
  readonly shop: ShopSystem;
  /** 累計遊戲時間（秒，只算有執行的 Tick） */
  playTime = 0;

  private nextActorId = 1;
  private nextProjectileId = 1;
  private nextInteractableId = 1;
  private readonly commands: CommandQueue<GameCommand>;
  private readonly ai: AiSystem;
  private readonly devices: DeviceSystem;
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
  /** 本層活著的首領（被擊敗時在原地放首領寶箱）；沒有首領或已被擊敗為 null */
  private champion: { actorId: number } | null = null;
  /** 這一層的隱藏魔王（存檔內容）；這次沒有骰到為 null */
  hiddenBoss: HiddenBossState | null = null;
  readonly bossPairs: BossPairSystem;
  private hiddenBossActor: number | null = null;
  /** 開發用：每次進入有隱藏房的樓層都出現（網址 ?hiddenboss） */
  forceHiddenBoss = false;

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.data = data;
    this.bookPages = buildBook(data);
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
      // 掉落時的孔數、融合（v0.5.0）：獨立的序列，不改變既有的掉落結果
      sockets: new Rng(options.seed).fork('sockets'),
      fusion: new Rng(options.seed).fork('fusion'),
    };
    this.rngStreams = streams;
    const pathfinder = (this.pathfinder = new Pathfinder(this.nav));
    pathfinder.hazardCost = data.balance.enemyTactics.avoidZones.pathCost;
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
      sealSkill: (target, duration) => this.sealSkill(target, duration),
      placeDevice: (def, ctx) => this.devices.place(def, ctx),
      spawnProjectile: (p) => {
        this.projectiles.push({ ...p, id: this.nextProjectileId++ });
      },
    }, data.skills);
    const comboIndex = new ComboSkillIndex(data.skills);
    this.comboResolver = new ComboResolver(data.comboRules, comboIndex, data.balance.combo.nearNearFarBonus);
    this.combos = new ComboSystem(this.comboResolver, this.targeting, this.statuses, this.events);
    new ComboDiscoverySystem(this.codex, this.events);
    this.comboSlotLevels = data.balance.player.comboSlotLevels;
    this.comboKeyLevels = data.balance.player.comboKeyLevels;
    this.skills = new SkillSystem(data.skills, this.targeting, pathfinder, executor, this.events, data.balance.skillCategories, this.statuses);
    this.skills.leadMaxTime = data.balance.enemyTactics.leadShot.maxTime;
    this.projectileSystem = new ProjectileSystem(this.nav, this.targeting, executor);
    // 閒置走動用獨立的亂數：不影響其他系統（掉寶、戰鬥）的亂數順序
    this.ai = new AiSystem(this.targeting, this.nav, pathfinder, data.skills, streams.ai, data.balance.devices, data.balance.enemyTactics, this.events, data.enemies);
    this.devices = new DeviceSystem(this.actors, this.targeting, this.nav, this.events, data.balance.devices, () => this.nextActorId++);
    this.separation = new SeparationSystem(this.nav);
    this.deaths = new DeathSystem(this.events);
    this.bosses = new BossSystem(data, this.events, new Rng(options.seed).fork('boss-routine'), (id) => this.targeting.getActor(id) ?? null, (boss, enemyId) => this.spawnDetached(boss, enemyId));
    this.bossPairs = new BossPairSystem(data, this.events, new Rng(options.seed).fork('boss-pair'), this.nav, this.actors, (actor) => this.bosses.phaseOf(actor));
    // 被動技能的時間差：獨立的亂數序列（不影響其他系統的亂數順序，也不必存檔）
    this.passives = new PassiveSkillSystem(data, executor, new Rng(options.seed).fork('passives'), this.events);

    const p = data.balance.player;
    const start = markerPoint(this.map, MAP_TILES.spawn)!;
    const { left, combos, supports } = p.startingLoadout;
    this.loadout = new PlayerLoadout(
      left,
      combos.map((c) => [...c] as ComboSlots),
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
      this.equipment,
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
      }, (item) => data.items.get(item.baseId).levelReq <= this.progress.level && (item.sockets?.cores ?? []).every((c) => c.itemLevel <= this.progress.level),
      (core) => core.itemLevel <= this.progress.level),
      this.skillTree,
      this.combos,
      data.skills,
      () => this.comboSlotsUnlocked,
      () => this.comboKeysUnlocked,
      this.attributes,
      this.events,
      (skillId) => this.weaponDenial(skillId),
    );
    this.support = new SupportSystem(this.player, this.loadout, data.skills);
    this.support.update();
    this.itemGenerator = new ItemGenerator(data, streams.items, streams.sockets);
    this.stash = new SharedStash(data.balance.stash, this.cursor, this.inventory, () => this.itemGenerator.newUid(), this.events);
    new LootSystem(
      data,
      streams.loot,
      this.itemGenerator,
      this.nav,
      (position, content) => this.spawnGroundItem(position, content),
      () => this.itemLevel,
      () => this.lootTier,
      () => this.floors.floor,
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
        fusionRng: streams.fusion,
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
    // 魔王第一次倒下：魂魄飄出，說出那個人的真相（每個存檔一次；中途小王與召喚物沒有）
    this.events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || !e.boss || e.miniBoss || e.summoned || e.actorId === this.hiddenBossActor || (e.defId !== null && this.data.enemies.has(e.defId) && this.data.enemies.get(e.defId).pair)) return;
      const soul = this.data.souls.all.find((s) => s.floor === this.floors.floor);
      if (!soul || this.progress.souls.has(soul.id)) return;
      const found = this.bookFound();
      this.progress.souls.add(soul.id);
      this.progress.changed();
      this.events.emit('SoulReleased', { soulId: soul.id, smoke: soul.smoke, position: e.position });
      this.grantBookReward(found);
    });
    // 怪物死後留下屍體（召喚物、機關不留）
    this.events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || e.summoned || e.defId === null) return;
      const actor = this.targeting.getActor(e.actorId);
      if (!actor) return;
      this.corpses.push({
        index: this.floors.spawnIndex(e.actorId) ?? null,
        defId: e.defId,
        position: vec2(actor.position.x, actor.position.y),
        facing: vec2(actor.facing.x, actor.facing.y),
        visualRadius: actor.visualRadius,
        restored: false,
      });
    });
    // 怪物喝掉地上的藥水：藥水消失（一疊只少一瓶）
    this.events.on('EnemyDrankPotion', (e) => {
      const i = this.groundItems.findIndex((g) => g.id === e.itemId);
      const item = this.groundItems[i];
      if (!item || item.content.kind !== 'potion') return;
      if (item.content.count > 1) item.content.count--;
      else this.groundItems.splice(i, 1);
    });
    // 屍體被吃掉 / 復活：從地上移除；復活的在原地站起來
    this.events.on('CorpseConsumed', (e) => {
      const i = this.corpses.indexOf(e.corpse as Corpse);
      if (i < 0) return;
      const [corpse] = this.corpses.splice(i, 1);
      const caster = this.targeting.getActor(e.actorId);
      if (e.kind === 'raise' && corpse && caster) this.raiseCorpse(caster, corpse);
    });
    // 死亡技能（結晶獸的晶核碎裂）
    this.events.on('ActorDied', (e) => {
      const actor = this.targeting.getActor(e.actorId);
      if (actor && !e.summoned) this.passives.onActorDied(actor);
    });
    // 首領被擊敗：原地出現首領寶箱
    this.events.on('ActorDied', (e) => {
      if (this.champion !== null && e.actorId === this.champion.actorId) this.placeChampionChest(e.position);
      if (this.hiddenBoss && e.actorId === this.hiddenBossActor && !this.data.enemies.get(this.hiddenBoss.enemyId).pair) this.hiddenBoss.dead = true;
    });
    this.events.on('BossPairDefeated', () => {
      if (this.hiddenBoss) this.hiddenBoss.dead = true;
    });
    this.events.on('ChestOpened', (e) => {
      const chest = this.chests.find((c) => c.id === e.chestId);
      if (chest?.spawnIndex === undefined) return;
      this.floors.markChestOpened(this.floors.floor, chest.spawnIndex);
      this.findNotePage(chest.spawnIndex, e.position);
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
      const hidden = this.data.balance.hiddenBoss;
      const generated = generateMap(generatedMapId(floor), new Rng(this.seed).fork(`map-${floor}`), def.layout, arena, hidden.roomFloors.includes(floor) ? hidden.roomSize : undefined);
      // 小說的固定場景：獨立亂數，放不下就跳過，不影響地圖產生
      const pieces = this.data.setPieces.all.filter((p) => p.floor === floor);
      this.generated = { floor, map: placeSetPieces(generated, pieces, new Rng(this.seed).fork(`set-piece-${floor}`)) };
    }
    return this.generated.map;
  }

  /**
   * 這一層的隱藏魔王：每次進入樓層（新樓層或回到上一層）擲一次；讀檔不重擲（不能靠重新整理刷魔王）。
   * 屬性隨機抽兩種，順序決定上色的區塊。
   */
  private rollHiddenBoss(floor: number): HiddenBossState | null {
    const config = this.data.balance.hiddenBoss;
    const boss = config.bosses.find((b) => b.floors.includes(floor));
    if (!boss) return null;
    const rng = new Rng(this.seed).fork(`hidden-boss-${floor}-${Math.round(this.playTime * 60)}`);
    if (!this.forceHiddenBoss && !rng.chance(config.chance)) return null;
    const pool = [...boss.elements];
    const first = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const second = pool[rng.int(0, pool.length - 1)]!;
    const resists: HiddenBossState['resists'] = [];
    if (boss.resists) {
      const value = hiddenBossResistFor(floor, this.data.balance.elite.floorResist);
      const stats = [...boss.resists.stats];
      for (let i = 0; i < boss.resists.count; i++) resists.push({ stat: stats.splice(rng.int(0, stats.length - 1), 1)[0]!, value });
    }
    return { enemyId: boss.enemyId, elements: boss.allElements ? [...boss.elements] : [first, second], resists, dead: false };
  }

  /** 打開隱藏房並放魔王（一般怪物、寶箱都已經照封閉的地圖放好，所以有沒有魔王，這些東西的位置都一樣） */
  private openHiddenBoss(state: HiddenBossState, scaling: FloorScaling, floor: number): void {
    this.map = openHiddenRoom(this.map);
    this.nav.load(this.map);
    const room = this.map.hiddenRoom!;
    this.checkpoints.addBossGate(this.spotNear(vec2(room.door[0], room.door[1]), 0, 0.5));
    if (state.dead) return;
    const def = this.data.enemies.get(state.enemyId);
    const place = (id: string, center: Vec2): Actor => {
      const d = this.data.enemies.get(id);
      const actor = this.enemyFactory.create(d, this.nextActorId++, this.spotNear(center, 0, Math.min(0.8, d.radius * d.size)), scaling);
      actor.innateElements = state.elements;
      const resist = hiddenBossResistFor(floor, this.data.balance.elite.floorResist);
      applyFloorResist(actor, { physical: resist, elemental: resist });
      for (const r of state.resists) actor.stats.addModifier({ stat: r.stat, kind: 'flat', value: r.value, source: 'hidden-boss-resist' });
      this.addActor(actor);
      // 不算進開出口的擊殺數：可以不打
      this.floors.excludeFromClear(actor.id);
      return actor;
    };
    // 成對的魔王：另一隻站在旁邊
    this.hiddenBossActor = place(state.enemyId, def.pair ? vec2(room.x - 3, room.y) : vec2(room.x, room.y)).id;
    if (def.pair) place(def.pair.partner, vec2(room.x + 3, room.y));
  }

  /** 奪取：主角裝備的技能隨機一個暫時不能用（已經在冷卻更久的不算）；普通攻擊不會被奪走 */
  private sealSkill(target: Actor, duration: number): void {
    if (target !== this.player) return;
    const pool = [...new Set(this.loadout.combos.flat())].filter((id): id is string => id !== null && (target.cooldowns.get(id) ?? 0) < duration);
    if (pool.length === 0) return;
    const skillId = this.rngStreams.effects.pick(pool);
    target.cooldowns.set(skillId, duration);
    this.events.emit('SkillSealed', { actorId: target.id, position: target.position, skillId, duration });
  }

  /** 這個魔王這次隨機抽到的抗性（不是隱藏魔王，或這隻不抽抗性：空） */
  randomResistsOf(actor: Actor): readonly { stat: StatId; value: number }[] {
    return actor.id === this.hiddenBossActor ? (this.hiddenBoss?.resists ?? []) : [];
  }

  /** 這件遺物在固定場景裡的位置（沒有對應的場景：null） */
  private setPieceRelicSpot(loreId: string): Vec2 | null {
    const def = this.data.setPieces.all.find((p) => p.relic?.loreId === loreId);
    const placed = def && this.map.setPieces.find((p) => p.id === def.id);
    if (!def?.relic || !placed) return null;
    const spot = setPieceSpot(placed, def.relic.u, def.relic.v);
    return this.nav.isClearAt(spot, 0.5) ? spot : null;
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
    this.ai.floor = floor;
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
    // 固定場景的房間裡不放怪物與寶箱；牆面場景前也一樣，讓玩家看得清楚
    const setPieceZones = this.map.setPieces.map((p) => ({ center: vec2(p.x + p.w / 2, p.y + p.h / 2), radius: Math.hypot(p.w, p.h) / 2 + 1 }));
    const zones = [
      { center: this.spawnPoint, radius: stairsSafeRadius },
      ...this.checkpoints.checkpoints.slice(1).map((c) => ({ center: c.position, radius: safeRadius })),
      ...(this.exit ? [{ center: this.exit.position, radius: stairsSafeRadius }] : []),
      // 魔王競技場、小王空地裡只有魔王 / 小王
      ...(this.map.arena ? [{ center: vec2(this.map.arena.x, this.map.arena.y), radius: this.map.arena.radius + 2 }] : []),
      ...this.map.subArenas.map((a) => ({ center: vec2(a.x, a.y), radius: a.radius + 2 })),
      ...setPieceZones,
      // 隱藏房打開後，噴錢的結晶獸也不能生成在裡面
      ...(this.map.hiddenRoom ? [{ center: vec2(this.map.hiddenRoom.x, this.map.hiddenRoom.y), radius: this.map.hiddenRoom.size * 0.75 }] : []),
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
    const planned = spawner.planMonsters(pool, scaling.density, zones, elite);
    // 隨機體型用獨立亂數：每個生成索引都擲一次（包含已擊殺的），讀檔後體型不變
    const sizeRng = new Rng(this.seed).fork(`size-${floor}`);
    const sizes = planned.map((request) => rollSize(this.data.enemies.get(request.enemyId), this.data.balance.enemySize, sizeRng));
    // 特化型依體型決定（精英隨機）；同樣每個索引都擲一次，讀檔後不變
    const variantRng = new Rng(this.seed).fork(`variant-${floor}`);
    const plan = planned.map((request, i) => ({
      ...request,
      enemyId: rollVariant(this.data.enemies.get(request.enemyId), floor, sizes[i]!.scale, request.eliteAffixes !== undefined, this.data.balance.enemySize, variantRng),
    }));
    // 樓層減傷：精英隨機物理或屬性其一、Boss 兩種都有；同樣每個索引都擲一次，讀檔後不變
    const resistRng = new Rng(this.seed).fork(`resist-${floor}`);
    const eliteResist = floorResistFor(floor, false, eliteConfig.floorResist);
    const resists = plan.map((): FloorResist =>
      resistRng.chance(0.5) ? { physical: eliteResist, elemental: 0 } : { physical: 0, elemental: eliteResist },
    );
    // 怪物學主角技能：同樣每個索引都擲一次，讀檔後不變；精英必定學到
    const mimicRng = new Rng(this.seed).fork(`mimic-${floor}`);
    const mimics = plan.map((request) =>
      rollMimic(this.data.enemies.get(request.enemyId), floor, request.eliteAffixes !== undefined, this.data.skills, this.data.balance.enemyMimic, mimicRng),
    );
    // 法師的法術書：同樣每個索引都擲一次（獨立的亂數，不影響其他的抽選），讀檔後不變
    const spellbookRng = new Rng(this.seed).fork(`spellbook-${floor}`);
    const spellbooks = plan.map((request) => rollSpellbook(this.data.enemies.get(request.enemyId), floor, request.eliteAffixes !== undefined, this.data.skills, this.data.balance.mageSpellbook, spellbookRng));
    // 每一群生成時的隻數（含已擊殺的）：求援看「被打掉幾成」
    const packSizes = new Map<number, number>();
    for (const request of plan) if (request.pack !== undefined) packSizes.set(request.pack, (packSizes.get(request.pack) ?? 0) + 1);
    const spawnedIds: [number, number][] = [];
    /** 每個生成索引的外觀（讀檔還原屍體用） */
    const looks = new Map<number, { defId: string; visualRadius: number }>();
    plan.forEach((request, index) => {
      const look = this.data.enemies.get(request.enemyId);
      looks.set(index, { defId: look.id, visualRadius: visualRadiusOf(look, sizes[index], request.eliteAffixes ? eliteConfig.radiusMultiplier : 1) });
      if (killed.has(index)) return;
      const eliteSpec = request.eliteAffixes
        ? { config: eliteConfig, affixes: request.eliteAffixes.map((id) => this.data.eliteAffixes.get(id)) }
        : undefined;
      const enemyDef = this.data.enemies.get(request.enemyId);
      const enemy = this.enemyFactory.create(enemyDef, this.nextActorId++, request.position, scaling, eliteSpec, null, sizes[index]);
      if (eliteSpec) applyFloorResist(enemy, resists[index]!);
      const mimic = mimics[index];
      if (mimic) teachMimic(enemy, mimic);
      const spellbook = spellbooks[index];
      if (spellbook) teachSpellbook(enemy, spellbook, floor, this.data.balance.enemyMimic, this.data.balance.mageSpellbook);
      if (enemy.ai && request.pack !== undefined) enemy.ai.pack = { id: request.pack, size: packSizes.get(request.pack)! };
      const actor = this.addActor(enemy);
      spawnedIds.push([actor.id, index]);
    });
    // Boss 層：Boss 放在競技場中央，生成索引接在一般怪物之後（存檔的擊殺紀錄一併適用）；王座廳是最終魔王
    const bossId = def.throne?.enemyId ?? (def.boss && floor % def.boss.every === 0 ? def.boss.enemyId : null);
    const bossIndex = bossId !== null ? plan.length : undefined;
    if (bossId !== null && bossIndex !== undefined) looks.set(bossIndex, { defId: bossId, visualRadius: visualRadiusOf(this.data.enemies.get(bossId), NORMAL_SIZE) });
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
      const miniDef = this.data.enemies.get(def.miniBosses![i % def.miniBosses!.length]!);
      looks.set(index, { defId: miniDef.id, visualRadius: visualRadiusOf(miniDef, NORMAL_SIZE) });
      if (killed.has(index)) return;
      const at = this.spotNear(vec2(spot.x, spot.y), 0, Math.min(0.8, miniDef.radius * miniDef.size));
      const actor = this.addActor(this.enemyFactory.create(miniDef, this.nextActorId++, at, scaling, undefined, null, undefined, miniConfig));
      applyFloorResist(actor, { physical: eliteResist, elemental: eliteResist });
      spawnedIds.push([actor.id, index]);
    });
    // 沒有魔王的樓層：出口前有一隻該層怪物的首領，生成索引接在最後（存檔的擊殺紀錄一併適用）
    const championIndex = bossId === null && this.exit ? miniStart + minis.length : undefined;
    this.champion = null;
    const championSpot =
      championIndex !== undefined ? this.spawnChampion(floor, pool.monsterPool, championIndex, killed.has(championIndex), scaling, eliteResist, spawnedIds, looks) : null;
    const monsterCount = championIndex !== undefined ? championIndex + 1 : miniStart + minis.length;
    const arenaZone = this.map.arena ? [{ center: vec2(this.map.arena.x, this.map.arena.y), radius: this.map.arena.radius + 2 }] : [];
    const chestCount = rng.int(def.chests[0], def.chests[1]);
    // 王座廳的寶箱沿外圈等距擺放（整層都是競技場，一般的擺放規則放不下）
    const chestSpots = def.throne ? this.throneChestSpots(chestCount) : spawner.planChests(chestCount, safe, [...arenaZone, ...setPieceZones, ...this.map.subArenas.map((a) => ({ center: vec2(a.x, a.y), radius: a.radius + 2 }))]);
    chestSpots.forEach((position, index) => {
      const opened = this.floors.isChestOpened(floor, index);
      this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position, lootTable: def.chestLootTable, opened, spawnIndex: index });
    });
    this.floorChestCount = chestCount;
    // 遺物：內容固定、位置由世界種子 + 樓層決定（獨立亂數，不影響怪物與寶箱）
    const relicDefs = this.data.lore.all.filter((l) => l.floor === floor && !l.hidden);
    const relicSpots = relicDefs.length === 0
      ? []
      : new SpawnSystem(this.nav, new Rng(this.seed).fork(`relic-${floor}`)).planChests(relicDefs.length, [...safe, ...chestSpots], [
          ...arenaZone,
          ...this.map.subArenas.map((a) => ({ center: vec2(a.x, a.y), radius: a.radius + 2 })),
        ]);
    this.relics = relicDefs.flatMap((l, i) => {
      // 場景裡的遺物固定放在場景內；場景放不下時維持隨機位置
      const position = this.setPieceRelicSpot(l.id) ?? relicSpots[i];
      return position ? [{ kind: 'relic' as const, id: this.nextInteractableId++, position, loreId: l.id, read: this.progress.lore.has(l.id) }] : [];
    });
    // 隱藏遺物：打完隱藏難關才出現（同樣用獨立亂數，不影響其他東西的位置）
    if (this.progress.completedHidden) {
      for (const l of this.data.lore.all.filter((d) => d.floor === floor && d.hidden)) {
        const seat = this.raiseSeatWall(l.id, [...safe, ...chestSpots, ...relicSpots], [...arenaZone, ...setPieceZones]);
        if (seat) this.relics.push({ kind: 'relic', id: this.nextInteractableId++, position: seat.position, loreId: l.id, read: this.progress.lore.has(l.id), seatForward: seat.forward });
      }
    }
    this.floors.begin(floor, monsterCount, {
      killed: [...killed].filter((i) => i < monsterCount),
      exitOpen: restore?.exitOpen ?? false,
      ...(bossIndex === undefined ? {} : { bossIndex }),
      ...(championIndex === undefined ? {} : { championIndex }),
    });
    // 讀檔：還原屍體（只還原這一層確實擊殺過的）
    for (const c of restore?.corpses ?? []) {
      const look = looks.get(c.index);
      if (!look || !killed.has(c.index)) continue;
      this.corpses.push({ index: c.index, ...look, position: vec2(c.x, c.y), facing: vec2(Math.cos(c.facing), Math.sin(c.facing)), restored: true });
    }
    // 讀檔時首領已被擊敗、寶箱還沒開：寶箱放在首領原本站的位置
    if (championSpot && championIndex !== undefined && killed.has(championIndex)) this.placeChampionChest(championSpot);
    for (const [actorId, index] of spawnedIds) this.floors.trackSpawn(actorId, index);
    // 隱藏魔王（放在 floors.begin 之後：excludeFromClear 不能被 begin 清掉）；讀檔沿用存檔的結果
    this.hiddenBoss = restore ? (restore.hiddenBoss ?? null) : this.rollHiddenBoss(floor);
    this.hiddenBossActor = null;
    if (this.hiddenBoss && this.map.hiddenRoom) this.openHiddenBoss(this.hiddenBoss, scaling, floor);
    if (!def.throne && !restore) this.spawnGoldWalkers(floor, safe, zones, plan.map((r) => r.position), scaling, eliteResist);
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
    this.stashChests = this.stashSpots(merchantSpots).map((position) => ({ kind: 'stash', id: this.nextInteractableId++, position }));
    if (restore?.midwayActive) this.floors.midwayFloors.add(floor);
    if (this.floors.midwayFloors.has(floor)) this.checkpoints.restore('midway');
    if (restore?.bossGateActive) this.checkpoints.restore('boss');
    this.syncWaypoints();
    // 讀檔：回到最後啟動的存檔點（一般換層從樓梯口開始）
    if (restore) this.placePlayer(this.checkpoints.respawn.position);
    this.events.emit('FloorEntered', { floor, mapId: this.map.id });
    if (this.hiddenBoss && !this.hiddenBoss.dead && !restore) this.events.emit('HiddenBossAwake', { name: this.data.enemies.get(this.hiddenBoss.enemyId).name });
  }

  /**
   * 噴錢的結晶獸：每次進入樓層，balance.goldWalker.chances 每個機率各自擲一次，中幾個就出現幾隻；讀檔不呼叫（不能靠重新整理刷錢）。
   * 分散在地圖上、離其他怪物一段距離（單獨行動）。不進怪物池、不算精英，也不算進開出口的擊殺數；體型固定（不擲隨機體型）。
   * 亂數加上遊戲時間，每次進入都不同；這是獨立的亂數，不影響其他怪物與寶箱。
   */
  private spawnGoldWalkers(floor: number, safe: readonly Vec2[], zones: readonly SafeZone[], others: readonly Vec2[], scaling: FloorScaling, eliteResist: number): void {
    const config = this.data.balance.goldWalker;
    if (floor < config.minFloor) return;
    const rng = new Rng(this.seed).fork(`gold-walker-${floor}-${Math.round(this.playTime * 60)}`);
    let count = 0;
    for (const chance of config.chances) if (rng.chance(chance)) count++;
    if (count === 0) return;
    const elite = this.data.balance.elite;
    const away = others.map((center) => ({ center, radius: config.alone }));
    for (const position of new SpawnSystem(this.nav, rng).planChests(count, safe, [...zones, ...away])) {
      const def = this.data.enemies.get(rng.pick(config.enemies));
      const enemy = this.enemyFactory.create(def, this.nextActorId++, position, scaling, undefined, null, NORMAL_SIZE, undefined, elite);
      applyFloorResist(enemy, rng.chance(0.5) ? { physical: eliteResist, elemental: 0 } : { physical: 0, elemental: eliteResist });
      this.floors.excludeFromClear(this.addActor(enemy).id);
    }
  }

  /**
   * 每層的首領：從本層的怪物池抽一隻（獨立亂數，不改變其他怪物與寶箱），套用首領倍率與 2～3 個精英詞綴，
   * 站在出口前 guardDistance 格的空地。回傳站的位置（讀檔時已被擊敗：不生成，寶箱放這裡）。
   */
  private spawnChampion(
    floor: number,
    monsterPool: FloorDef['monsterPool'],
    index: number,
    defeated: boolean,
    scaling: FloorScaling,
    resist: number,
    spawnedIds: [number, number][],
    looks: Map<number, { defId: string; visualRadius: number }>,
  ): Vec2 {
    const config = this.data.balance.champion;
    const rng = new Rng(this.seed).fork(`champion-${floor}`);
    // 首領和精英一樣：原版與已解鎖的特化型隨機（獨立亂數，不影響其他的抽選）
    const picked = this.data.enemies.get(rng.weighted(monsterPool).enemyId);
    const def = this.data.enemies.get(rollVariant(picked, floor, NORMAL_SIZE.scale, true, this.data.balance.enemySize, new Rng(this.seed).fork(`champion-variant-${floor}`)));
    const affixes = rollElite({ chance: 1, count: config.affixCount, pool: this.data.eliteAffixes.all.filter((a) => a.minFloor <= floor), rng }) ?? [];
    const spot = this.spotNear(this.exit!.position, config.guardDistance, Math.min(0.8, def.radius * def.size * config.radiusMultiplier));
    looks.set(index, { defId: def.id, visualRadius: visualRadiusOf(def, NORMAL_SIZE, config.radiusMultiplier) });
    if (defeated) return spot;
    const eliteSpec = {
      config: { ...this.data.balance.elite, ...config },
      affixes: affixes.map((id) => this.data.eliteAffixes.get(id)),
      title: '首領・',
    };
    const actor = this.addActor(this.enemyFactory.create(def, this.nextActorId++, spot, scaling, eliteSpec));
    applyFloorResist(actor, { physical: resist, elemental: resist });
    const mimic = rollMimic(def, floor, true, this.data.skills, this.data.balance.enemyMimic, rng);
    if (mimic) teachMimic(actor, mimic);
    const spellbook = rollSpellbook(def, floor, true, this.data.skills, this.data.balance.mageSpellbook, new Rng(this.seed).fork(`champion-spellbook-${floor}`));
    if (spellbook) teachSpellbook(actor, spellbook, floor, this.data.balance.enemyMimic, this.data.balance.mageSpellbook);
    this.champion = { actorId: actor.id };
    spawnedIds.push([actor.id, index]);
    return spot;
  }

  /** 首領寶箱（每層只能開一次；已開過就不再出現） */
  private placeChampionChest(at: Vec2): void {
    if (this.floors.isChestOpened(this.floors.floor, CHAMPION_CHEST_INDEX)) return;
    const position = this.spotNear(at, 0, 0.45);
    this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position, lootTable: this.data.balance.champion.chestLootTable, opened: false, spawnIndex: CHAMPION_CHEST_INDEX });
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

  /**
   * 共用倉庫的寶箱位置：每位商人旁邊隔一點距離，避開樓梯、出口、存檔點、傳送口與其他可以點的東西，點擊時不會點錯。
   * 只由地圖推導（不用亂數、不存檔），不影響這一層的其他內容。找不到合適位置的商人旁邊就不放。
   */
  private stashSpots(merchantSpots: readonly Vec2[]): Vec2[] {
    const stairs = findMarker(this.map, MAP_TILES.spawn);
    if (!stairs || merchantSpots.length === 0) return [];
    const midway = this.checkpoints.checkpoints[1]?.position;
    const avoid: { at: Vec2; radius: number }[] = [
      { at: this.spawnPoint, radius: STASH_CLEARANCE },
      ...(this.exit ? [{ at: this.exit.position, radius: STASH_CLEARANCE }] : []),
      ...this.checkpoints.checkpoints.map((c) => ({ at: c.position, radius: STASH_CLEARANCE })),
      ...merchantSpots.map((at) => ({ at, radius: STASH_MIN_DISTANCE })),
      // 傳送口要走到中途才出現，位置先算好讓開
      { at: this.spotNear(this.spawnPoint, 3.2, 0.5), radius: STASH_ITEM_CLEARANCE },
      ...(midway ? [{ at: this.spotNear(midway, 3.2, 0.5), radius: STASH_ITEM_CLEARANCE }] : []),
      ...this.chests.map((c) => ({ at: c.position, radius: STASH_ITEM_CLEARANCE })),
      ...this.relics.map((r) => ({ at: r.position, radius: STASH_ITEM_CLEARANCE })),
      ...this.map.setPieces.map((p) => ({ at: vec2(p.x + p.w / 2, p.y + p.h / 2), radius: Math.hypot(p.w, p.h) / 2 + 1 })),
    ];
    const spots: Vec2[] = [];
    for (const merchant of merchantSpots) {
      let best: Vec2 | null = null;
      let bestScore = Infinity;
      for (const p of this.reachableCenters(stairs)) {
        const d = distance(p, merchant);
        if (d < STASH_MIN_DISTANCE || d > STASH_MAX_DISTANCE) continue;
        const score = Math.abs(d - STASH_BEST_DISTANCE);
        if (score >= bestScore || !this.nav.isClearAt(p, STASH_RADIUS)) continue;
        if (avoid.some((a) => distance(p, a.at) < a.radius) || spots.some((s) => distance(p, s) < STASH_MIN_DISTANCE)) continue;
        best = p;
        bestScore = score;
      }
      if (best) spots.push(best);
    }
    return spots;
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
  /** 開寶箱：這個寶箱夾著一頁筆記嗎？湊齊時給獎勵 */
  private findNotePage(spawnIndex: number, position: Vec2): void {
    const owned = this.progress.notebook;
    const found = this.bookFound();
    const note = notePageInChest(this.data.notebook.all, { floor: this.floors.floor, spawnIndex, floorChests: this.floorChestCount }, this.seed, owned);
    if (!note) return;
    owned.add(note.id);
    this.progress.changed();
    this.events.emit('NotePageFound', { noteId: note.id });
    this.grantBookReward(found);
  }

  /** 《井誌》收集到的頁數 */
  private bookFound(): number {
    const p = this.progress;
    return this.bookPages.filter((page) => (page.kind === 'soul' ? p.souls : page.kind === 'lore' ? p.lore : p.notebook).has(page.sourceId)).length;
  }

  /** 剛多收集一頁：跨過 1/4、2/4、3/4、4/4 時給獎勵（只在跨過的當下，不另外存檔） */
  private grantBookReward(foundBefore: number): void {
    const total = this.bookPages.length;
    const quarter = bookQuarter(this.bookFound(), total);
    if (quarter === bookQuarter(foundBefore, total)) return;
    const level = Math.max(1, this.itemLevel);
    const rng = new Rng(this.seed).fork(`book-${quarter}`);
    const at = this.player.position;
    const school = this.topSkillSchool();
    const { weaponKinds, armors, attributePoints } = this.data.balance.book;
    let reward: string;
    if (quarter === 1) {
      const core = this.rollOrangeCore(level, rng);
      this.spawnGroundItem(at, { kind: 'core', core });
      reward = `一顆橘色的${coreName(core, this.data)}`;
    } else if (quarter === 2) {
      const pool = this.data.legendaries.all.filter((d) => d.rarity === 'legendary' && (weaponKinds[school] as readonly string[]).includes(d.kind));
      const def = rng.pick(pool);
      this.spawnGroundItem(at, { kind: 'item', item: this.itemGenerator.createLegendary(def, level) });
      reward = `橘裝武器「${def.name}」`;
    } else if (quarter === 3) {
      const def = this.data.legendaries.get(rng.pick(armors[school]));
      this.spawnGroundItem(at, { kind: 'item', item: this.itemGenerator.createLegendary(def, level) });
      reward = `橘裝鎧甲「${def.name}」`;
    } else {
      this.progress.attributePoints += attributePoints;
      this.progress.changed();
      reward = `額外 ${attributePoints} 點屬性點（到角色面板分配）`;
    }
    this.events.emit('BookMilestone', { quarter, reward });
  }

  /** 技能點最多的路線（近戰 / 遠程 / 魔法）；戰術與輔助不對應武器，不算；都沒點算近戰 */
  private topSkillSchool(): 'melee' | 'ranged' | 'magic' {
    const points = { melee: 0, ranged: 0, magic: 0 };
    for (const [id, rank] of this.player.skillRanks) {
      const category = this.data.skills.get(id).tree?.category;
      if (category === 'melee' || category === 'ranged' || category === 'magic') points[category] += rank;
    }
    return (['melee', 'ranged', 'magic'] as const).reduce((best, s) => (points[s] > points[best] ? s : best));
  }

  /** 隨機橘核：用四件同種類的橘裝走正常的融合，核階、屬性與玩家融出來的相同 */
  private rollOrangeCore(level: number, rng: Rng): CoreInstance {
    const pool = this.data.legendaries.all.filter((d) => d.rarity === 'legendary' && d.kind !== 'ring' && d.kind !== 'amulet');
    const kind = rng.pick(pool).kind;
    const same = pool.filter((d) => d.kind === kind);
    const inputs = Array.from({ length: this.data.balance.fusion.inputs.max }, () => this.itemGenerator.createLegendary(rng.pick(same), level));
    return fuse(inputs, [], this.data, rng, this.itemGenerator.newUid());
  }

  /**
   * 隱藏遺物靠著的牆：在空地上生兩塊牆（四周都是地板，不會擋路），她坐在南邊（這一面畫得出來）。
   * 打完隱藏難關才有，只改這次載入的地圖，不影響生成與存檔。
   */
  private raiseSeatWall(id: string, avoid: Vec2[], zones: { center: Vec2; radius: number }[]): { position: Vec2; forward: Vec2 } | null {
    const spots = new SpawnSystem(this.nav, new Rng(this.seed).fork(`relic-${id}`)).planChests(24, avoid, zones);
    const cell = this.nav.cell;
    // 一塊 = 1 Tile 見方（地圖一格可能只有 0.5 Tile）
    const n = Math.round(1 / cell);
    for (const spot of spots) {
      const { x: cx, y: cy } = this.nav.cellOf(spot);
      let open = true;
      for (let y = cy - 3 * n; y < cy + 2 * n; y++) for (let x = cx - 2 * n; x < cx + 2 * n; x++) open &&= this.nav.isWalkable(x, y);
      if (!open) continue;
      const position = vec2(cx * cell, cy * cell + 0.6);
      const crowded = [...this.actors.map((a) => a.position), ...avoid].some((p) => Math.hypot(p.x - position.x, p.y - position.y) < 2.5);
      if (crowded) continue;
      const rows = this.map.rows.map((row, y) => (y >= cy - n && y < cy ? `${row.slice(0, cx - n)}${MAP_TILES.wall.repeat(2 * n)}${row.slice(cx + n)}` : row));
      this.map = { ...this.map, rows };
      this.nav.load(this.map);
      return { position, forward: vec2(0, 1) };
    }
    return spots[0] ? { position: spots[0], forward: vec2(0, 1) } : null;
  }

  /** 翻開遺物：記進井誌，UI 顯示舊紙頁 */
  readRelic(relic: Relic): void {
    relic.read = true;
    if (this.progress.lore.has(relic.loreId)) {
      this.events.emit('RelicRead', { loreId: relic.loreId });
      return;
    }
    const found = this.bookFound();
    this.progress.lore.add(relic.loreId);
    this.progress.changed();
    this.events.emit('RelicRead', { loreId: relic.loreId });
    this.grantBookReward(found);
  }

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

  /** 從樓梯口走得到的格子中心（一層會問好幾次，算一次就記住） */
  private reachableCenters(stairs: { x: number; y: number }): readonly Vec2[] {
    if (this.reachableCache?.map !== this.map) {
      const tiles = [...reachableTiles(this.map, stairs)].map((key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        return this.nav.cellCenter(vec2(x, y));
      });
      this.reachableCache = { map: this.map, tiles };
    }
    return this.reachableCache.tiles;
  }

  /** 離 target 約 distance 格、從樓梯口走得到的空地（同一張地圖一定是同一個位置） */
  private spotNear(target: Vec2, distance: number, radius: number): Vec2 {
    const exit = target;
    const stairs = findMarker(this.map, MAP_TILES.spawn)!;
    let best: Vec2 = exit;
    let bestScore = Infinity;
    for (const p of this.reachableCenters(stairs)) {
      const score = Math.abs(Math.hypot(p.x - exit.x, p.y - exit.y) - distance);
      // 距離先比（便宜），比目前最好的近才檢查空地
      if (score < bestScore && this.nav.isClearAt(p, radius)) {
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

  /** 骷髏法師復活屍體：同一種怪在屍體的位置站起來，血量 raise.hp；算召喚物（不給經驗、不掉寶、不留屍體、不算擊殺數） */
  private raiseCorpse(caster: Actor, corpse: Corpse): void {
    const def = this.data.enemies.get(corpse.defId);
    const scaling = scaleForFloor(Math.max(1, this.floors.floor), this.data.balance.difficulty);
    const radius = def.radius;
    const position = this.nav.isClearAt(corpse.position, radius) ? corpse.position : this.spotNear(corpse.position, 0, radius);
    const raised = this.enemyFactory.create(def, this.nextActorId++, position, { ...scaling, xp: 0 }, undefined, caster.id);
    raised.hp = raised.maxHp * this.data.balance.enemyTactics.raise.hp;
    raised.facing = corpse.facing;
    if (raised.ai && caster.ai?.targetId != null) {
      raised.ai.targetId = caster.ai.targetId;
      raised.ai.state = 'chase';
    }
    this.addActor(raised);
  }

  /** 魔王身上脫離出來的怪物（噬界足眼的尾巴）：和魔王同樣的樓層倍率與減傷，不給經驗、不掉寶、不算進開出口的擊殺數 */
  private spawnDetached(boss: Actor, enemyId: string): Actor | null {
    const def = this.data.enemies.get(enemyId);
    const floor = Math.max(1, this.floors.floor);
    const behind = vec2(boss.position.x - boss.facing.x * 1.6, boss.position.y - boss.facing.y * 1.6);
    const position = this.nav.isClearAt(behind, def.radius) ? behind : boss.position;
    const tail = this.enemyFactory.create(def, this.nextActorId++, position, { ...scaleForFloor(floor, this.data.balance.difficulty), xp: 0 }, undefined, boss.id);
    const resist = hiddenBossResistFor(floor, this.data.balance.elite.floorResist);
    applyFloorResist(tail, { physical: resist, elemental: resist });
    if (tail.ai && boss.ai?.targetId != null) {
      tail.ai.targetId = boss.ai.targetId;
      tail.ai.state = 'chase';
    }
    return this.addActor(tail);
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

  /** 開發工具（魔王模擬器）：放一隻怪物，倍率與樓層減傷比照第 floor 層（enterFloor 的魔王規則）；隱藏魔王要給 innateElements */
  spawnScaledEnemy(enemyId: string, floor: number, position: Vec2, innateElements: readonly Element[] | null = null): Actor {
    const def = this.data.enemies.get(enemyId);
    const actor = this.enemyFactory.create(def, this.nextActorId++, position, scaleForFloor(floor, this.data.balance.difficulty));
    if (def.boss) {
      const floorResist = this.data.balance.elite.floorResist;
      const hidden = this.data.balance.hiddenBoss.bosses.some((b) => b.enemyId === enemyId);
      const resist = def.fixedResist ?? (hidden ? hiddenBossResistFor(floor, floorResist) : floorResistFor(floor, true, floorResist));
      applyFloorResist(actor, { physical: resist, elemental: resist });
    }
    actor.innateElements = innateElements;
    const spellbook = rollSpellbook(def, floor, false, this.data.skills, this.data.balance.mageSpellbook, new Rng(this.seed).fork(`spellbook-sim-${this.nextActorId}`));
    if (spellbook) teachSpellbook(actor, spellbook, floor, this.data.balance.enemyMimic, this.data.balance.mageSpellbook);
    return this.addActor(actor);
  }

  /** 換地圖並清空本層所有實體；玩家回到樓梯口（陣列就地清空，其他系統持有的參考仍有效） */
  private resetLevel(map: MapDef): void {
    this.map = map;
    this.nav.load(map);
    this.actors.length = 0;
    this.actors.push(this.player);
    this.corpses.length = 0;
    this.projectiles.length = 0;
    this.groundItems.length = 0;
    this.chests.length = 0;
    this.stairsUp = null;
    this.merchants = [];
    this.stashChests = [];
    this.relics = [];
    this.waypoints = [];
    this.scheduler.clear();
    this.bosses.clear();
    this.bossPairs.clear();
    this.passives.clear();
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
      this.events.emit('ExitLocked', { remaining: this.floors.remainingToOpen, boss: this.floors.bossFloor, champion: this.floors.championAlive });
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

  /** 玩家點了共用倉庫（UI 開啟倉庫面板） */
  openStash(): void {
    if (this.stashNear) this.events.emit('StashOpened', {});
  }

  /** 玩家在某個倉庫寶箱附近（離開就關面板，也不能遠端存取） */
  get stashNear(): boolean {
    const range = this.data.balance.stash.range;
    return this.stashChests.some((s) => distance(this.player.position, s.position) <= range);
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

  /** 目前等級已解鎖的連段組數（Q 起算，1～7） */
  get comboKeysUnlocked(): number {
    return this.comboKeyLevels.filter((level) => this.progress.level >= level).length;
  }

  /** 目前等級已解鎖的連段格數（1～3） */
  get comboSlotsUnlocked(): number {
    return this.comboSlotLevels.filter((level) => this.progress.level >= level).length;
  }

  /** 目前的武器禁用這個技能時回傳原因（「法杖無法使用近戰技能」），可以用回傳 null */
  weaponDenial(skillId: string): string | null {
    if (!this.data.skills.has(skillId)) return null;
    return weaponDenial(this.data.skills.get(skillId), this.equipment.weaponType(), this.data.balance.weaponRules, this.equipment.get('shield') !== undefined);
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
      case 'MarkCutsceneSeen':
        if (command.id && !this.progress.cutscenes.has(command.id)) {
          this.progress.cutscenes.add(command.id);
          this.progress.changed();
        }
        return true;
      case 'DebugSpawnLoot':
        if (command.uniques) this.spawnUniqueSamples(command.ids);
        else this.spawnLootSamples();
        return true;
      case 'DebugClearStash':
        this.stash.clear();
        return true;
      case 'DebugFusionKit':
        this.spawnFusionKit(command.highLevel ? 45 : undefined);
        return true;
      case 'SortInventory':
        sortInventory(this.inventory, this.data);
        return true;
      case 'Respec':
        if (command.kind === 'skills') this.respecSkills();
        else this.respecAttributes();
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
      case 'ShopSellUpTo':
        this.shop.sellUpTo(command.rarity);
        return true;
      case 'SalvageClick':
        this.salvage.click(command.slot);
        return true;
      case 'SalvageAll':
        this.salvage.salvageAll();
        return true;
      case 'StashClick':
        if (this.stashNear) this.stash.click(command.cell);
        return true;
      case 'StashDeposit':
        if (this.stashNear) this.stash.deposit(command.cell, command.fromCell);
        return true;
      case 'StashWithdraw':
        if (this.stashNear) this.stash.withdraw(command.cell);
        return true;
      case 'StashSortPage':
        if (this.stashNear) this.stash.sortPage(command.page, this.data);
        return true;
      case 'ShopAscendSlotClick':
        this.shop.clickAscendSlot();
        return true;
      case 'ShopAscend':
        this.shop.ascend();
        return true;
      case 'ShopClosed':
        this.shop.returnForgeItems((item) => {
          this.spawnGroundItem(this.player.position, { kind: 'item', item }).droppedByPlayer = true;
          this.events.emit('ItemDropped', { position: this.player.position });
        });
        return true;
      case 'ShopReroll':
        this.shop.reroll(command.index);
        return true;
      case 'ShopDrill':
        this.shop.drill();
        return true;
      case 'ShopFusionSlotClick':
        this.shop.clickFusionSlot(command.zone, command.index);
        return true;
      case 'ShopDismissFused':
        this.shop.dismissFused();
        return true;
      case 'ShopFuse':
        this.shop.fuse(command.confirm, (core) => {
          this.spawnGroundItem(this.player.position, { kind: 'core', core }).droppedByPlayer = true;
          this.events.emit('ItemDropped', { position: this.player.position });
        });
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
  /** 洗點的金幣：round(base × 等級^exponent) */
  respecCost(kind: 'skills' | 'attributes'): number {
    const c = this.data.balance.respec[kind];
    return Math.round(c.base * this.progress.level ** c.exponent);
  }

  /** 已用掉的技能點（起始免費的技能不算） */
  get spentSkillPoints(): number {
    const free = new Set(this.data.balance.player.startingSkills);
    let n = 0;
    for (const [id, rank] of this.player.skillRanks) if (this.data.skills.get(id).tree) n += rank - (free.has(id) ? 1 : 0);
    return n;
  }

  /**
   * 重置技能點：技能回到起始狀態、點數全部退回、已開通的 T4 退回開通次數；
   * 連段與 Support 欄裡已經沒學的技能清空，左鍵換回起始技能。
   */
  respecSkills(): boolean {
    const spent = this.spentSkillPoints;
    if (spent === 0 && this.progress.t4Unlocked.size === 0) return this.respecFailed('skills', 'nothing');
    const cost = this.respecCost('skills');
    if (!this.wallet.spend(cost)) return this.respecFailed('skills', 'gold');
    const p = this.data.balance.player;
    const free = new Set(p.startingSkills);
    for (const id of [...this.player.skillRanks.keys()]) {
      if (!this.data.skills.get(id).tree) continue;
      if (free.has(id)) this.player.skillRanks.set(id, 1);
      else this.player.skillRanks.delete(id);
    }
    this.progress.skillPoints += spent;
    this.progress.t4Charges += this.progress.t4Unlocked.size;
    this.progress.t4Unlocked.clear();
    const known = (id: string | null) => id !== null && this.player.skillRanks.has(id);
    if (!known(this.loadout.left)) this.loadout.left = p.startingLoadout.left;
    for (const combo of this.loadout.combos) combo.forEach((id, i) => (combo[i] = known(id) ? id : null));
    this.loadout.supports.forEach((id, i) => (this.loadout.supports[i] = known(id) ? id : null));
    this.support.update();
    this.progress.changed();
    this.events.emit('Respec', { kind: 'skills', gold: cost });
    return true;
  }

  /** 重置屬性點：全部退回成未分配的點數 */
  respecAttributes(): boolean {
    let refund = 0;
    for (const points of this.progress.attributes.values()) refund += points;
    if (refund === 0) return this.respecFailed('attributes', 'nothing');
    const cost = this.respecCost('attributes');
    if (!this.wallet.spend(cost)) return this.respecFailed('attributes', 'gold');
    this.progress.attributes.clear();
    this.progress.attributePoints += refund;
    this.attributes.apply();
    this.progress.changed();
    this.events.emit('Respec', { kind: 'attributes', gold: cost });
    return true;
  }

  private respecFailed(kind: 'skills' | 'attributes', reason: 'gold' | 'nothing'): false {
    this.events.emit('RespecFailed', { kind, reason });
    return false;
  }

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

  /** 開發用：融合測試包——金幣、精華、四把武器（劍、劍、弓、傳奇斧）、一件 2 孔頭盔 */
  private spawnFusionKit(itemLevel?: number): void {
    const level = itemLevel ?? Math.max(1, this.itemLevel);
    this.wallet.add(20000);
    this.materials.add('weaponEssence', 200);
    this.materials.add('armorEssence', 100);
    const base = (pred: (b: (typeof this.data.items.all)[number]) => boolean) => this.data.items.all.filter((b) => pred(b) && b.levelReq <= level).at(-1)!;
    const axeLegend = this.data.legendaries.all.find((d) => d.rarity === 'legendary' && d.kind === 'axe')!;
    const items = [
      this.itemGenerator.create(base((b) => b.weaponType === 'sword'), 'normal', level),
      this.itemGenerator.create(base((b) => b.weaponType === 'sword'), 'rare', level),
      this.itemGenerator.create(base((b) => b.weaponType === 'bow'), 'magic', level),
      this.itemGenerator.createLegendary(axeLegend, level),
      { ...this.itemGenerator.create(base((b) => b.slot === 'helmet'), 'magic', level), sockets: { max: 2, cores: [] } },
    ];
    items.forEach((item, i) => {
      const angle = (i / items.length) * Math.PI * 2;
      const at = vec2(this.player.position.x + Math.cos(angle) * 1.6, this.player.position.y + Math.sin(angle) * 1.6);
      this.spawnGroundItem(this.nav.isWalkableAt(at.x, at.y) ? at : this.player.position, { kind: 'item', item });
    });
  }

  /** 開發用：隨機 5 件傳奇 + 5 件神話（不受出現樓層限制） */
  private spawnUniqueSamples(ids?: string[]): void {
    const level = Math.max(1, this.itemLevel);
    const rng = new Rng(Date.now() % 100000);
    const chosen = ids?.filter((id) => this.data.legendaries.has(id)).map((id) => this.data.legendaries.get(id));
    const picks = chosen?.length ? chosen : (['legendary', 'mythic'] as const).flatMap((rarity) => {
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
    return this.inventory.version + this.equipment.version + this.cursor.version + this.salvage.version + this.materials.version + this.shop.version + this.stash.version;
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
    this.bosses.update(this.actors, dt);
    this.passives.update(this.actors, dt);
    // 怪物要繞開的區域：主角（與召喚物）放在地上的持續區域，跟著施放者走的（劍刃旋舞）不算
    this.pathfinder.hazards = this.scheduler.zones.filter((z) => z.ctx.caster.faction === 'player' && !z.followCaster);
    this.ai.update(this.actors, dt, this.projectiles, this);
    // 放在 AI 之後：一起出招的意圖才不會被 AI 蓋掉
    this.bossPairs.update(dt);
    this.combos.update(this.actors);
    this.skills.update(this.actors, dt);
    this.movement.update(this.actors, dt);
    this.separation.update(this.actors);
    this.interaction.update();
    this.projectileSystem.update(this.projectiles, dt);
    this.scheduler.update(dt);
    this.devices.update(dt);
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
