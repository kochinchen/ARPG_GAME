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
import type { Chest, GroundContent, GroundItem } from './entities/Interactable';
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
import { ExperienceSystem } from './progression/ExperienceSystem';
import { PlayerProgress } from './progression/PlayerProgress';
import { RegenSystem } from './stats/RegenSystem';
import { StatBlock } from './stats/StatBlock';
import { TargetingService } from './targeting/TargetingService';

export interface GameWorldOptions {
  data: DataRegistry;
  mapId: string;
  commands: CommandQueue<GameCommand>;
  events: GameEventBus;
  seed: number;
}

/**
 * 持有所有 Entity 與 System，依固定順序執行每個 Tick。
 */
export class GameWorld {
  readonly map: MapDef;
  readonly nav: NavGrid;
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
  /** 掉落物品等級；M7 起依樓層決定 */
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
  /** 本層重生點；M7 起由 CheckpointSystem 管理（樓梯口 / 中途） */
  readonly spawnPoint: Vec2;

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

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.commands = options.commands;
    this.events = options.events;
    this.map = data.maps.get(options.mapId);
    this.nav = NavGrid.fromMap(this.map);

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
      spawnProjectile: (p) => {
        this.projectiles.push({ ...p, id: this.nextProjectileId++ });
      },
    });
    this.comboResolver = new ComboResolver(data.comboRules, new ComboSkillIndex(data.skills));
    this.combos = new ComboSystem(this.comboResolver, this.targeting, this.statuses, this.events);
    new ComboDiscoverySystem(this.codex, this.events);
    this.comboSlotLevels = data.balance.player.comboSlotLevels;
    this.skills = new SkillSystem(data.skills, this.targeting, pathfinder, executor, this.events);
    this.projectileSystem = new ProjectileSystem(this.nav, this.targeting, executor);
    this.ai = new AiSystem(this.targeting, this.nav, pathfinder, this.events);
    this.separation = new SeparationSystem(this.nav);
    this.deaths = new DeathSystem(this.events);

    const p = data.balance.player;
    this.spawnPoint = findSpawn(this.map);
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
        position: this.spawnPoint,
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
    );
    this.support = new SupportSystem(this.player, this.loadout, data.skills);
    this.support.update();
    new LootSystem(
      data,
      rng.fork('loot'),
      new ItemGenerator(data, rng.fork('items')),
      this.nav,
      (position, content) => this.spawnGroundItem(position, content),
      () => this.itemLevel,
      this.events,
    );
    this.deathHandler = new DeathHandler(this.player, this.events, () => this.spawnPoint, p.respawnDelay);

    const enemyFactory = new EnemyFactory();
    for (const spawn of this.map.spawns) {
      const def = data.enemies.get(spawn.enemyId);
      this.addActor(enemyFactory.create(def, this.nextActorId++, vec2(...spawn.at)));
    }
    for (const chest of this.map.chests) {
      this.chests.push({ kind: 'chest', id: this.nextInteractableId++, position: vec2(...chest.at), lootTable: chest.lootTable, opened: false });
    }
  }

  /** 目前等級已解鎖的連段格數（1～3） */
  get comboSlotsUnlocked(): number {
    return this.comboSlotLevels.filter((level) => this.progress.level >= level).length;
  }

  /** 開發用指令（Input 只在 dev 版送出）；回傳是否已處理 */
  private handleDebug(command: GameCommand): boolean {
    switch (command.type) {
      case 'DebugLevelUp':
        this.experience.grantLevel();
        return true;
      case 'DebugSpawnChests':
        this.spawnChestsNear(this.player.position, command.count);
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
    for (const actor of this.actors) actor.prevPosition = actor.position;
    for (const command of this.commands.drain()) {
      if (!this.handleDebug(command)) this.playerController.handle(command);
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
    this.deaths.update(this.actors);
    this.deathHandler.update(dt);
    this.removeDead();
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

function findSpawn(map: MapDef): Vec2 {
  for (const [y, row] of map.rows.entries()) {
    const x = row.indexOf(MAP_TILES.spawn);
    if (x >= 0) return tileCenter(vec2(x, y));
  }
  throw new Error(`map '${map.id}' has no spawn`);
}
