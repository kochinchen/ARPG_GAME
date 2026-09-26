import { Container, Graphics, Text } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../../game/entities/Actor';
import { ENEMY_ACCENTS, ENEMY_COLORS, PALETTE, STATUS_TINTS } from '../palette';

const BODY_HEIGHT = 40;
const HEAD_Y = -50;
const BAR_WIDTH = 40;
const BAR_Y = -66;
/** 揮擊時往目標方向前衝的距離（px）與時間（秒） */
const LUNGE_DISTANCE = 7;
const LUNGE_DURATION = 0.15;

/** 點選判定範圍（相對腳底，px） */
export const HIT_BOX = { halfWidth: 18, top: -60, bottom: 10 } as const;

/**
 * 角色的暫用外觀：影子 + 身體 + 頭 + 面向指示；敵人另有血條與名稱。
 */
export class ActorView {
  readonly container = new Container();
  private readonly body = new Container();
  private readonly facingMark = new Graphics();
  private readonly hpBar = new Graphics();
  private readonly nameLabel: Text;
  private readonly isEnemy: boolean;
  private readonly isPlayer: boolean;
  private lungeTime = 0;
  private lungeDir = { x: 0, y: 0 };
  hovered = false;

  constructor(
    private readonly projection: IsoProjection,
    actor: Actor,
  ) {
    this.isEnemy = actor.faction === 'enemy';
    this.isPlayer = actor.faction === 'player';
    const [color, dark] = this.isEnemy
      ? (ENEMY_COLORS[actor.defId ?? ''] ?? [PALETTE.enemy, PALETTE.enemyDark])
      : [PALETTE.player, PALETTE.playerDark];
    const px = actor.radius * projection.tileWidth;

    const shadow = new Graphics().ellipse(0, 0, px, px / 2).fill({ color: PALETTE.shadow, alpha: 0.45 });
    const torso = new Graphics()
      .roundRect(-px * 0.55, -BODY_HEIGHT - 4, px * 1.1, BODY_HEIGHT, 7)
      .fill({ color })
      .stroke({ color: dark, width: 2 });
    const head = new Graphics().circle(0, HEAD_Y, 8).fill({ color }).stroke({ color: dark, width: 2 });
    this.facingMark.circle(0, 0, 3).fill({ color: PALETTE.marker });
    this.body.addChild(torso, head);
    const accent = this.isEnemy ? ENEMY_ACCENTS[actor.defId ?? ''] : undefined;
    if (accent) this.body.addChild(drawAccent(accent, px, dark));

    this.nameLabel = new Text({
      text: actor.name,
      style: { fontFamily: 'sans-serif', fontSize: 12, fill: PALETTE.hoverName, stroke: { color: 0x000000, width: 3 } },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, BAR_Y - 4);
    this.nameLabel.visible = false;

    this.container.addChild(shadow, this.facingMark, this.body, this.hpBar, this.nameLabel);
  }

  /** 揮擊動畫：往 direction（畫面座標）前衝一下 */
  lunge(screenDirection: Vec2): void {
    const len = Math.hypot(screenDirection.x, screenDirection.y) || 1;
    this.lungeDir = { x: screenDirection.x / len, y: screenDirection.y / len };
    this.lungeTime = LUNGE_DURATION;
  }

  update(actor: Actor, position: Vec2, dt: number): void {
    const s = this.projection.toScreen(position);
    this.container.position.set(s.x, s.y);
    this.container.zIndex = this.projection.depth(position);

    const f = this.projection.toScreen(actor.facing);
    const len = Math.hypot(f.x, f.y) || 1;
    this.facingMark.position.set((f.x / len) * 22, (f.y / len) * 11);

    this.lungeTime = Math.max(0, this.lungeTime - dt);
    const k = Math.sin((this.lungeTime / LUNGE_DURATION) * Math.PI) * LUNGE_DISTANCE;
    this.body.position.set(this.lungeDir.x * k, this.lungeDir.y * k);
    this.body.alpha = this.hovered ? 0.85 : 1;
    // 冰凍、暈眩、燃燒、緩速等狀態以顏色表示
    this.body.tint = STATUS_TINTS.find(([kind]) => actor.statuses.some((s) => s.kind === kind))?.[1] ?? 0xffffff;
    // 倒地：身體側躺、變淡
    this.body.rotation = actor.alive ? 0 : -Math.PI / 2.4;
    this.container.alpha = actor.alive ? 1 : 0.55;
    this.facingMark.visible = actor.alive;

    this.nameLabel.visible = this.isEnemy && this.hovered;
    this.drawHpBar(actor);
  }

  private drawHpBar(actor: Actor): void {
    const ratio = actor.maxHp > 0 ? actor.hp / actor.maxHp : 0;
    // 敵人：滑鼠移上或受傷時顯示；玩家：受傷時顯示（M8 會改為血球）
    const visible = actor.alive && ((this.isEnemy && this.hovered) || ratio < 1);
    this.hpBar.visible = visible;
    if (!visible) return;
    this.hpBar
      .clear()
      .rect(-BAR_WIDTH / 2, BAR_Y, BAR_WIDTH, 5)
      .fill({ color: PALETTE.hpBack })
      .rect(-BAR_WIDTH / 2, BAR_Y, BAR_WIDTH * ratio, 5)
      .fill({ color: this.isPlayer ? PALETTE.playerHpFill : PALETTE.hpFill });
  }
}

/** 怪物的辨識配件（在身體之上，跟著前衝與傾倒） */
function drawAccent(accent: 'bow' | 'hat' | 'helmet' | 'hunch', px: number, dark: number): Graphics {
  const g = new Graphics();
  switch (accent) {
    case 'bow':
      g.arc(px * 0.9, -BODY_HEIGHT / 2 - 4, 14, -Math.PI / 2.2, Math.PI / 2.2).stroke({ color: 0x8a5a2a, width: 3 });
      g.moveTo(px * 0.9 + 6, -BODY_HEIGHT / 2 - 17).lineTo(px * 0.9 + 6, -BODY_HEIGHT / 2 + 9).stroke({ color: 0xe8e0c8, width: 1 });
      break;
    case 'hat':
      g.poly([-11, HEAD_Y - 4, 11, HEAD_Y - 4, 2, HEAD_Y - 26]).fill({ color: 0x4a3a72 }).stroke({ color: dark, width: 2 });
      break;
    case 'helmet':
      g.roundRect(-10, HEAD_Y - 10, 20, 11, 4).fill({ color: 0x4a4f58 }).stroke({ color: 0x22252a, width: 2 });
      g.rect(-px * 0.7, -BODY_HEIGHT - 6, px * 1.4, 7).fill({ color: 0x5a606a });
      break;
    case 'hunch':
      g.ellipse(-px * 0.2, -BODY_HEIGHT + 2, px * 0.6, 8).fill({ color: dark, alpha: 0.6 });
      break;
  }
  return g;
}
