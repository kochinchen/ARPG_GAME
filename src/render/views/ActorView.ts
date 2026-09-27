import { Container, Graphics, Text } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../../game/entities/Actor';
import type { AttackVariant } from '../figure/FigureModel';
import { HEROINE } from '../figure/Heroine';
import { DEFAULT_MONSTER_MODEL, MONSTER_MODELS } from '../figure/Monsters';
import { PolyFigure, type ActionKind } from '../figure/PolyFigure';
import type { Rarity } from '../../data/schema/item';
import { GearAuraView } from './GearAuraView';
import { WeaponGlowView } from './WeaponGlowView';
import { mountFor, type WeaponLook } from '../figure/weapons/WeaponLooks';
import { PALETTE, STATUS_TINTS } from '../palette';

const BAR_WIDTH = 40;
const BAR_Y = -66;
/** 揮擊時往目標方向前衝的距離（px）與時間（秒） */
const LUNGE_DISTANCE = 7;
/** 浮空時身體被挑起的高度（像素） */
const AIRBORNE_LIFT = 16;
const LUNGE_DURATION = 0.15;
/** 超過這個速度（px / 秒）視為在移動（播放跑步動作） */
const MOVING_SPEED = 8;

/** 點選判定範圍（相對腳底，px；大型怪物依 sizeOf 放大） */
export const HIT_BOX = { halfWidth: 18, top: -60, bottom: 10 } as const;

/** 角色的模型（主角 / 各種怪物） */
const modelOf = (actor: Actor) => (actor.faction === 'player' ? HEROINE : (MONSTER_MODELS[actor.defId ?? ''] ?? DEFAULT_MONSTER_MODEL));

/** 角色相對於標準體型（主角）的大小：模型的縮放倍率（隨機體型、精英、Boss 都會放大） */
export const sizeOf = (actor: Actor) => Math.max(1, actor.visualRadius / modelOf(actor).referenceRadius);

/**
 * 角色外觀：影子 + 多面體模型（女主角 / 各種怪物，八方向、各種樣態）+ 面向指示；
 * 敵人另有血條與名稱，精英與 Boss 腳下有光圈。
 */
export class ActorView {
  readonly container = new Container();
  private readonly body = new Container();
  private readonly figure: PolyFigure;
  private readonly facingMark = new Graphics();
  private readonly hpBar = new Graphics();
  private readonly aura = new Graphics();
  private readonly nameLabel: Text;
  /** 裝備光芒（只有主角） */
  private readonly gear: GearAuraView | null;
  /** 武器微光（只有主角） */
  private readonly weaponGlow: WeaponGlowView | null;
  private weaponLook: WeaponLook | null | undefined = undefined;
  private readonly isEnemy: boolean;
  private readonly isPlayer: boolean;
  private readonly isElite: boolean;
  private readonly barY: number;
  private lastScreen: Vec2 | null = null;
  private lastWorld: Vec2 | null = null;
  private alternate = false;
  private lungeTime = 0;
  private lift = 0;
  /** 模型有 dynamicShadow 時，影子每幀依站姿重畫 */
  private readonly shadow: Graphics;
  private readonly dynamicShadow: boolean;
  private lungeDir = { x: 0, y: 0 };
  hovered = false;

  constructor(
    private readonly projection: IsoProjection,
    actor: Actor,
  ) {
    this.isEnemy = actor.faction === 'enemy';
    this.isPlayer = actor.faction === 'player';
    // Boss 與精英：名稱與血條一直顯示、腳下有光圈（Boss 為紅色）
    this.isElite = actor.elite || actor.isBoss;
    const px = actor.visualRadius * projection.tileWidth;

    const model = modelOf(actor);
    this.figure = new PolyFigure(model, actor.visualRadius / model.referenceRadius);
    this.body.addChild(this.figure.graphics);
    this.barY = BAR_Y * sizeOf(actor);

    this.dynamicShadow = model.dynamicShadow ?? false;
    const shadow = (this.shadow = new Graphics());
    if (!this.dynamicShadow) shadow.ellipse(0, 0, px, px / 2).fill({ color: PALETTE.shadow, alpha: 0.45 });
    this.facingMark.circle(0, 0, 3).fill({ color: PALETTE.marker });
    this.nameLabel = new Text({
      text: [actor.name, ...resistLines(actor)].join('\n'),
      style: {
        fontFamily: 'sans-serif',
        fontSize: 12,
        align: 'center',
        fill: actor.isBoss ? PALETTE.bossName : this.isElite ? PALETTE.eliteName : PALETTE.hoverName,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, this.barY - 4);
    this.nameLabel.visible = false;
    if (this.isElite) {
      this.aura.ellipse(0, 0, px * 1.35, px * 0.68).stroke({ color: actor.isBoss ? PALETTE.bossName : PALETTE.eliteName, width: 2 });
    }
    this.gear = this.isPlayer ? new GearAuraView(58) : null;
    this.weaponGlow = this.isPlayer ? new WeaponGlowView() : null;
    if (this.weaponGlow) {
      this.body.addChildAt(this.weaponGlow.back, 0);
      this.body.addChild(this.weaponGlow.front);
    }
    if (this.gear) this.body.addChild(this.gear.front);
    this.container.addChild(shadow, ...(this.gear ? [this.gear.back] : []), this.aura, this.facingMark, this.body, this.hpBar, this.nameLabel);
  }

  /**
   * 攻擊 / 施法動畫（敵我共用）：前搖期間準備動作，出手瞬間揮下或放出，再收回。
   * windup = 距離命中的秒數（SkillCast.impactIn）。
   */
  attack(windup: number, kind: ActionKind = 'attack', variant?: AttackVariant): void {
    // 沒指定招式的一般攻擊：橫斬與突刺交替
    if (!variant) {
      this.alternate = !this.alternate;
      variant = this.alternate ? 'slash' : 'thrust';
    }
    this.figure.act(kind, windup, variant);
  }

  /** 裝備光芒的等級（0 = 無光）與顏色（最高稀有度） */
  setAura(level: number, rarity: Rarity): void {
    this.gear?.set(level, rarity);
  }

  /** 手上的武器（null = 空手）與武器微光的稀有度 */
  setWeapon(look: WeaponLook | null, rarity: Rarity): void {
    if (look !== this.weaponLook) {
      this.weaponLook = look;
      this.figure.setWeapon(look ? mountFor(look) : null);
    }
    this.weaponGlow?.set(look ? rarity : 'normal', look?.glow ?? null);
  }

  /** 受到傷害 */
  hit(): void {
    this.figure.hit();
  }

  /** 揮擊動畫：往 direction（畫面座標）前衝一下 */
  lunge(screenDirection: Vec2): void {
    const len = Math.hypot(screenDirection.x, screenDirection.y) || 1;
    this.lungeDir = { x: screenDirection.x / len, y: screenDirection.y / len };
    this.lungeTime = LUNGE_DURATION;
  }

  /** visible = 在畫面內；畫面外只更新位置，不重畫模型 */
  update(actor: Actor, position: Vec2, dt: number, visible = true): void {
    const s = this.projection.toScreen(position);
    this.container.position.set(s.x, s.y);
    this.container.zIndex = this.projection.depth(position);
    this.container.visible = visible;
    if (!visible) {
      this.lastScreen = null;
      this.lastWorld = null;
      return;
    }

    const f = this.projection.toScreen(actor.facing);
    const len = Math.hypot(f.x, f.y) || 1;
    this.facingMark.position.set((f.x / len) * 22, (f.y / len) * 11);

    const speed = this.lastScreen && dt > 0 ? Math.hypot(s.x - this.lastScreen.x, s.y - this.lastScreen.y) / dt : 0;
    this.lastScreen = s;
    // World 速度（格 / 秒）：慢速移動時播放走路、一般速度播放跑步
    const worldSpeed = this.lastWorld && dt > 0 ? Math.hypot(position.x - this.lastWorld.x, position.y - this.lastWorld.y) / dt : 0;
    this.lastWorld = { x: position.x, y: position.y };
    this.figure.update(dt, { facing: actor.facing, moving: actor.alive && speed > MOVING_SPEED, alive: actor.alive, speed: worldSpeed });
    this.gear?.update(dt, this.figure.weaponTip, actor.alive);
    this.weaponGlow?.update(dt, this.figure.weaponAxis, actor.alive);

    this.lungeTime = Math.max(0, this.lungeTime - dt);
    const k = Math.sin((this.lungeTime / LUNGE_DURATION) * Math.PI) * LUNGE_DISTANCE;
    // 浮空：身體往上挑起，影子留在地面
    const liftTarget = actor.alive && actor.hasStatus('airborne') ? AIRBORNE_LIFT : 0;
    this.lift += (liftTarget - this.lift) * Math.min(1, dt * 14);
    this.body.position.set(this.lungeDir.x * k, this.lungeDir.y * k - this.lift);
    const fp = this.dynamicShadow ? this.figure.shadow : null;
    if (fp) this.shadow.clear().ellipse(fp.x + this.body.position.x, fp.y + this.body.position.y + this.lift, fp.rx, fp.rx / 2).fill({ color: 0x000000, alpha: 0.35 });
    this.body.alpha = this.hovered ? 0.85 : 1;
    // 冰凍、暈眩、燃燒、緩速等狀態以顏色表示
    this.body.tint = STATUS_TINTS.find(([kind]) => actor.statuses.some((st) => st.kind === kind))?.[1] ?? 0xffffff;
    this.container.alpha = actor.alive ? 1 : 0.6;
    this.facingMark.visible = actor.alive;

    // 精英怪的名稱（含詞綴）一直顯示
    this.nameLabel.visible = actor.alive && this.isEnemy && (this.hovered || this.isElite);
    if (this.isElite) this.aura.alpha = actor.alive ? 0.6 + 0.4 * Math.sin(performance.now() / 300) : 0;
    this.drawHpBar(actor);
  }

  private drawHpBar(actor: Actor): void {
    const ratio = actor.maxHp > 0 ? actor.hp / actor.maxHp : 0;
    // 敵人：滑鼠移上、精英 / Boss 或受傷時顯示；玩家：受傷時顯示
    const visible = actor.alive && ((this.isEnemy && (this.hovered || this.isElite)) || ratio < 1);
    this.hpBar.visible = visible;
    if (!visible) return;
    this.hpBar
      .clear()
      .rect(-BAR_WIDTH / 2, this.barY, BAR_WIDTH, 5)
      .fill({ color: PALETTE.hpBack })
      .rect(-BAR_WIDTH / 2, this.barY, BAR_WIDTH * ratio, 5)
      .fill({ color: this.isPlayer ? PALETTE.playerHpFill : PALETTE.hpFill });
    if (this.isElite) this.hpBar.rect(-BAR_WIDTH / 2 - 1, this.barY - 1, BAR_WIDTH + 2, 7).stroke({ color: PALETTE.eliteName, width: 1 });
  }
}

/** 精英 / Boss 的樓層減傷（第 10 層起），顯示在頭上的名稱下方 */
function resistLines(actor: Actor): string[] {
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const physical = actor.stats.get('physicalResist');
  const elemental = Math.min(actor.stats.get('fireResist'), actor.stats.get('coldResist'), actor.stats.get('lightningResist'));
  return [...(physical > 0 ? [`物理減傷 ${pct(physical)}`] : []), ...(elemental > 0 ? [`屬性減傷 ${pct(elemental)}`] : [])];
}
