import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { StatusKind } from '../../data/schema/effects';

/**
 * 角色身上看得到的狀態（兩種畫法都畫，在角色上方）：
 * - 頭上的霧：弱點（紅）、標記（高光紫）、弱化（黃），一團緩緩翻滾的光霧，持續到狀態結束
 * - 牽制（牽制射擊的緩速）：腰部拉出幾條發光的線，釘在周圍的地上
 */
export const STATUS_MISTS: Partial<Record<StatusKind, { color: number; alpha: number }>> = {
  weakPoint: { color: 0xff2a2a, alpha: 0.75 },
  marked: { color: 0xd88cff, alpha: 0.85 },
  expose: { color: 0xffe14a, alpha: 0.75 },
};
/** 霧的大小（px）、團數、翻滾速度 */
const MIST = { width: 30, height: 12, puffs: 6, speed: 1.6 };
/** 牽制的線：條數、地上的釘點半徑（px）、線的顏色 */
const TETHER = { count: 4, radius: 22, color: 0xe8d6a0, glow: 0xffc860 };

let puffTexture: Texture | null = null;
/** 柔和的圓形光點（中心亮、邊緣透明） */
function puff(): Texture {
  if (puffTexture) return puffTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return (puffTexture = Texture.from(canvas));
}

export class StatusAuraView {
  readonly container = new Container();
  private readonly mists = new Map<StatusKind, { group: Container; puffs: Sprite[] }>();
  private readonly tethers = new Graphics();
  private time = 0;

  constructor(
    /** 頭頂的高度（相對腳底，px；負值往上） */
    private readonly headY: number,
    /** 角色的大小倍率 */
    private readonly size: number,
  ) {
    this.container.addChild(this.tethers);
  }

  update(dt: number, statuses: readonly { kind: StatusKind }[], pinned: boolean, lift: number): void {
    this.time += dt;
    const active = new Set(statuses.map((s) => s.kind));
    let stack = 0;
    for (const [kind, style] of Object.entries(STATUS_MISTS) as [StatusKind, { color: number; alpha: number }][]) {
      let mist = this.mists.get(kind);
      if (!active.has(kind)) {
        if (mist) mist.group.visible = false;
        continue;
      }
      if (!mist) {
        const group = new Container();
        const puffs = Array.from({ length: MIST.puffs }, () => {
          const p = new Sprite(puff());
          p.anchor.set(0.5);
          p.tint = style.color;
          p.blendMode = 'add';
          group.addChild(p);
          return p;
        });
        this.container.addChild(group);
        mist = { group, puffs };
        this.mists.set(kind, mist);
      }
      mist.group.visible = true;
      // 兩種以上的霧：往上疊
      mist.group.position.set(0, this.headY - lift - 4 - stack * 9 * this.size);
      stack++;
      const t = this.time * MIST.speed;
      mist.puffs.forEach((p, i) => {
        const a = t + (i / MIST.puffs) * Math.PI * 2;
        const w = MIST.width * this.size;
        p.position.set(Math.cos(a) * w * 0.42, Math.sin(a * 1.3 + i) * MIST.height * 0.35 * this.size);
        const s = (0.55 + 0.25 * Math.sin(a * 0.7 + i * 2)) * this.size;
        p.scale.set(s * 0.9, s * 0.55);
        p.alpha = style.alpha * (0.6 + 0.4 * Math.sin(a * 1.7 + i));
      });
    }
    this.drawTethers(pinned, lift);
  }

  /** 牽制：腰部（身高的 40%）拉到地上的幾條線，微微顫動 */
  private drawTethers(pinned: boolean, lift: number): void {
    const g = this.tethers.clear();
    if (!pinned) return;
    const waist = this.headY * 0.4 - lift;
    const r = TETHER.radius * this.size;
    for (let i = 0; i < TETHER.count; i++) {
      const a = (i / TETHER.count) * Math.PI * 2 + 0.4;
      const gx = Math.cos(a) * r;
      const gy = Math.sin(a) * r * 0.5;
      const wobble = Math.sin(this.time * 9 + i * 1.7) * 1.2;
      const wx = Math.cos(a) * 4 * this.size;
      // 線的中段稍微下垂
      const mx = (wx + gx) / 2 + wobble;
      const my = (waist + gy) / 2 + 4;
      g.moveTo(wx, waist).quadraticCurveTo(mx, my, gx, gy).stroke({ color: TETHER.glow, width: 3, alpha: 0.25 });
      g.moveTo(wx, waist).quadraticCurveTo(mx, my, gx, gy).stroke({ color: TETHER.color, width: 1.2, alpha: 0.95 });
      // 地上的釘子與一小圈光
      g.ellipse(gx, gy, 3.5 * this.size, 1.8 * this.size).fill({ color: TETHER.glow, alpha: 0.35 });
      g.moveTo(gx, gy).lineTo(gx, gy - 5 * this.size).stroke({ color: 0x8a7a5a, width: 1.6 });
    }
    g.ellipse(0, waist, 6 * this.size, 2.5 * this.size).stroke({ color: TETHER.color, width: 1.2, alpha: 0.9 });
  }
}
