import * as THREE from 'three';
import type { FxGlow } from '../views/EffectLayer';

/**
 * Three.js 畫法的技能特效強化（疊在 Pixi 的特效圖樣底下，數值不變，只改外觀）：
 * - 光暈：每個發光特效一團加亮（additive）的柔光，光球另外有白熱的內核
 * - 拖尾：飛行中的光球沿路留下會飄散、變暗的火星
 * - 爆炸：地上一圈往外擴散的光環 + 一團往上噴、受重力落下的火花
 * - 持續區域（火牆、毒池…）：地上一片會起伏的光；落點預警：光圈由外往內收、越來越亮
 * 位置都是 World 座標（高度：px ÷ PX_PER_HEIGHT），牆會擋住（深度測試），但不寫入深度、不投影子。
 */
export const THREE_FX = {
  /** 光暈大小（World；光球 × 半徑倍率、爆炸 × 範圍）與濃度 */
  halo: { orb: 3.2, orbMin: 0.7, flash: 1.1, opacity: 0.85, flashOpacity: 0.45 },
  /** 光球的白熱內核（相對光暈的大小）與往白色混的比例 */
  core: { size: 0.32, white: 0.65 },
  /** 拖尾火星：每秒幾顆、壽命（秒）、飄散速度、大小（px） */
  trail: { rate: 70, life: 0.45, drift: 0.6, size: 7 },
  /** 爆炸火花：顆數（大招 × 2）、速度、往上的速度、重力、壽命、大小（px） */
  sparks: { count: 34, speed: 3.2, up: 2.6, gravity: 6, life: 0.8, size: 8 },
  /** 地上的光環：最後擴散到範圍的幾倍、寬度（相對半徑） */
  ring: { reach: 1.1, width: 0.22 },
  /** 持續區域的地面光濃度 */
  zone: { opacity: 0.5 },
  /** 同時最多幾顆粒子 */
  maxParticles: 1600,
};
const F = THREE_FX;

/** 柔光貼圖：中心亮、往外平滑變暗 */
function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 光環貼圖：一圈亮邊（內外都淡出） */
function ringTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const w = F.ring.width;
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(Math.max(0, 1 - w * 2), 'rgba(255,255,255,0)');
  g.addColorStop(1 - w, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const additive = (map: THREE.Texture) => ({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  max: number;
  color: THREE.Color;
}

export class ThreeFx {
  readonly group = new THREE.Group();
  private readonly glow = glowTexture();
  private readonly ring = ringTexture();
  private readonly sprites: THREE.Sprite[] = [];
  private readonly decals: THREE.Mesh[] = [];
  private spriteUsed = 0;
  private decalUsed = 0;
  private readonly particles: Particle[] = [];
  private readonly points: THREE.Points;
  private readonly pointPos = new Float32Array(F.maxParticles * 3);
  private readonly pointCol = new Float32Array(F.maxParticles * 3);
  /** 已經噴過火花的爆炸、各光球上次的拖尾計時 */
  private readonly burst = new Set<string>();
  private readonly trailTimer = new Map<string, number>();
  private readonly scratch = new THREE.Color();
  private readonly white = new THREE.Color(1, 1, 1);

  constructor(private readonly pxPerHeight: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pointPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.pointCol, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ ...additive(this.glow), vertexColors: true, size: F.trail.size, sizeAttenuation: false }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  /** pxScale：畫面 1 px 在 WebGL 畫布上的像素數（含鏡頭放大；火星的大小跟著變） */
  update(glows: readonly FxGlow[], dt: number, pxScale: number): void {
    (this.points.material as THREE.PointsMaterial).size = F.trail.size * pxScale;
    this.spriteUsed = 0;
    this.decalUsed = 0;
    const live = new Set<string>();
    for (const g of glows) {
      live.add(g.id);
      const h = g.height / this.pxPerHeight;
      const color = this.scratch.setHex(g.color, THREE.SRGBColorSpace);
      if (g.kind === 'orb') {
        const size = Math.max(F.halo.orbMin, g.radius * F.halo.orb);
        this.sprite(g.position.x, h, g.position.y, size, color, F.halo.opacity * g.strength);
        const core = color.clone().lerp(this.white, F.core.white);
        this.sprite(g.position.x, h, g.position.y, size * F.core.size, core, 1);
        this.trail(g, h, dt);
      } else if (g.kind === 'flash') {
        // 光暈先膨脹再淡出；地上的光環擴散到範圍外緣
        const grow = 1 - (1 - g.t) * (1 - g.t);
        this.sprite(g.position.x, h, g.position.y, Math.max(1, g.radius * F.halo.flash) * (0.6 + 0.6 * grow), color, F.halo.flashOpacity * Math.min(1, g.strength));
        this.decal(g.position.x, g.position.y, Math.max(0.4, g.radius * F.ring.reach * grow), this.ring, color, (1 - g.t) * Math.min(1, g.strength + 0.3));
        if (!this.burst.has(g.id)) {
          this.burst.add(g.id);
          this.sparks(g, h);
        }
      } else if (g.kind === 'zone') {
        this.decal(g.position.x, g.position.y, g.radius * 1.15, this.glow, color, F.zone.opacity * g.strength);
      } else {
        // 預警：光圈由外往內收
        this.decal(g.position.x, g.position.y, g.radius * (1.25 - 0.35 * g.t), this.ring, color, 0.25 + 0.6 * g.t);
        this.decal(g.position.x, g.position.y, g.radius * 0.9, this.glow, color, 0.15 + 0.45 * g.t * g.t);
      }
    }
    for (const id of this.burst) if (!live.has(id)) this.burst.delete(id);
    for (const id of this.trailTimer.keys()) if (!live.has(id)) this.trailTimer.delete(id);
    for (let i = this.spriteUsed; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
    for (let i = this.decalUsed; i < this.decals.length; i++) this.decals[i]!.visible = false;
    this.stepParticles(dt);
  }

  private sprite(x: number, y: number, z: number, size: number, color: THREE.Color, opacity: number): void {
    let s = this.sprites[this.spriteUsed];
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial(additive(this.glow)));
      this.sprites.push(s);
      this.group.add(s);
    }
    this.spriteUsed++;
    s.visible = true;
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    s.material.color.copy(color);
    s.material.opacity = opacity;
  }

  /** 平貼在地上的一片（光環、地面光） */
  private decal(x: number, z: number, radius: number, map: THREE.Texture, color: THREE.Color, opacity: number): void {
    let d = this.decals[this.decalUsed];
    if (!d) {
      d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial(additive(map)));
      d.rotation.x = -Math.PI / 2;
      this.decals.push(d);
      this.group.add(d);
    }
    this.decalUsed++;
    const m = d.material as THREE.MeshBasicMaterial;
    if (m.map !== map) {
      m.map = map;
      m.needsUpdate = true;
    }
    d.visible = true;
    d.position.set(x, 0.02, z);
    d.scale.set(radius, radius, 1);
    m.color.copy(color);
    m.opacity = Math.max(0, opacity);
  }

  private trail(g: FxGlow, h: number, dt: number): void {
    let timer = (this.trailTimer.get(g.id) ?? 0) - dt * F.trail.rate;
    while (timer <= 0) {
      timer += 1;
      const a = Math.random() * Math.PI * 2;
      const v = F.trail.drift * Math.random();
      this.emit(g.position.x, h, g.position.y, Math.cos(a) * v, 0.3 + Math.random() * 0.5, Math.sin(a) * v, -0.4, F.trail.life * (0.6 + Math.random() * 0.6), g.color);
    }
    this.trailTimer.set(g.id, timer);
  }

  private sparks(g: FxGlow, h: number): void {
    const n = Math.round(F.sparks.count * Math.min(2, g.strength) * Math.min(1.5, 0.6 + g.radius * 0.3));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = F.sparks.speed * (0.3 + Math.random() * 0.7) * Math.max(0.6, Math.min(1.6, g.radius * 0.5));
      this.emit(g.position.x, h * 0.6, g.position.y, Math.cos(a) * v, F.sparks.up * (0.4 + Math.random()), Math.sin(a) * v, F.sparks.gravity, F.sparks.life * (0.5 + Math.random() * 0.7), Math.random() < 0.35 ? 0xffffff : g.color);
    }
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, gravity: number, life: number, hex: number): void {
    if (this.particles.length >= F.maxParticles) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, gravity, life, max: life, color: new THREE.Color().setHex(hex, THREE.SRGBColorSpace) });
  }

  private stepParticles(dt: number): void {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.02, p.y + p.vy * dt);
      p.z += p.vz * dt;
      // 加亮混合：顏色變暗就是淡出
      const k = p.life / p.max;
      this.pointPos.set([p.x, p.y, p.z], n * 3);
      this.pointCol.set([p.color.r * k, p.color.g * k, p.color.b * k], n * 3);
      n++;
    }
    const geometry = this.points.geometry;
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    geometry.setDrawRange(0, n);
  }
}
