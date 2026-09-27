import { Container, Graphics, type Application } from 'pixi.js';
import type { IsoProjection } from '../core/math/IsoProjection';
import { lerp, sub, type Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import type { ActorId } from '../game/entities/Actor';
import type { GameWorld } from '../game/GameWorld';
import type { Camera } from './Camera';
import { ELEMENT_COLORS, PALETTE } from './palette';
import { ActorView, HIT_BOX, sizeOf } from './views/ActorView';
import { EffectLayer } from './views/EffectLayer';
import { FloatingTextLayer } from './views/FloatingTextLayer';
import { InteractableLayer } from './views/InteractableLayer';
import { FloorMarkersView } from './views/FloorMarkersView';
import { TileMapView } from './views/TileMapView';
import { MinimapView, type MinimapMarker } from './views/MinimapView';

/**
 * 每幀唯讀讀取 GameWorld，同步 PixiJS 畫面。不修改任何遊戲狀態。
 */
/** 畫面外多少像素內仍然繪製角色（避免邊緣突然出現） */
const CULL_MARGIN = 120;

export class Renderer {
  private readonly worldLayer = new Container();
  private readonly objectLayer = new Container({ sortableChildren: true });
  private readonly marker = new Graphics();
  private readonly floatingText = new FloatingTextLayer();
  private tileMap: TileMapView;
  private minimap: MinimapView;
  private readonly markers: FloorMarkersView;
  private readonly effects: EffectLayer;
  private readonly interactables: InteractableLayer;
  private readonly actorViews = new Map<ActorId, ActorView>();
  private hoveredId: ActorId | null = null;
  private hoveredInteractable: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly projection: IsoProjection,
    private readonly world: GameWorld,
    private readonly camera: Camera,
    data: Pick<DataRegistry, 'items' | 'affixes' | 'potions' | 'skills'>,
  ) {
    this.tileMap = new TileMapView(projection, world.nav, this.objectLayer, world.floors.def?.theme);
    this.effects = new EffectLayer(projection, this.objectLayer);
    this.interactables = new InteractableLayer(projection, this.objectLayer, data);
    this.markers = new FloorMarkersView(projection);
    this.markers.rebuild(world.checkpoints.checkpoints);
    this.marker.poly([0, -6, 12, 0, 0, 6, -12, 0]).stroke({ color: PALETTE.marker, width: 2 });

    this.worldLayer.addChild(
      this.tileMap.floor,
      this.markers.container,
      this.effects.ground,
      this.interactables.ground,
      this.marker,
      this.objectLayer,
      this.interactables.labels,
      this.floatingText.container,
    );
    app.stage.addChild(this.worldLayer);
    // 小地圖在畫面座標（不跟著鏡頭移動）
    this.minimap = this.createMinimap();
    app.stage.addChild(this.minimap.container);

    const resize = () => camera.setViewport(app.screen.width, app.screen.height);
    resize();
    app.renderer.on('resize', resize);

    world.events.on('ActorDamaged', (e) => {
      this.floatingText.spawn(projection.toScreen(e.position), e.amount, e.isCrit);
      this.actorViews.get(e.targetId)?.hit();
    });
    // 換樓層：重建地圖與地面標記（角色、物品依 ID 同步，會自動清掉）
    world.events.on('FloorEntered', () => {
      this.tileMap.destroy();
      this.tileMap = new TileMapView(projection, world.nav, this.objectLayer, world.floors.def?.theme);
      this.worldLayer.addChildAt(this.tileMap.floor, 0);
      this.markers.rebuild(world.checkpoints.checkpoints);
      this.minimap.destroy();
      this.minimap = this.createMinimap();
      this.app.stage.addChild(this.minimap.container);
    });
    world.events.on('SkillCast', (e) => {
      const attacker = world.targeting.getActor(e.actorId);
      if (!attacker) return;
      const skill = data.skills.get(e.skillId);
      if (skill.telegraph) {
        // 前搖提示：在地上畫出攻擊範圍，填滿時命中
        const area = skill.effects.find((effect) => effect.type === 'area');
        this.actorViews.get(e.actorId)?.attack(e.impactIn, skill.tags.includes('spell') ? 'cast' : 'attack');
        if (area?.type === 'area') {
          const center = skill.targeting === 'ground' ? e.point : attacker.position;
          const active = () => attacker.alive && attacker.cast?.skill.id === skill.id;
          this.effects.spawnTelegraph(center, area.radius, e.direction, area.angleDeg ?? 360, e.impactIn, active);
        }
        return;
      }
      // 所有出手都揮動手臂（前搖期間舉起、命中時揮下）；法術播放施法動作；對單一敵人的技能（近戰）再加上前衝
      this.actorViews.get(e.actorId)?.attack(e.impactIn, skill.tags.includes('spell') ? 'cast' : 'attack');
      if (e.targetId === null) return;
      const dir = sub(projection.toScreen(e.point), projection.toScreen(attacker.position));
      this.actorViews.get(e.actorId)?.lunge(dir);
    });
    world.events.on('AreaTriggered', (e) => {
      this.effects.spawnRing(e.position, e.radius, ELEMENT_COLORS[e.element ?? 'physical'] ?? 0xffffff, e.direction, e.angleDeg);
    });
    world.events.on('ChainTriggered', (e) => this.effects.spawnChain(e.points, ELEMENT_COLORS[e.element] ?? 0xffffff));
    world.events.on('SkillFailed', (e) => {
      const actor = world.targeting.getActor(e.actorId);
      if (actor === world.player) this.floatingText.spawnText(projection.toScreen(actor.position), '魔力不足', PALETTE.manaText);
    });
    const say = (position: Vec2, text: string, color: number) =>
      this.floatingText.spawnText(projection.toScreen(position), text, color);
    world.events.on('GoldPickedUp', (e) => say(e.position, `+${e.amount} 金幣`, PALETTE.marker));
    world.events.on('PotionPickedUp', (e) => say(e.position, `+${e.count} 藥水`, PALETTE.healText));
    world.events.on('PickupFailed', () => say(world.player.position, '背包已滿', PALETTE.manaText));
    world.events.on('EquipFailed', (e) =>
      say(world.player.position, e.reason === 'level' ? '等級不足' : '無法裝備在這裡', PALETTE.manaText),
    );
    world.events.on('PlayerLeveledUp', (e) => {
      this.floatingText.spawnText(projection.toScreen(world.player.position), `升級！Lv ${e.level}`, PALETTE.marker, 20);
    });
    world.events.on('ShopTransaction', (e) => {
      const text = e.kind === 'sell' ? `+${e.gold} 金幣` : `${e.gold} 金幣`;
      say(world.player.position, text, PALETTE.marker);
    });
    world.events.on('ShopFailed', (e) => {
      const text = { gold: '金幣不足', inventoryFull: '背包已滿', far: '離商人太遠' }[e.reason];
      say(world.player.position, text, PALETTE.manaText);
    });
    world.events.on('BossPhaseChanged', (e) => {
      const boss = world.targeting.getActor(e.actorId);
      if (boss) this.floatingText.spawnText(projection.toScreen(boss.position), `${e.name}：${e.label}！`, PALETTE.critText, 22);
    });
    world.events.on('MasteryAchieved', () => say(world.player.position, '精通！其他類別開放', PALETTE.manaText));
    world.events.on('ComboCompleted', (e) => {
      this.floatingText.spawnText(projection.toScreen(world.player.position), e.name, PALETTE.critText, 18);
    });
    world.events.on('ComboInterrupted', () => say(world.player.position, '連段中斷', PALETTE.manaText));
    world.events.on('CheckpointActivated', (e) => say(e.position, '存檔點已啟動', PALETTE.manaText));
    world.events.on('ExitOpened', () => say(world.player.position, '出口已開啟', 0xe0c8ff));
    world.events.on('ExitLocked', (e) =>
      say(world.player.position, e.boss ? '擊敗 Boss 後出口才會開啟' : `還需擊敗 ${e.remaining} 隻`, PALETTE.manaText),
    );
    world.events.on('StatusTriggered', (e) => {
      const actor = world.targeting.getActor(e.actorId);
      if (!actor) return;
      if (e.kind === 'guard') say(actor.position, '格擋', PALETTE.hoverName);
      if (e.kind === 'counter') say(actor.position, '反擊！', PALETTE.critText);
    });
    world.events.on('PotionUsed', (e) => {
      const at = projection.toScreen(world.player.position);
      this.floatingText.spawnText(at, `+${Math.round(e.hpRestored)} HP  +${Math.round(e.mpRestored)} MP`, PALETTE.healText);
    });
  }

  /** 游標下的地上物品或寶箱（名稱標籤也算） */
  pickInteractableAt(screen: Vec2): number | null {
    const local = sub(screen, this.camera.offset);
    const exit = this.world.exit ? [this.world.exit] : [];
    const stairs = this.world.stairsUp ? [this.world.stairsUp] : [];
    const merchant = this.world.merchant ? [this.world.merchant] : [];
    return this.interactables.pickAt(local, [...stairs, ...merchant, ...exit, ...this.world.chests.filter((c) => !c.opened), ...this.world.groundItems]);
  }

  /** 游標下的敵對角色（畫面空間判定，點到頭或身體都算）；由 Input 在送出指令前呼叫 */
  pickActorAt(screen: Vec2): ActorId | null {
    const local = sub(screen, this.camera.offset);
    let best: ActorId | null = null;
    let bestDepth = -Infinity;
    for (const actor of this.world.actors) {
      if (!actor.alive || actor === this.world.player) continue;
      if (!this.world.targeting.isHostile(this.world.player.faction, actor.faction)) continue;
      const feet = this.projection.toScreen(actor.position);
      const dx = local.x - feet.x;
      const dy = local.y - feet.y;
      // 大型怪物（重甲、精英、Boss）的判定範圍跟著放大
      const k = sizeOf(actor);
      if (Math.abs(dx) > HIT_BOX.halfWidth * k || dy < HIT_BOX.top * k || dy > HIT_BOX.bottom) continue;
      // 重疊時選最前面（最靠近鏡頭）的
      const depth = this.projection.depth(actor.position);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = actor.id;
      }
    }
    return best;
  }

  setHovered(actorId: ActorId | null, interactableId: number | null = null): void {
    this.hoveredId = actorId;
    this.hoveredInteractable = interactableId;
  }

  get hovered(): ActorId | null {
    return this.hoveredId;
  }

  /** alpha：本幀在兩個邏輯 Tick 之間的比例，用於位置插值 */
  render(alpha: number): void {
    const dt = this.app.ticker.deltaMS / 1000;
    const player = this.world.player;
    const playerPos = lerp(player.prevPosition, player.position, alpha);

    this.camera.follow(playerPos);
    this.worldLayer.position.set(this.camera.offset.x, this.camera.offset.y);

    this.syncActorViews(alpha, dt);
    this.tileMap.update(playerPos, dt);
    this.minimap.update(playerPos, this.minimapMarkers());
    this.interactables.setHovered(this.hoveredInteractable);
    this.interactables.update(this.world.groundItems, this.world.chests, this.world.exit, this.world.floors.floor + 1, this.world.stairsUp, this.world.merchant, this.app.ticker.deltaMS / 1000);
    this.markers.update(this.app.ticker.lastTime);
    this.effects.update(dt, this.world.projectiles, alpha, this.world.scheduler.zones, this.world.scheduler.pending);
    this.floatingText.update(dt);
    this.updateMarker(player.intent === null ? player.path[player.path.length - 1] : undefined);
  }

  /** Tab：切換小地圖 / 全地圖 */
  toggleMap(): void {
    this.minimap.toggle();
  }

  private createMinimap(): MinimapView {
    return new MinimapView(this.world.nav, this.world.floors.def?.theme, () => this.app.screen);
  }

  /** 小地圖上的標記（揭開後才顯示） */
  private minimapMarkers(): MinimapMarker[] {
    const w = this.world;
    const markers: MinimapMarker[] = [{ kind: 'stairs', position: w.spawnPoint }];
    const midway = w.checkpoints.checkpoints.find((c) => c.kind === 'midway');
    if (midway) markers.push({ kind: 'midway', position: midway.position });
    if (w.exit) markers.push({ kind: 'exit', position: w.exit.position });
    if (w.merchant) markers.push({ kind: 'merchant', position: w.merchant.position });
    return markers;
  }

  private syncActorViews(alpha: number, dt: number): void {
    const alive = new Set<ActorId>();
    // 畫面外的角色不更新模型（多面體每幀重畫，只畫看得到的）
    const { width, height } = this.app.screen;
    const offset = this.camera.offset;
    const onScreen = (p: Vec2) => {
      const s = this.projection.toScreen(p);
      const x = s.x + offset.x;
      const y = s.y + offset.y;
      return x > -CULL_MARGIN && x < width + CULL_MARGIN && y > -CULL_MARGIN && y < height + CULL_MARGIN * 2;
    };
    for (const actor of this.world.actors) {
      alive.add(actor.id);
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = new ActorView(this.projection, actor);
        this.actorViews.set(actor.id, view);
        this.objectLayer.addChild(view.container);
      }
      view.hovered = actor.id === this.hoveredId;
      const position = lerp(actor.prevPosition, actor.position, alpha);
      view.update(actor, position, dt, onScreen(position));
    }
    for (const [id, view] of this.actorViews) {
      if (alive.has(id)) continue;
      view.container.destroy({ children: true });
      this.actorViews.delete(id);
    }
  }

  private updateMarker(destination: Vec2 | undefined): void {
    this.marker.visible = destination !== undefined;
    if (!destination) return;
    const s = this.projection.toScreen(destination);
    this.marker.position.set(s.x, s.y);
    const pulse = 0.75 + 0.25 * Math.sin(this.app.ticker.lastTime / 120);
    this.marker.scale.set(pulse);
  }
}

