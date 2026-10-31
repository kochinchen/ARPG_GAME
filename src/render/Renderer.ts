import { rankValue } from '../data/schema/common';
import type { SkillDef } from '../data/schema/skill';
import type { AttackVariant } from './figure/FigureModel';
import type { ActionKind } from './figure/PolyFigure';
import { Container, Graphics, type Application } from 'pixi.js';
import type { IsoProjection } from '../core/math/IsoProjection';
import { lerp, rotate, sub, vec2, type Vec2 } from '../core/math/Vec2';
import type { DataRegistry } from '../data/DataRegistry';
import { MATERIAL_LABELS, type MaterialId } from '../data/schema/item';
import type { Actor, ActorId } from '../game/entities/Actor';
import { originalSkillId } from '../game/enemies/MimicSkills';
import type { GameWorld } from '../game/GameWorld';
import { equippedItems, gearAura } from '../game/items/GearAura';
import { coreTypeColor } from './icons/CoreIcons';
import { outfitFor } from './figure/gear/ArmorLooks';
import { HeroPreviewView, type HeroPreviewState } from './views/HeroPreviewView';
import { weaponLookFor } from './figure/weapons/WeaponLooks';
import { ZOOM_RANGE, type Camera } from './Camera';
import { ELEMENT_COLORS, PALETTE } from './palette';
import { ActorView, HIT_BOX, sizeOf } from './views/ActorView';
import { EffectLayer } from './views/EffectLayer';
import type { ImpactKind } from './views/fx/ImpactFx';
import { FloatingTextLayer } from './views/FloatingTextLayer';
import { CorpseLayer } from './views/CorpseLayer';
import { DeviceLayer } from './views/DeviceLayer';
import { InteractableLayer } from './views/InteractableLayer';
import { FloorMarkersView } from './views/FloorMarkersView';
import { TileMapView } from './views/TileMapView';
import type { ArenaView } from './views/ArenaDecor';
import { BOSS_ARENAS } from './themes';
import { MONSTER_MODELS } from './figure/Monsters';
import { PolyFigure } from './figure/PolyFigure';
import { figureScale } from './figure/FigureModel';
import { MinimapView, type MinimapMarker } from './views/MinimapView';
import type { DepthProxy, ThreeWorld } from './three/ThreeWorld';
import { lightRadius, PlayerLightView } from './views/PlayerLightView';

/**
 * 每幀唯讀讀取 GameWorld，同步 PixiJS 畫面。不修改任何遊戲狀態。
 */
/** 畫面外多少像素內仍然繪製角色（避免邊緣突然出現） */
const CULL_MARGIN = 120;
/** 縮放的平滑程度（每秒接近目標的速度） */
const ZOOM_EASE = 12;
/** Three.js 畫法：Pixi 物件的深度板最寬到腳底左右幾 px */
const PROXY_HALF_WIDTH = 40;

export class Renderer {
  /** 顯示頭盔（選單的畫面設定；關掉時主角露出臉與頭髮） */
  showHelmet = true;
  private readonly heroPreview = new HeroPreviewView();
  private readonly worldLayer = new Container();
  private readonly objectLayer = new Container({ sortableChildren: true });
  /** Three.js 畫法：角色身體底下的東西（ActorView.ground），比 Three.js 的角色先畫 */
  private readonly actorGround = new Container();
  /** Three.js 畫法：角色的血條、名稱、狀態霧（ActorView.container），畫在 Three.js 的角色之上；Pixi 畫法時角色在 objectLayer */
  private readonly actorOverlay = new Container({ sortableChildren: true });
  private readonly marker = new Graphics();
  private readonly floatingText = new FloatingTextLayer();
  private tileMap: TileMapView;
  private minimap: MinimapView;
  private readonly markers: FloorMarkersView;
  private readonly effects: EffectLayer;
  private readonly interactables: InteractableLayer;
  private readonly devices: DeviceLayer;
  /** 怪物的屍體（地面層，換樓層才消失） */
  private readonly corpses: CorpseLayer;
  private readonly actorViews = new Map<ActorId, ActorView>();
  private readonly roars: ActorId[] = [];
  /** 魔王階段變化時掉在地上的物件（碎盾、插在地上的巨劍）；換樓層時清除 */
  private readonly drops: Container[] = [];
  private hoveredId: ActorId | null = null;
  private hoveredInteractable: number | null = null;
  /** 目前用 Three.js 畫角色與牆（需要建立時傳入 ThreeWorld；選單「立體光影」） */
  private threeOn = false;
  /** 主角身上的亮區（亮區以外偏暗） */
  private readonly playerLight = new PlayerLightView();
  /** 滾輪縮放的目標倍率（鏡頭平滑地接近） */
  private zoomTarget = 1;

  constructor(
    private readonly app: Application,
    private readonly projection: IsoProjection,
    private readonly world: GameWorld,
    private readonly camera: Camera,
    private readonly data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries' | 'potions' | 'skills' | 'balance' | 'cores'>,
    /** Three.js 畫法：有傳入時由 present() 自己畫每一幀（main.ts 已停掉 Pixi 的自動繪製） */
    private readonly three: ThreeWorld | null = null,
  ) {
    this.tileMap = new TileMapView(projection, world.nav, this.objectLayer, world.floors.def?.theme, arenaOf(world));
    this.effects = new EffectLayer(projection, this.objectLayer);
    this.interactables = new InteractableLayer(projection, this.objectLayer, data);
    this.devices = new DeviceLayer(projection, this.objectLayer);
    this.corpses = new CorpseLayer(projection);
    this.markers = new FloorMarkersView(projection);
    this.markers.rebuild(world.checkpoints.checkpoints);
    this.marker.poly([0, -6, 12, 0, 0, 6, -12, 0]).stroke({ color: PALETTE.marker, width: 2 });

    this.worldLayer.addChild(
      this.tileMap.floor,
      this.markers.container,
      this.effects.ground,
      this.interactables.ground,
      this.marker,
      this.corpses.container,
      this.actorGround,
      this.objectLayer,
      this.actorOverlay,
      this.playerLight.container,
      this.interactables.labels,
      this.floatingText.container,
    );
    app.stage.addChild(this.worldLayer);
    // 小地圖在畫面座標（不跟著鏡頭移動）
    this.minimap = this.createMinimap();
    app.stage.addChild(this.minimap.container);
    // 角色預覽在最上層（畫面座標）
    app.stage.addChild(this.heroPreview.container);

    const resize = () => camera.setViewport(app.screen.width, app.screen.height);
    resize();
    app.renderer.on('resize', resize);

    world.events.on('ActorDamaged', (e) => {
      this.floatingText.spawn(projection.toScreen(e.position), e.amount, e.isCrit);
      this.actorViews.get(e.targetId)?.hit();
    });
    // 換樓層：重建地圖與地面標記（角色、物品依 ID 同步，會自動清掉）
    world.events.on('FloorEntered', () => {
      for (const drop of this.drops.splice(0)) drop.destroy({ children: true });
      this.tileMap.destroy();
      this.tileMap = new TileMapView(projection, world.nav, this.objectLayer, world.floors.def?.theme, arenaOf(world));
      this.worldLayer.addChildAt(this.tileMap.floor, 0);
      this.syncThreeMap();
      this.markers.rebuild(world.checkpoints.checkpoints);
      this.minimap.destroy();
      this.minimap = this.createMinimap();
      this.app.stage.addChildAt(this.minimap.container, this.app.stage.getChildIndex(this.heroPreview.container));
    });
    world.events.on('SkillCast', (e) => {
      const attacker = world.targeting.getActor(e.actorId);
      if (!attacker) return;
      const skill = data.skills.get(e.skillId);
      // 怪物學會的主角技能：頭上顯示招式名稱（前搖較長，看得到就躲得掉）
      if (e.skillId !== originalSkillId(e.skillId)) say(attacker.position, skill.name, PALETTE.critText);
      // Three.js 畫法的出招特效（蓄力、拋射的箭、突進的風、飛向落點的火球…）
      const target = e.targetId !== null ? world.targeting.getActor(e.targetId) : undefined;
      this.effects.cast({ skillId: originalSkillId(e.skillId), caster: attacker.position, point: target?.position ?? e.point, direction: e.direction, impactIn: e.impactIn, ...castExtras(skill, attacker.position, target?.position, e.direction) });
      if (skill.telegraph) {
        // 前搖提示：在地上畫出攻擊範圍，填滿時命中
        const motion = this.motionFor(attacker, skill.tags);
        this.actorViews.get(e.actorId)?.attack(e.impactIn, motion.kind, motion.variant);
        // 衝鋒類（先位移再攻擊）：範圍畫在落點（目標位置）；同一招有多個範圍（例如裂地的分支）時每個都畫
        const dashes = skill.effects.some((effect) => effect.type === 'dash');
        const center = skill.targeting === 'ground' || dashes ? e.point : attacker.position;
        const active = () => attacker.alive && attacker.cast?.skill.id === skill.id;
        for (const area of skill.effects) {
          if (area.type !== 'area' && area.type !== 'zone') continue;
          const direction = area.type === 'area' && area.offsetDeg ? rotate(e.direction, area.offsetDeg) : e.direction;
          // 直線範圍從施放者腳下延伸（衝鋒也是：先標出整條衝撞路線）
          const line = area.type === 'area' ? area.line : undefined;
          this.effects.spawnTelegraph(line ? attacker.position : center, rankValue(area.radius, attacker.cast?.rank ?? 1), direction, area.type === 'area' ? (area.angleDeg ?? 360) : 360, e.impactIn, active, line);
        }
        return;
      }
      // 所有出手都揮動手臂（前搖期間舉起、命中時揮下）；法術播放施法動作；對單一敵人的技能（近戰）再加上前衝
      const motion = this.motionFor(attacker, skill.tags);
      this.actorViews.get(e.actorId)?.attack(e.impactIn, motion.kind, motion.variant);
      // 射箭、法杖施法站定出手，不前衝
      if (e.targetId === null || motion.variant === 'shoot' || motion.variant === 'staff') return;
      const dir = sub(projection.toScreen(e.point), projection.toScreen(attacker.position));
      this.actorViews.get(e.actorId)?.lunge(dir);
    });
    world.events.on('AreaTriggered', (event) => {
      // 怪物學會的主角技能沿用主角的特效
      const e = { ...event, skillId: originalSkillId(event.skillId) };
      const skill = data.skills.has(e.skillId) ? data.skills.get(e.skillId) : null;
      this.effects.spawnImpact({
        kind: impactKind(e.skillId, skill?.tags ?? [], e.element, e.angleDeg, e.radius),
        position: e.position,
        radius: e.radius,
        color: itemFxColor(e.skillId, e.element) ?? ELEMENT_COLORS[e.element ?? 'physical'] ?? 0xffffff,
        direction: e.direction,
        angleDeg: e.angleDeg,
        big: BIG_IMPACTS.has(e.skillId) || e.radius >= 3,
        special: e.special,
        skillId: e.skillId,
        element: e.element,
        // 魔法與元素攻擊、Combo 特別招、裝備特效會發光；物理的近戰與箭不發光
        glow: (e.element !== null && e.element !== 'physical') || e.special || itemFxColor(e.skillId, e.element) !== null,
      });
    });
    // 牽制射擊：被緩速的敵人腰部拉出束縛線
    world.events.on('StatusApplied', (e) => {
      if (e.kind === 'slow' && e.skillId !== undefined && originalSkillId(e.skillId) === 'ranged.pinning_shot') this.actorViews.get(e.actorId)?.pin();
    });
    world.events.on('ChainTriggered', (e) => this.effects.spawnChain(e.points, ELEMENT_COLORS[e.element] ?? 0xffffff, e.special));
    let lastFailure = { text: '', at: 0 };
    world.events.on('SkillFailed', (e) => {
      const actor = world.targeting.getActor(e.actorId);
      if (actor !== world.player) return;
      const text = e.reason === 'mana' ? '魔力不足' : e.text;
      // 按住右鍵 / 左鍵時每幀都會失敗：同一句話 1 秒內只顯示一次
      const now = performance.now();
      if (text === lastFailure.text && now - lastFailure.at < 1000) return;
      lastFailure = { text, at: now };
      this.floatingText.spawnText(projection.toScreen(actor.position), text, PALETTE.manaText);
    });
    const say = (position: Vec2, text: string, color: number) =>
      this.floatingText.spawnText(projection.toScreen(position), text, color);
    world.events.on('GoldPickedUp', (e) => say(e.position, `+${e.amount} 金幣`, PALETTE.marker));
    world.events.on('PotionPickedUp', (e) => say(e.position, `+${e.count} 藥水`, PALETTE.healText));
    world.events.on('PickupFailed', (e) => say(world.player.position, e.reason === 'potionCap' ? '藥水已達上限' : '背包已滿', PALETTE.manaText));
    world.events.on('EquipFailed', (e) =>
      say(world.player.position, e.reason === 'level' ? '等級不足' : e.reason === 'shield' ? '盾牌只能搭配劍或斧' : e.reason === 'noSocket' ? '這件裝備沒有空孔' : '無法裝備在這裡', PALETTE.manaText),
    );
    world.events.on('PlayerLeveledUp', (e) => {
      this.floatingText.spawnText(projection.toScreen(world.player.position), `升級！Lv ${e.level}`, PALETTE.marker, 20);
    });
    world.events.on('ShopTransaction', (e) => {
      const label = { ascend: '飛昇！', reroll: '重鑄！', drill: '鑿孔！', insert: '鑲嵌！', remove: '拆下熔核 ', fuse: '融合！' }[e.kind as string] ?? '';
      const text = e.kind === 'sell' ? `+${e.gold} 金幣` : `${label}${e.gold} 金幣`;
      say(world.player.position, text, PALETTE.marker);
    });
    world.events.on('Respec', (e) => say(world.player.position, `${e.kind === 'skills' ? '技能點' : '屬性點'}已重置（-${e.gold} 金幣）`, PALETTE.marker));
    world.events.on('RespecFailed', (e) => say(world.player.position, e.reason === 'gold' ? '金幣不足' : '沒有點數可以重置', PALETTE.manaText));
    world.events.on('ShopFailed', (e) => {
      const text = {
        gold: '金幣不足',
        inventoryFull: '背包已滿',
        potionCap: '藥水已達上限',
        far: '離商人太遠',
        cannotAscend: '無法飛昇',
        materials: '材料不足',
        cannotReroll: '無法重鑄',
        cannotDrill: '無法再鑿孔',
        cannotSell: '熔核不能賣',
        cannotFuse: '無法融合',
        needsConfirm: '請先確認投入傳奇 / 神話裝備',
      }[e.reason];
      say(world.player.position, text, PALETTE.manaText);
    });
    world.events.on('AttackDodged', (e) => say(e.position, '閃避', PALETTE.hoverName));
    world.events.on('AttackBlocked', (e) => say(e.position, '格擋', PALETTE.hoverName));
    world.events.on('MaterialPickedUp', (e) => say(e.position, `+${e.count} ${MATERIAL_LABELS[e.materialId]}`, 0x7ad8ff));
    world.events.on('ItemsSalvaged', (e) => {
      const text = (Object.entries(e.gained) as [MaterialId, number][]).map(([id, n]) => `+${n} ${MATERIAL_LABELS[id]}`).join('  ');
      say(world.player.position, text, 0x7ad8ff);
    });
    world.events.on('BossPhaseChanged', (e) => {
      const boss = world.targeting.getActor(e.actorId);
      if (!boss) return;
      this.floatingText.spawnText(projection.toScreen(boss.position), `${e.name}：${e.label}！`, PALETTE.critText, 22);
      // 外觀跟著階段改變（盾牌碎裂、巨劍落地），掉下來的東西留在場上記錄戰鬥歷程
      this.actorViews.get(e.actorId)?.setPhase(e.phase);
      const model = MONSTER_MODELS[boss.defId ?? ''];
      const drop = model?.phaseDrops?.[e.phase];
      if (model && drop) {
        const at = vec2(boss.position.x + drop.offset[0], boss.position.y + drop.offset[1]);
        const s = projection.toScreen(at);
        const figure = new PolyFigure(drop.model, figureScale(model, boss.visualRadius));
        const container = new Container();
        container.position.set(s.x, s.y);
        container.zIndex = projection.depth(at) - 0.01;
        container.addChild(figure.graphics);
        figure.showPose(drop.model.poses.ready(0), boss.facing);
        this.objectLayer.addChild(container);
        this.drops.push(container);
      }
    });
    world.events.on('MasteryAchieved', () => say(world.player.position, '精通！其他類別開放', PALETTE.manaText));
    world.events.on('ComboCompleted', (e) => {
      this.floatingText.spawnText(projection.toScreen(world.player.position), e.name, PALETTE.critText, 18);
    });
    world.events.on('ComboInterrupted', () => say(world.player.position, '連段中斷', PALETTE.manaText));
    world.events.on('CheckpointActivated', (e) => say(e.position, e.kind === 'boss' ? '魔王門前存檔點已啟動' : '存檔點已啟動', PALETTE.manaText));
    world.events.on('ExitOpened', () => say(world.player.position, '出口已開啟', 0xe0c8ff));
    world.events.on('ExitLocked', (e) =>
      say(
        world.player.position,
        e.boss ? '擊敗 Boss 後出口才會開啟' : e.champion && e.remaining === 0 ? '擊敗首領後出口才會開啟' : `還需擊敗 ${e.remaining} 隻${e.champion ? '與首領' : ''}`,
        PALETTE.manaText,
      ),
    );
    // 怪物發現主角並招呼同伴
    world.events.on('EnemyAlerted', (e) => {
      const actor = world.targeting.getActor(e.actorId);
      if (actor) say(actor.position, '!', PALETTE.critText);
    });
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

  /** 滑鼠滾輪縮放：factor > 1 放大（範圍見 ZOOM_RANGE） */
  zoomBy(factor: number): void {
    this.zoomTarget = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, this.zoomTarget * factor));
  }

  /** 開關 Three.js 畫法（沒有建立 ThreeWorld 時無效：一律 Pixi） */
  setThree(on: boolean): void {
    if (!this.three || on === this.threeOn) return;
    this.threeOn = on;
    this.syncThreeMap();
    for (const view of this.actorViews.values()) view.setThree(this.threeOn ? this.three : null);
    this.interactables.setThree(this.threeOn ? this.three : null);
    this.corpses.setThree(this.threeOn ? this.three : null);
    this.effects.listener = this.threeOn ? this.three.skillFx : null;
  }

  /** 開發版 G：切換畫法並在主角頭上顯示目前的畫法 */
  toggleThree(): void {
    if (!this.three) return;
    this.setThree(!this.threeOn);
    this.floatingText.spawnText(this.projection.toScreen(this.world.player.position), this.threeOn ? 'Three.js 畫法' : 'Pixi 畫法', PALETTE.manaText);
  }

  private syncThreeMap(): void {
    this.tileMap.threeMode = this.threeOn;
    const t = this.tileMap.theme;
    if (this.three) this.three.setMap(this.tileMap.wallCells, this.world.nav.cell, this.tileMap.lightSpots, { style: t.wall, accent: t.accent, glow: t.glow }, this.tileMap.floorTriangles, this.tileMap.underWallTriangles);
  }

  /** 游標下的地上物品或寶箱（名稱標籤也算） */
  pickInteractableAt(screen: Vec2): number | null {
    const local = this.camera.toLayer(screen);
    const exit = this.world.exit ? [this.world.exit] : [];
    const stairs = this.world.stairsUp ? [this.world.stairsUp] : [];
    return this.interactables.pickAt(local, [...stairs, ...this.world.merchants, ...this.world.waypoints, ...exit, ...this.world.chests.filter((c) => !c.opened), ...this.world.groundItems]);
  }

  /** 游標下的敵對角色（畫面空間判定，點到頭或身體都算）；由 Input 在送出指令前呼叫 */
  pickActorAt(screen: Vec2): ActorId | null {
    const local = this.camera.toLayer(screen);
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

    // 滾輪縮放：平滑地接近目標倍率
    const zoom = this.camera.zoom + (this.zoomTarget - this.camera.zoom) * Math.min(1, dt * ZOOM_EASE);
    this.camera.setZoom(Math.abs(zoom - this.zoomTarget) < 0.002 ? this.zoomTarget : zoom);
    this.camera.follow(playerPos);
    // 爆炸、重擊的畫面震動
    const shake = this.effects.shake;
    const k = this.camera.zoom;
    this.worldLayer.scale.set(k);
    this.worldLayer.position.set(this.camera.offset.x + shake.x, this.camera.offset.y + shake.y);
    // 亮區用畫面座標（抵銷鏡頭位移與縮放）
    const origin = this.worldLayer.position;
    const ps = this.projection.toScreen(playerPos);
    this.playerLight.container.position.set(-origin.x / k, -origin.y / k);
    this.playerLight.container.scale.set(1 / k);
    // Three.js 畫法用真的燭光（ThreeWorld），不疊暗色遮罩
    this.playerLight.container.visible = !this.threeOn;
    this.playerLight.update(vec2(ps.x * k + origin.x, ps.y * k + origin.y), this.world.progress.level, this.app.screen.width, this.app.screen.height, k);

    this.syncActorViews(alpha, dt);
    this.tileMap.update(playerPos, dt);
    this.minimap.update(playerPos, this.minimapMarkers());
    this.interactables.setHovered(this.hoveredInteractable);
    this.interactables.update(this.world.groundItems, this.world.chests, this.world.exit, this.world.floors.floor + 1, this.world.stairsUp, this.world.merchants, this.app.ticker.deltaMS / 1000, this.world.waypoints);
    this.markers.update(this.app.ticker.lastTime);
    this.effects.update(dt, this.world.projectiles, alpha, this.world.scheduler.zones, this.world.scheduler.pending);
    this.floatingText.update(dt);
    this.heroPreview.update(dt);
    this.updateMarker(player.intent === null ? player.path[player.path.length - 1] : undefined);
    if (this.three) this.present(playerPos, dt);
  }

  /**
   * 畫出這一幀（有 ThreeWorld 時才由這裡畫）：Three.js 與 Pixi 輪流畫在同一個 WebGL 上——
   * 1. Three.js 畫地板與影子
   * 2. Pixi 畫地上的東西（地板標記、技能範圍、腳下光圈…）
   * 3. Three.js 畫角色與牆
   * 4. Pixi 畫物件層（火把、機關、投射物、地上的裝備、競技場擺設…）
   * 5. Three.js 只重畫在這些物件前面的牆與角色（深度板，ThreeWorld.renderOccluders）
   * 6. Pixi 畫血條、名稱、上層特效、文字、小地圖
   */
  private present(playerPos: Vec2, dt: number): void {
    const pixi = this.app.renderer;
    if (!this.threeOn) {
      pixi.render(this.app.stage);
      return;
    }
    const three = this.three!;
    const lower: Container[] = [this.tileMap.floor, this.markers.container, this.effects.ground, this.interactables.ground, this.marker, this.corpses.container, this.actorGround];
    const objects: Container[] = [this.objectLayer];
    // 其他全部（血條、上層特效、文字、小地圖、角色預覽…）畫在最上面；每一層只會畫一次
    const all = [...this.worldLayer.children, ...this.app.stage.children.filter((c) => c !== this.worldLayer)];
    const upper = all.filter((c) => !lower.includes(c) && !objects.includes(c));
    const visible = all.map((c) => c.visible);
    /** 只畫其中幾層（其他暫時隱藏），畫完恢復 */
    const drawOnly = (layers: readonly Container[]) => {
      pixi.resetState();
      all.forEach((c, i) => (c.visible = visible[i]! && layers.includes(c)));
      pixi.render({ container: this.app.stage, clear: false });
      all.forEach((c, i) => (c.visible = visible[i]!));
    };
    const { width, height } = this.app.screen;
    const origin = this.worldLayer.position;
    const k = this.camera.zoom;
    const center = this.projection.toWorld(vec2((width / 2 - origin.x) / k, (height / 2 - origin.y) / k));
    three.setGlows(this.effects.glows, this.effects.flying);
    three.renderFloor(center, width, height, k, playerPos, lightRadius(this.world.progress.level), pixi.background.color.toNumber(), dt);
    drawOnly(lower);
    three.renderObjects();
    drawOnly(objects);
    three.renderOccluders(this.depthProxies());
    drawOnly(upper);
  }

  /** 物件層裡 Pixi 畫的直立物件（有 Three.js 模型的寶箱、商人等除外）：深度板的位置與畫面範圍 */
  private depthProxies(): DepthProxy[] {
    const proxies: DepthProxy[] = [];
    for (const c of this.objectLayer.children) {
      if (!c.visible || this.interactables.hasModel(c)) continue;
      const b = c.getLocalBounds();
      // 只擋腳底以上、左右 PROXY_HALF_WIDTH 以內（絆索網這種橫躺很長的，兩端不擋，免得遮到後面的角色）
      const left = Math.max(b.minX, -PROXY_HALF_WIDTH);
      const right = Math.min(b.maxX, PROXY_HALF_WIDTH);
      const bottom = Math.min(b.maxY, 0);
      if (right <= left || bottom <= b.minY) continue;
      const foot = this.projection.toWorld(vec2(c.position.x, c.position.y));
      proxies.push({ x: foot.x, y: foot.y, left, right, top: b.minY, bottom });
    }
    return proxies;
  }

  /** 角色頁的人物預覽：顯示的區域與方向（null = 關閉） */
  setPreview(state: HeroPreviewState | null): void {
    this.heroPreview.set(state);
  }

  /** 小地圖右邊要讓出的寬度（觸控版 MP 球在右上角） */
  minimapRightInset = 0;

  /** Tab：切換小地圖 / 全地圖 */
  toggleMap(): void {
    this.minimap.toggle();
  }

  private createMinimap(): MinimapView {
    return new MinimapView(this.world.nav, this.world.floors.def?.theme, () => this.app.screen, () => this.minimapRightInset);
  }

  /** 小地圖上的標記（揭開後才顯示） */
  private minimapMarkers(): MinimapMarker[] {
    const w = this.world;
    const markers: MinimapMarker[] = [{ kind: 'stairs', position: w.spawnPoint }];
    const midway = w.checkpoints.checkpoints.find((c) => c.kind === 'midway');
    if (midway) markers.push({ kind: 'midway', position: midway.position });
    if (w.exit) markers.push({ kind: 'exit', position: w.exit.position });
    for (const m of w.merchants) markers.push({ kind: 'merchant', position: m.position });
    return markers;
  }

  /** 這一幀開始待機怒吼的角色（吼聲；main.ts 讀取） */
  consumeRoars(): ActorId[] {
    return this.roars.splice(0);
  }

  private syncActorViews(alpha: number, dt: number): void {
    const alive = new Set<ActorId>();
    // 畫面外的角色不更新模型（多面體每幀重畫，只畫看得到的）
    const { width, height } = this.app.screen;
    const onScreen = (p: Vec2) => {
      const { x, y } = this.camera.worldToScreen(p);
      return x > -CULL_MARGIN && x < width + CULL_MARGIN && y > -CULL_MARGIN && y < height + CULL_MARGIN * 2;
    };
    // 機關有自己的外觀（DeviceLayer），不建立角色模型
    this.devices.sync(this.world.actors, alpha, dt);
    this.corpses.update(this.world.corpses, dt, onScreen);
    for (const actor of this.world.actors) {
      if (actor.device) continue;
      alive.add(actor.id);
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = new ActorView(this.projection, actor);
        if (this.threeOn) view.setThree(this.three);
        this.actorViews.set(actor.id, view);
        this.actorGround.addChild(view.ground);
      }
      view.hovered = actor.id === this.hoveredId;
      // 裝備光芒：依身上裝備的稀有度分數
      if (actor === this.world.player) {
        const aura = gearAura(equippedItems((slot) => this.world.equipment.get(slot)), this.data.balance.gearAura);
        view.setAura(aura.level, aura.rarity, aura.core ? coreTypeColor(aura.core.type, aura.core.element) : null);
        // 手上的武器造型與武器微光
        const weapon = weaponLookFor(this.world.equipment.get('weapon'), this.data);
        view.setWeapon(weapon?.look ?? null, weapon?.rarity ?? 'normal');
        // 身上的頭盔、盔甲、靴子
        const outfit = outfitFor((slot) => this.world.equipment.get(slot), this.data, this.showHelmet);
        view.setOutfit(outfit);
        this.heroPreview.setLook(outfit, weapon?.look ?? null, weapon?.rarity ?? 'normal');
      }
      const position = lerp(actor.prevPosition, actor.position, alpha);
      const shown = onScreen(position);
      view.update(actor, position, dt, shown);
      // 畫面外的角色移出圖層（不只是隱藏）：圖層每幀依深度排序，深樓層有上百個畫面外的角色
      const layer = this.threeOn ? this.actorOverlay : this.objectLayer;
      if (!shown) view.container.removeFromParent();
      else if (view.container.parent !== layer) layer.addChild(view.container);
      if (view.roared) {
        view.roared = false;
        this.roars.push(actor.id);
      }
    }
    for (const [id, view] of this.actorViews) {
      if (alive.has(id)) continue;
      view.destroy();
      this.actorViews.delete(id);
    }
  }

  /** 出手動作：主角拿弓射遠程技能 → 拉弓；拿法杖施法 → 舉杖施法；其他依技能標籤 */
  private motionFor(actor: Actor, tags: readonly string[]): { kind: ActionKind; variant: AttackVariant | undefined } {
    const spell = tags.includes('spell');
    if (actor === this.world.player) {
      const weapon = weaponLookFor(this.world.equipment.get('weapon'), this.data)?.look.kind;
      if (weapon === 'bow' && tags.includes('ranged')) return { kind: 'attack', variant: 'shoot' };
      if (weapon === 'staff' && spell) return { kind: 'attack', variant: 'staff' };
    }
    return { kind: spell ? 'cast' : 'attack', variant: attackVariant(tags) };
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

/** 依技能標籤選擇攻擊招式（只影響動畫）：重擊 → 上劈、範圍 → 橫斬、其他 → 橫斬與突刺交替 */
/** 魔王競技場的畫面設定：地圖有競技場、這一層是魔王層時，依魔王選擇配色與佈置 */
function arenaOf(world: GameWorld): ArenaView | undefined {
  const arena = world.map.arena;
  const boss = world.floors.def?.boss?.enemyId;
  if (!arena || !boss) return undefined;
  return { center: vec2(arena.x, arena.y), radius: arena.radius, style: BOSS_ARENAS[boss] ?? BOSS_ARENAS['enemy.crypt_guardian']! };
}

/** 大招：更大、更久、震動更強 */
/** 出招特效需要的額外資訊：突進的終點、延遲效果的秒數 */
function castExtras(skill: SkillDef, from: Vec2, target: Vec2 | undefined, dir: Vec2): { dashTo?: Vec2; delay?: number } {
  const out: { dashTo?: Vec2; delay?: number } = {};
  for (const effect of skill.effects) {
    if (effect.type === 'dash') {
      const sign = effect.direction === 'forward' ? 1 : -1;
      // 不穿越的突進停在目標前
      const reach = target && !effect.passThrough && sign > 0 ? Math.min(effect.distance, Math.max(0, Math.hypot(target.x - from.x, target.y - from.y) - 0.6)) : effect.distance;
      out.dashTo = vec2(from.x + dir.x * reach * sign, from.y + dir.y * reach * sign);
    } else if (effect.type === 'delayed' && out.delay === undefined) out.delay = effect.delay;
  }
  return out;
}

export const BIG_IMPACTS = new Set(['magic.meteor', 'magic.absolute_zero', 'melee.devastator', 'melee.earth_break', 'magic.storm_core']);

/** 範圍效果的外觀：依技能與元素選擇爆炸、冰刺、落雷、震波、斬擊… */
/** 裝備效果的物理特效用稀有度色（神話紅、傳奇橘）；元素效果維持元素色 */
export function itemFxColor(skillId: string, element: string | null): number | null {
  if (!skillId.startsWith('item.') || (element !== null && element !== 'physical')) return null;
  return skillId.includes('mythic.') ? 0xff4a3a : 0xff9a3c;
}

/** 各招專屬的命中特效（沒有列出的依元素 / 標籤 / 範圍決定） */
const SKILL_FX: Record<string, ImpactKind> = {
  'melee.heavy_slash': 'cleave',
  'melee.armor_break': 'sunder',
  'melee.earth_break': 'shockwave',
  'melee.devastator': 'crater',
  'melee.quick_slash': 'slash',
  'melee.shield_bash': 'shieldBash',
  'melee.blade_dance': 'whirl',
  'melee.phantom_blades': 'phantom',
  'melee.dash_slash': 'dash',
  'melee.quake_slash': 'tremor',
  'melee.launch_slash': 'uppercut',
  'melee.execution_slash': 'execute',
  'ranged.rain_of_arrows': 'arrowRain',
  'ranged.explosive_arrow': 'burst',
  'utility.phantom_rush': 'dash',
  'utility.flash_powder': 'flash',
};

export function impactKind(skillId: string, tags: readonly string[], element: string | null, angleDeg: number, radius: number): ImpactKind {
  const own = SKILL_FX[skillId];
  if (own) return own;
  // 裝備（傳奇 / 神話）的物理效果：發光的地裂，和技能本身的特效區分
  if (skillId.startsWith('item.') && (element === null || element === 'physical')) return 'rift';
  if (element === 'fire') return 'fire';
  if (element === 'cold') return 'frost';
  if (element === 'lightning') return 'lightning';
  if (element === 'poison') return 'poison';
  if (tags.includes('heavy') || radius >= 1.6) return 'shockwave';
  return angleDeg < 360 ? 'slash' : 'burst';
}

function attackVariant(tags: readonly string[]): AttackVariant | undefined {
  if (tags.includes('heavy')) return 'overhead';
  if (tags.includes('area')) return 'slash';
  return undefined;
}
