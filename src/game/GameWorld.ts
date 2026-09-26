import type { CommandQueue } from '../core/CommandQueue';
import { Rng } from '../core/Rng';
import { vec2, type Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import { MAP_TILES, type MapDef } from '../data/schema/map';
import type { GameCommand } from './Commands';
import type { GameEventBus } from './GameEvents';
import { AiSystem } from './ai/AiSystem';
import { DamagePipeline } from './combat/DamagePipeline';
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
  /** 掉落物品等級；M7 起依樓層決定 */
  itemLevel = 1;
  readonly events: GameEventBus;
  /** 唯讀查詢服務；Render 也可用來查詢 */
  readonly targeting: TargetingService;
  readonly skills: SkillSystem;
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

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.commands = options.commands;
    this.events = options.events;
    this.map = data.maps.get(options.mapId);
    this.nav = NavGrid.fromMap(this.map);

    const rng = new Rng(options.seed);
    const pathfinder = new Pathfinder(this.nav);
    this.targeting = new TargetingService(this.actors);
    const pipeline = new DamagePipeline(data.balance, rng.fork('combat'), this.events);
    const executor = new SkillExecutor(new EffectRegistry(), {
      pipeline,
      targeting: this.targeting,
      events: this.events,
      spawnProjectile: (p) => this.projectiles.push({ ...p, id: this.nextProjectileId++ }),
    });
    this.skills = new SkillSystem(data.skills, this.targeting, pathfinder, executor, this.events);
    this.projectileSystem = new ProjectileSystem(this.nav, this.targeting, executor);
    this.ai = new AiSystem(this.targeting, this.nav, pathfinder, this.events);
    this.separation = new SeparationSystem(this.nav);
    this.deaths = new DeathSystem(this.events);

    const p = data.balance.player;
    this.spawnPoint = findSpawn(this.map);
    const { left, right } = p.startingLoadout;
    this.loadout = new PlayerLoadout(left, [...right]);
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
          attackSpeed: p.attackSpeed,
          attackRange: p.attackRange,
          critChance: p.critChance,
          defense: p.defense,
        }),
        // M6 起由技能樹決定；目前 Loadout 內的技能都視為 Lv1
        skillRanks: new Map([left, ...right].filter((id): id is string => id !== null).map((id) => [id, 1])),
      }),
    );
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
      }),
    );
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
    for (const command of this.commands.drain()) this.playerController.handle(command);
    this.potions.update(dt);
    this.regen.update(this.actors, dt);
    this.ai.update(this.actors);
    this.skills.update(this.actors, dt);
    this.movement.update(this.actors, dt);
    this.separation.update(this.actors);
    this.interaction.update();
    this.projectileSystem.update(this.projectiles, dt);
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
