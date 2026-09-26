import { Container, Graphics, type Application } from 'pixi.js';
import type { IsoProjection } from '../core/math/IsoProjection';
import { lerp, sub, type Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import type { ActorId } from '../game/entities/Actor';
import type { GameWorld } from '../game/GameWorld';
import type { Camera } from './Camera';
import { ELEMENT_COLORS, PALETTE } from './palette';
import { ActorView, HIT_BOX } from './views/ActorView';
import { EffectLayer } from './views/EffectLayer';
import { FloatingTextLayer } from './views/FloatingTextLayer';
import { InteractableLayer } from './views/InteractableLayer';
import { TileMapView } from './views/TileMapView';

/**
 * 每幀唯讀讀取 GameWorld，同步 PixiJS 畫面。不修改任何遊戲狀態。
 */
export class Renderer {
  private readonly worldLayer = new Container();
  private readonly objectLayer = new Container({ sortableChildren: true });
  private readonly marker = new Graphics();
  private readonly floatingText = new FloatingTextLayer();
  private readonly tileMap: TileMapView;
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
    data: Pick<DataRegistry, 'items' | 'affixes' | 'potions'>,
  ) {
    this.tileMap = new TileMapView(projection, world.nav, this.objectLayer);
    this.effects = new EffectLayer(projection, this.objectLayer);
    this.interactables = new InteractableLayer(projection, this.objectLayer, data);
    this.marker.poly([0, -6, 12, 0, 0, 6, -12, 0]).stroke({ color: PALETTE.marker, width: 2 });

    this.worldLayer.addChild(
      this.tileMap.floor,
      this.effects.ground,
      this.interactables.ground,
      this.marker,
      this.objectLayer,
      this.interactables.labels,
      this.floatingText.container,
    );
    app.stage.addChild(this.worldLayer);

    const resize = () => camera.setViewport(app.screen.width, app.screen.height);
    resize();
    app.renderer.on('resize', resize);

    world.events.on('ActorDamaged', (e) => {
      this.floatingText.spawn(projection.toScreen(e.position), e.amount, e.isCrit);
    });
    world.events.on('SkillCast', (e) => {
      // 對單一敵人的技能（近戰）播放前衝動作
      const attacker = world.targeting.getActor(e.actorId);
      if (!attacker || e.targetId === null) return;
      const dir = sub(projection.toScreen(e.point), projection.toScreen(attacker.position));
      this.actorViews.get(e.actorId)?.lunge(dir);
    });
    world.events.on('AreaTriggered', (e) => {
      this.effects.spawnRing(e.position, e.radius, ELEMENT_COLORS[e.element ?? 'physical'] ?? 0xffffff);
    });
    world.events.on('SkillFailed', (e) => {
      const actor = world.targeting.getActor(e.actorId);
      if (actor === world.player) this.floatingText.spawnText(projection.toScreen(actor.position), '魔力不足', PALETTE.manaText);
    });
    const say = (position: Vec2, text: string, color: number) =>
      this.floatingText.spawnText(projection.toScreen(position), text, color);
    world.events.on('GoldPickedUp', (e) => say(e.position, `+${e.amount} 金幣`, PALETTE.marker));
    world.events.on('PotionPickedUp', (e) => say(e.position, `+${e.count} 藥水`, PALETTE.healText));
    world.events.on('PickupFailed', () => say(world.player.position, '背包已滿', PALETTE.manaText));
    world.events.on('EquipFailed', () => say(world.player.position, '無法裝備在這裡', PALETTE.manaText));
    world.events.on('PotionUsed', (e) => {
      const at = projection.toScreen(world.player.position);
      this.floatingText.spawnText(at, `+${Math.round(e.hpRestored)} HP  +${Math.round(e.mpRestored)} MP`, PALETTE.healText);
    });
  }

  /** 游標下的地上物品或寶箱（名稱標籤也算） */
  pickInteractableAt(screen: Vec2): number | null {
    const local = sub(screen, this.camera.offset);
    return this.interactables.pickAt(local, [...this.world.chests.filter((c) => !c.opened), ...this.world.groundItems]);
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
      if (Math.abs(dx) > HIT_BOX.halfWidth || dy < HIT_BOX.top || dy > HIT_BOX.bottom) continue;
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
    this.tileMap.update(playerPos);
    this.interactables.setHovered(this.hoveredInteractable);
    this.interactables.update(this.world.groundItems, this.world.chests);
    this.effects.update(dt, this.world.projectiles, alpha);
    this.floatingText.update(dt);
    this.updateMarker(player.intent === null ? player.path[player.path.length - 1] : undefined);
  }

  private syncActorViews(alpha: number, dt: number): void {
    const alive = new Set<ActorId>();
    for (const actor of this.world.actors) {
      alive.add(actor.id);
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = new ActorView(this.projection, actor);
        this.actorViews.set(actor.id, view);
        this.objectLayer.addChild(view.container);
      }
      view.hovered = actor.id === this.hoveredId;
      view.update(actor, lerp(actor.prevPosition, actor.position, alpha), dt);
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

