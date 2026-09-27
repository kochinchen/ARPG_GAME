import { Container, Graphics, Text } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../../game/entities/Actor';
import { HEROINE } from '../figure/Heroine';
import { DEFAULT_MONSTER_MODEL, MONSTER_MODELS } from '../figure/Monsters';
import { PolyFigure, type ActionKind } from '../figure/PolyFigure';
import { PALETTE, STATUS_TINTS } from '../palette';

const BAR_WIDTH = 40;
const BAR_Y = -66;
/** 揮擊時往目標方向前衝的距離（px）與時間（秒） */
const LUNGE_DISTANCE = 7;
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
  private readonly isEnemy: boolean;
  private readonly isPlayer: boolean;
  private readonly isElite: boolean;
  private readonly barY: number;
  private lastScreen: Vec2 | null = null;
  private lungeTime = 0;
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

    const shadow = new Graphics().ellipse(0, 0, px, px / 2).fill({ color: PALETTE.shadow, alpha: 0.45 });
    this.facingMark.circle(0, 0, 3).fill({ color: PALETTE.marker });
    this.nameLabel = new Text({
      text: actor.name,
      style: {
        fontFamily: 'sans-serif',
        fontSize: 12,
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
    this.container.addChild(shadow, this.aura, this.facingMark, this.body, this.hpBar, this.nameLabel);
  }

  /**
   * 攻擊 / 施法動畫（敵我共用）：前搖期間準備動作，出手瞬間揮下或放出，再收回。
   * windup = 距離命中的秒數（SkillCast.impactIn）。
   */
  attack(windup: number, kind: ActionKind = 'attack'): void {
    this.figure.act(kind, windup);
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
      return;
    }

    const f = this.projection.toScreen(actor.facing);
    const len = Math.hypot(f.x, f.y) || 1;
    this.facingMark.position.set((f.x / len) * 22, (f.y / len) * 11);

    const speed = this.lastScreen && dt > 0 ? Math.hypot(s.x - this.lastScreen.x, s.y - this.lastScreen.y) / dt : 0;
    this.lastScreen = s;
    this.figure.update(dt, { facing: actor.facing, moving: actor.alive && speed > MOVING_SPEED, alive: actor.alive });

    this.lungeTime = Math.max(0, this.lungeTime - dt);
    const k = Math.sin((this.lungeTime / LUNGE_DURATION) * Math.PI) * LUNGE_DISTANCE;
    this.body.position.set(this.lungeDir.x * k, this.lungeDir.y * k);
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
