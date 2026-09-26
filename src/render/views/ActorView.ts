import { Container, Graphics, Text } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../../game/entities/Actor';
import { ENEMY_ACCENTS, ENEMY_COLORS, PALETTE, STATUS_TINTS } from '../palette';

const BODY_HEIGHT = 40;
const HEAD_Y = -50;
/** 軀幹（肩膀到腰）與四肢（px，相對腳底） */
const SHOULDER_Y = -41;
const HIP_Y = -17;
const ARM_LENGTH = 20;
const LEG_LENGTH = 17;
/** 走路時手腳擺動的幅度（弧度）與速度 */
const SWING_ANGLE = 0.55;
const SWING_SPEED = 11;
const BAR_WIDTH = 40;
const BAR_Y = -66;
/** 揮擊時往目標方向前衝的距離（px）與時間（秒） */
const LUNGE_DISTANCE = 7;
const LUNGE_DURATION = 0.15;

/** 點選判定範圍（相對腳底，px） */
export const HIT_BOX = { halfWidth: 18, top: -60, bottom: 10 } as const;

/**
 * 角色的暫用外觀：影子 + 軀幹 + 頭 + 雙手雙腳（走路時擺動）+ 面向指示；敵人另有血條與名稱。
 */
export class ActorView {
  readonly container = new Container();
  private readonly body = new Container();
  private readonly facingMark = new Graphics();
  private readonly hpBar = new Graphics();
  private readonly nameLabel: Text;
  private readonly isEnemy: boolean;
  private readonly isPlayer: boolean;
  private readonly isElite: boolean;
  private readonly aura = new Graphics();
  /** 四肢：[左腳, 右腳, 左手, 右手]，以髖 / 肩為軸旋轉 */
  private readonly limbs: Graphics[] = [];
  private walkPhase = 0;
  private swing = 0;
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
    // Boss 與精英一樣：名稱與血條一直顯示、腳下有光圈（Boss 為紅色）
    this.isElite = actor.elite || actor.isBoss;
    const [color, dark] = this.isEnemy
      ? (ENEMY_COLORS[actor.defId ?? ''] ?? [PALETTE.enemy, PALETTE.enemyDark])
      : [PALETTE.player, PALETTE.playerDark];
    const px = actor.radius * projection.tileWidth;

    const shadow = new Graphics().ellipse(0, 0, px, px / 2).fill({ color: PALETTE.shadow, alpha: 0.45 });
    const torso = new Graphics()
      .roundRect(-px * 0.55, SHOULDER_Y - 3, px * 1.1, HIP_Y - SHOULDER_Y + 5, 6)
      .fill({ color })
      .stroke({ color: dark, width: 2 });
    const head = new Graphics().circle(0, HEAD_Y, 8).fill({ color }).stroke({ color: dark, width: 2 });
    this.facingMark.circle(0, 0, 3).fill({ color: PALETTE.marker });
    const legX = px * 0.28;
    const armX = px * 0.55 + 3;
    const legL = limb(-legX, HIP_Y, LEG_LENGTH, 6, color, dark, 'foot');
    const legR = limb(legX, HIP_Y, LEG_LENGTH, 6, color, dark, 'foot');
    const armL = limb(-armX, SHOULDER_Y, ARM_LENGTH, 5, color, dark, 'hand');
    const armR = limb(armX, SHOULDER_Y, ARM_LENGTH, 5, color, dark, 'hand');
    // 玩家右手拿劍
    if (this.isPlayer) {
      armR
        .rect(-1.5, ARM_LENGTH - 2, 3, 16)
        .fill({ color: 0xd8dce4 })
        .stroke({ color: 0x5a606a, width: 1 })
        .rect(-5, ARM_LENGTH - 3, 10, 3)
        .fill({ color: 0x8a6a2a });
    }
    this.limbs.push(legL, legR, armL, armR);
    // 後方的手腳先畫，身體蓋在上面
    this.body.addChild(legL, legR, armL, torso, armR, head);
    const accent = this.isEnemy ? ENEMY_ACCENTS[actor.defId ?? ''] : undefined;
    if (accent) this.body.addChild(drawAccent(accent, px, dark));

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
    this.nameLabel.position.set(0, BAR_Y - 4);
    this.nameLabel.visible = false;

    // 精英怪：腳下的金色光圈
    if (this.isElite) {
      this.aura.ellipse(0, 0, px * 1.35, px * 0.68).stroke({ color: actor.isBoss ? PALETTE.bossName : PALETTE.eliteName, width: 2 });
    }
    this.container.addChild(shadow, this.aura, this.facingMark, this.body, this.hpBar, this.nameLabel);
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

    this.animateLimbs(actor, s, dt);

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

    // 精英怪的名稱（含詞綴）一直顯示
    this.nameLabel.visible = actor.alive && this.isEnemy && (this.hovered || this.isElite);
    if (this.isElite) this.aura.alpha = actor.alive ? 0.6 + 0.4 * Math.sin(performance.now() / 300) : 0;
    this.drawHpBar(actor);
  }

  /** 移動時手腳前後擺動（左右腳相反、手與同側腳相反）；停下來時慢慢回正 */
  private animateLimbs(actor: Actor, screen: Vec2, dt: number): void {
    const moved = this.lastScreen && dt > 0 ? Math.hypot(screen.x - this.lastScreen.x, screen.y - this.lastScreen.y) / dt : 0;
    this.lastScreen = screen;
    const walking = actor.alive && moved > 8;
    if (walking) this.walkPhase += dt * SWING_SPEED;
    const target = walking ? Math.sin(this.walkPhase) * SWING_ANGLE : 0;
    this.swing += (target - this.swing) * Math.min(1, dt * 12);
    const [legL, legR, armL, armR] = this.limbs;
    legL!.rotation = this.swing;
    legR!.rotation = -this.swing;
    armL!.rotation = -this.swing * 0.8;
    armR!.rotation = this.swing * 0.8;
  }

  private drawHpBar(actor: Actor): void {
    const ratio = actor.maxHp > 0 ? actor.hp / actor.maxHp : 0;
    // 敵人：滑鼠移上或受傷時顯示；玩家：受傷時顯示（M8 會改為血球）
    const visible = actor.alive && ((this.isEnemy && (this.hovered || this.isElite)) || ratio < 1);
    this.hpBar.visible = visible;
    if (!visible) return;
    this.hpBar
      .clear()
      .rect(-BAR_WIDTH / 2, BAR_Y, BAR_WIDTH, 5)
      .fill({ color: PALETTE.hpBack })
      .rect(-BAR_WIDTH / 2, BAR_Y, BAR_WIDTH * ratio, 5)
      .fill({ color: this.isPlayer ? PALETTE.playerHpFill : PALETTE.hpFill });
    if (this.isElite) this.hpBar.rect(-BAR_WIDTH / 2 - 1, BAR_Y - 1, BAR_WIDTH + 2, 7).stroke({ color: PALETTE.eliteName, width: 1 });
  }
}

/** 怪物的辨識配件（在身體之上，跟著前衝與傾倒） */
function drawAccent(accent: 'bow' | 'hat' | 'helmet' | 'hunch' | 'crown', px: number, dark: number): Graphics {
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
    case 'crown':
      g.poly([-10, HEAD_Y - 6, -10, HEAD_Y - 16, -5, HEAD_Y - 11, 0, HEAD_Y - 19, 5, HEAD_Y - 11, 10, HEAD_Y - 16, 10, HEAD_Y - 6])
        .fill({ color: 0xe8c47a })
        .stroke({ color: 0x8a6a2a, width: 1.5 });
      g.rect(-px * 0.8, -BODY_HEIGHT + 6, px * 1.6, 5).fill({ color: 0x8a1a12 });
      break;
    case 'hunch':
      g.ellipse(-px * 0.2, -BODY_HEIGHT + 2, px * 0.6, 8).fill({ color: dark, alpha: 0.6 });
      break;
  }
  return g;
}

/** 一隻手或腳：以 (x, y)（肩 / 髖）為軸，往下延伸 length，末端畫手或腳掌 */
function limb(x: number, y: number, length: number, width: number, color: number, dark: number, end: 'hand' | 'foot'): Graphics {
  const g = new Graphics();
  g.roundRect(-width / 2, 0, width, length, width / 2).fill({ color }).stroke({ color: dark, width: 1.5 });
  if (end === 'hand') g.circle(0, length, width * 0.6).fill({ color }).stroke({ color: dark, width: 1.5 });
  else g.ellipse(1.5, length, width * 0.8, 2.5).fill({ color: dark });
  g.position.set(x, y);
  return g;
}
