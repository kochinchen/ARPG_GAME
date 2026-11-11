import type { Graphics } from 'pixi.js';

/**
 * 地上的蜘蛛網（設計者 2026-11-11）：輻線＋一圈圈往內垂的橫絲。
 * 網線畫在地上（Pixi），節點的位置給 Three.js 長立體的冰錐，兩邊對得上。
 */
const SPOKES = 11;
const RINGS = [0.3, 0.52, 0.74, 0.96];

/** 同一張網每次的形狀都一樣（依區域 id），0～1 */
const noise = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const spokeAngle = (seed: number, i: number): number => ((i + (noise(seed, i) - 0.5) * 0.35) / SPOKES) * Math.PI * 2 + noise(seed, 99);

/** 網上的節點（相對網心的格數）：輻線和橫絲的交點，隔一個取一個；ring 由內往外 */
export function webNodes(radius: number, seed: number): { x: number; y: number; ring: number }[] {
  const out: { x: number; y: number; ring: number }[] = [];
  RINGS.forEach((r, ring) => {
    for (let i = ring % 2; i < SPOKES; i += 2) {
      const a = spokeAngle(seed, i);
      out.push({ x: Math.cos(a) * r * radius, y: Math.sin(a) * r * radius, ring });
    }
  });
  return out;
}

export interface WebStyle {
  /** 細亮的絲 */
  strand: number;
  /** 絲底下較粗的暗色 */
  under: number;
  /** 網下的地面 */
  ground: number;
}

/** 畫一張網；toScreen 收世界座標（地上的橢圓由它決定） */
export function drawWeb(g: Graphics, cx: number, cy: number, radius: number, seed: number, style: WebStyle, toScreen: (x: number, y: number) => { x: number; y: number }, alpha = 1): void {
  const at = (a: number, r: number): [number, number] => {
    const p = toScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    return [p.x, p.y];
  };
  const steps = 28;
  const rim: number[] = [];
  for (let i = 0; i < steps; i++) rim.push(...at((i / steps) * Math.PI * 2, radius));
  g.poly(rim).fill({ color: style.ground, alpha: 0.22 * alpha });

  const lines: number[][] = [];
  for (let i = 0; i < SPOKES; i++) {
    const a = spokeAngle(seed, i);
    lines.push([...at(a, radius * 0.04), ...at(a, radius * 1.03)]);
  }
  for (const r of RINGS) {
    for (let i = 0; i < SPOKES; i++) {
      const a0 = spokeAngle(seed, i);
      let a1 = spokeAngle(seed, (i + 1) % SPOKES);
      if (a1 < a0) a1 += Math.PI * 2;
      // 橫絲往網心垂：中段的半徑比兩端小
      const seg: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        seg.push(...at(a0 + (a1 - a0) * t, radius * r * (1 - 0.1 * Math.sin(t * Math.PI))));
      }
      lines.push(seg);
    }
  }
  for (const pts of lines) g.poly(pts, false).stroke({ color: style.under, width: 3.2, alpha: 0.5 * alpha });
  for (const pts of lines) g.poly(pts, false).stroke({ color: style.strand, width: 1.2, alpha: 0.95 * alpha });
}
