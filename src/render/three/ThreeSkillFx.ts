import * as THREE from 'three';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { FxCast, FxFlying, FxGlow, SkillFxListener } from '../views/EffectLayer';
import type { ImpactInput } from '../views/fx/ImpactFx';

/**
 * Three.js 畫法的招式特效（立體、會被照亮、會投影子的部分；數值不變，只改外觀）：
 * - 粒子：火焰、火星、電光（加亮混合）與煙、塵、冰霧（一般混合），每顆有自己的大小、顏色、透明度變化
 * - 物件：岩塊、土刺、冰柱、隕石、箭（MeshStandard、平面著色、投影子）
 * - 光帶：直立的重砍刀光、突進的殘影、狙殺的光矢、寬雷柱、鉤索的鎖鏈
 * 各招的專屬演出在 cast / impact；其他招式依元素與強度套用共通的效果（火：火焰＋黑煙；冰：冰晶＋寒霧；雷：電弧；毒：毒泡；物理：塵土＋碎石）。
 * 單位：World（高度 = px ÷ PX_PER_HEIGHT）。
 */
const FIRE = [0xfff2b0, 0xffa030, 0xd83a10, 0x401008] as const;
const SMOKE = 0x2a2420;
const DUST = 0x8a7458;
const ICE = 0xbfeaff;
const ICE_DARK = 0x5aa8d8;
const ROCK = 0x5a4a3a;

/** 突進類（風壓 + 殘影光帶） */
const DASH_SKILLS = new Set(['melee.dash_slash', 'utility.shadow_step', 'utility.phantom_rush']);
/** 由 Three.js 完整畫出、不再畫 Pixi 圖樣的招式 */
const OWN_IMPACT = new Set(['melee.earth_break', 'magic.thunder_strike', 'magic.storm_core', 'magic.meteor', 'magic.absolute_zero', 'ranged.explosive_arrow', 'magic.flame_burst', 'utility.powder_keg', 'utility.frost_mine', 'utility.flash_powder', 'ranged.rain_of_arrows']);

const linear = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ─────────────────────────── 貼圖 ───────────────────────────

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softDot = () =>
  canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
/** 煙：邊緣不規則的柔團 */
const puffTex = () =>
  canvasTexture(64, (ctx, s) => {
    for (let i = 0; i < 7; i++) {
      const x = s / 2 + rand(-10, 10);
      const y = s / 2 + rand(-10, 10);
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.32);
      g.addColorStop(0, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
/** 光帶：橫向一條（中間亮、上下淡出） */
const bandTex = () =>
  canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
/** 雷柱：鋸齒狀的閃電（直向），寬的外光 + 白熱的芯 */
const boltTex = () =>
  canvasTexture(128, (ctx, s) => {
    const glow = ctx.createLinearGradient(0, 0, s, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    for (const [w, a] of [
      [10, 0.6],
      [4, 1],
    ] as const) {
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      let x = s / 2;
      ctx.moveTo(x, 0);
      for (let y = 8; y <= s; y += 8) {
        x = s / 2 + rand(-s * 0.16, s * 0.16);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
/** 扇形地裂：放射狀的裂縫（裂縫透光） */
const crackTex = () =>
  canvasTexture(256, (ctx, s) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15);
      let x = s / 2;
      let y = s / 2;
      ctx.lineWidth = rand(2, 5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 6;
      for (let k = 1; k <= steps; k++) {
        const r = (k / steps) * s * 0.48;
        const b = a + rand(-0.25, 0.25);
        x = s / 2 + Math.cos(b) * r;
        y = s / 2 + Math.sin(b) * r;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });

// ─────────────────────────── 粒子 ───────────────────────────

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  gravity: number;
  drag: number;
  life: number;
  max: number;
  size: [number, number];
  color: [THREE.Color, THREE.Color];
  alpha: [number, number];
}

/** 一組粒子（一種混合方式）：每顆粒子的位置、大小、顏色、透明度，畫成貼圖點 */
class Particles {
  readonly points: THREE.Points;
  private readonly list: Particle[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private readonly scratch = new THREE.Color();

  constructor(
    map: THREE.Texture,
    blending: THREE.Blending,
    private readonly max: number,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 1 } },
      vertexShader: `
        attribute float alpha; attribute float size; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float scale;
        void main() { vColor = color; vAlpha = alpha; gl_PointSize = size * scale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          #include <colorspace_fragment>
        }`,
      blending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  clear(): void {
    this.list.length = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  add(p: Omit<Particle, 'max'>): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ ...p, max: p.life });
  }

  update(dt: number, scale: number): void {
    this.material.uniforms.scale!.value = scale;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i]!;
      q.life -= dt;
      if (q.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      q.v.y -= q.gravity * dt;
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.02) {
        q.p.y = 0.02;
        q.v.y *= -0.3;
      }
      const k = 1 - q.life / q.max;
      this.pos.set([q.p.x, q.p.y, q.p.z], n * 3);
      const c = this.scratch.copy(q.color[0]).lerp(q.color[1], k);
      this.col.set([c.r, c.g, c.b], n * 3);
      this.alpha[n] = q.alpha[0] + (q.alpha[1] - q.alpha[0]) * k;
      this.size[n] = q.size[0] + (q.size[1] - q.size[0]) * k;
      n++;
    }
    const g = this.points.geometry;
    for (const name of ['position', 'color', 'alpha', 'size']) g.attributes[name]!.needsUpdate = true;
    g.setDrawRange(0, n);
  }
}

// ─────────────────────────── 物件與光帶 ───────────────────────────

/** 有壽命的物件：每幀呼叫 tick（age = 已存在秒數），到期移除 */
interface Item {
  obj: THREE.Object3D;
  age: number;
  life: number;
  tick: (age: number, dt: number) => void;
  dispose: () => void;
}

/** 開始延後的事件（出招後幾秒才發生） */
interface Later {
  at: number;
  run: () => void;
}

export class ThreeSkillFx implements SkillFxListener {
  readonly group = new THREE.Group();
  private readonly glowTex = softDot();
  private readonly puffTex = puffTex();
  private readonly bandTex = bandTex();
  private readonly boltTex = [boltTex(), boltTex(), boltTex()];
  private readonly crackTex = crackTex();
  private readonly glow = new Particles(this.glowTex, THREE.AdditiveBlending, 3000);
  private readonly smoke = new Particles(this.puffTex, THREE.NormalBlending, 1200);
  private readonly items: Item[] = [];
  private readonly later: Later[] = [];
  private time = 0;
  /** 鉤索：施放者位置（鎖鏈的起點）、飛行中的鉤爪 */
  private hookFrom: Vec2 | null = null;
  private hookAt: Vec2 | null = null;
  /** 隕石（依延遲效果的 id）、持續區域的發射計時 */
  private readonly meteors = new Map<string, THREE.Mesh>();
  private readonly emitTimer = new Map<string, number>();
  private readonly rockGeo = new THREE.IcosahedronGeometry(1, 0);
  private readonly meteorGeo = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position!;
    // 同一個位置的頂點推一樣的距離（不裂開）
    const bump = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let k = bump.get(key);
      if (k === undefined) bump.set(key, (k = 0.78 + Math.random() * 0.4));
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  })();
  private readonly iceGeo = new THREE.ConeGeometry(1, 1, 5, 1);
  private readonly arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5);

  constructor(private readonly pxPerHeight: number) {
    this.group.add(this.glow.points, this.smoke.points);
    this.iceGeo.translate(0, 0.5, 0);
  }

  // ─────────── 事件 ───────────

  cast(c: FxCast): void {
    const at = (delay: number, run: () => void) => this.later.push({ at: this.time + Math.max(0, delay), run });
    const id = c.skillId;
    if (id === 'melee.heavy_slash') at(c.impactIn - 0.06, () => this.overheadSlash(c.point, c.direction));
    else if (DASH_SKILLS.has(id)) at(c.impactIn, () => this.dash(c.caster, c.dashTo ?? c.point, c.direction, id === 'utility.shadow_step' ? 0x8a6aff : 0xdfe8ff));
    else if (id === 'ranged.explosive_arrow') this.lobArrow(c.caster, c.point, Math.max(0, c.impactIn - 0.2), c.impactIn + (c.delay ?? 0.25));
    else if (id === 'ranged.execution_shot') this.snipe(c.caster, c.direction, c.impactIn);
    else if (id === 'magic.flame_burst') this.bigFireball(c.caster, c.point, c.impactIn);
    else if (id === 'ranged.charge_shot') this.charge(c.caster, c.impactIn, 0xffe8a0);
    else if (id === 'utility.grapple_hook') at(c.impactIn, () => (this.hookFrom = c.caster));
    else if (id.startsWith('magic.')) this.charge(c.caster, c.impactIn, id.includes('ice') || id.includes('frost') || id.includes('zero') ? ICE : id.includes('spark') || id.includes('thunder') || id.includes('storm') || id.includes('chain') ? 0xf5e663 : 0xffa040);
  }

  impact(i: ImpactInput): boolean {
    const id = i.skillId ?? '';
    const p = i.position;
    const r = i.radius;
    switch (id) {
      case 'melee.earth_break':
        this.fanQuake(p, i.direction, r, i.angleDeg);
        return true;
      case 'magic.thunder_strike':
        this.thunder(p, 0.85, 1);
        return true;
      case 'magic.storm_core':
        this.thunder(p, 0.55, 0.8);
        return true;
      case 'magic.meteor':
        this.explosion(p, r, i.color, 1.7);
        this.debris(p, 26, 2.2, ROCK);
        return true;
      case 'magic.absolute_zero':
        this.iceField(p, r);
        return true;
      case 'magic.flame_burst':
      case 'ranged.explosive_arrow':
        this.explosion(p, r, 0xff7a2a, id === 'magic.flame_burst' ? 1.3 : 1);
        return true;
      case 'utility.powder_keg':
        this.explosion(p, r, 0xff7a2a, 1.8);
        this.debris(p, 20, 2.6, 0x7a5432);
        this.shockRing(p, r * 1.2, 0xffc880);
        return true;
      case 'utility.frost_mine':
        this.frostBlast(p, r, 1.6);
        return true;
      case 'utility.flash_powder':
        this.flashPowder(p, r);
        return true;
      case 'ranged.rain_of_arrows':
        this.fallingArrow(p, r);
        return true;
      case 'melee.shield_bash':
        this.coneWave(p, i.direction, r, 0xe8e0c8);
        this.dust(p, 8, r * 0.6);
        return false;
    }
    // 共通：依元素與範圍
    const big = i.big ? 1.5 : 1;
    switch (i.element) {
      case 'fire':
        this.flames(p, r * 0.8, Math.round(26 * big * Math.min(2, r)), 0.55);
        this.smokePuffs(p, Math.round(6 * big), r * 0.6);
        break;
      case 'cold':
        this.frostBlast(p, r, big);
        break;
      case 'lightning':
        this.sparksBurst(p, r, 0xf5e663, Math.round(22 * big));
        break;
      case 'poison':
        this.bubbles(p, r, 0x7ed957, Math.round(16 * big));
        break;
      default:
        if (['shockwave', 'crater', 'tremor', 'sunder', 'cleave', 'uppercut', 'execute'].includes(i.kind)) {
          this.dust(p, Math.round(10 * big), r * 0.7);
          this.debris(p, Math.round(6 * big), 1.2, ROCK);
        }
    }
    return false;
  }

  chain(points: readonly Vec2[], color: number): void {
    // 每一跳落點炸一團電光
    for (const p of points.slice(1)) this.sparksBurst(p, 0.6, color, 14);
  }

  /** 清掉所有進行中的特效（換樓層、特效預覽換下一招） */
  clear(): void {
    for (const it of this.items) {
      it.obj.removeFromParent();
      it.dispose();
    }
    this.items.length = 0;
    this.later.length = 0;
    for (const rock of this.meteors.values()) rock.removeFromParent();
    this.meteors.clear();
    this.emitTimer.clear();
    this.hookFrom = this.hookAt = null;
    this.glow.clear();
    this.smoke.clear();
  }

  // ─────────── 每幀 ───────────

  update(dt: number, scale: number, glows: readonly FxGlow[], flying: readonly FxFlying[]): void {
    this.time += dt;
    for (let i = this.later.length - 1; i >= 0; i--) {
      if (this.later[i]!.at > this.time) continue;
      const ev = this.later.splice(i, 1)[0]!;
      ev.run();
    }
    this.persistent(glows, dt);
    this.updateHook(flying);
    this.sparkTrails(flying, dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      if (it.age >= it.life) {
        it.obj.removeFromParent();
        it.dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.tick(it.age, dt);
    }
    this.glow.update(dt, scale);
    this.smoke.update(dt, scale);
  }

  /** 持續的效果：火牆的火焰、隕石坑的岩漿、絕對零度的寒霧、隕石落下 */
  private persistent(glows: readonly FxGlow[], dt: number): void {
    const live = new Set<string>();
    for (const g of glows) {
      if (g.kind === 'zone') {
        const rate = g.skillId === 'magic.firewall' ? 120 : g.skillId === 'magic.meteor' ? 70 : g.skillId === 'magic.absolute_zero' ? 26 : 0;
        if (!rate) continue;
        let timer = (this.emitTimer.get(g.id) ?? 0) - dt * rate;
        while (timer <= 0) {
          timer += 1;
          const a = Math.random() * Math.PI * 2;
          const d = g.radius * Math.sqrt(Math.random());
          const at = vec2(g.position.x + Math.cos(a) * d, g.position.y + Math.sin(a) * d);
          if (g.skillId === 'magic.absolute_zero') this.fog(at, ICE, 0.5);
          else this.flameTongue(at, g.skillId === 'magic.firewall' ? 1 : 0.55);
        }
        this.emitTimer.set(g.id, timer);
        live.add(g.id);
      } else if (g.kind === 'pending' && g.skillId === 'magic.meteor') {
        live.add(g.id);
        let rock = this.meteors.get(g.id);
        if (!rock) {
          rock = new THREE.Mesh(this.meteorGeo, new THREE.MeshStandardMaterial({ color: linear(0x4a3428), emissive: linear(0xc83a10), emissiveIntensity: 0.18, flatShading: true, roughness: 1 }));
          // 凹凸不平的岩石：頂點隨機往內外推
          rock.scale.set(0.45, 0.4, 0.5);
          rock.castShadow = true;
          this.group.add(rock);
          this.meteors.set(g.id, rock);
        }
        // 從斜上方的天空落下，越來越快（一開始就看得到）
        const k = Math.pow(g.t, 1.6);
        const from = new THREE.Vector3(g.position.x - 1.6, 3.8, g.position.y - 1.6);
        const to = new THREE.Vector3(g.position.x, 0.3, g.position.y);
        rock.position.lerpVectors(from, to, k);
        rock.rotation.x += dt * 4;
        rock.rotation.y += dt * 3;
        for (let n = 0; n < 4; n++) {
          this.glow.add({ p: rock.position.clone().add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2))), v: new THREE.Vector3(rand(-0.3, 0.3), rand(0.3, 1), rand(-0.3, 0.3)), gravity: 0, drag: 1, life: rand(0.3, 0.6), size: [rand(26, 40), 6], color: [linear(FIRE[0]), linear(FIRE[2])], alpha: [1, 0] });
        }
        this.smoke.add({ p: rock.position.clone(), v: new THREE.Vector3(rand(-0.2, 0.2), 0.4, rand(-0.2, 0.2)), gravity: 0, drag: 0.5, life: 0.9, size: [20, 46], color: [linear(SMOKE), linear(SMOKE)], alpha: [0.55, 0] });
      }
    }
    for (const id of this.emitTimer.keys()) if (!live.has(id)) this.emitTimer.delete(id);
    for (const [id, rock] of this.meteors) {
      if (live.has(id)) continue;
      rock.removeFromParent();
      (rock.material as THREE.Material).dispose();
      this.meteors.delete(id);
    }
  }

  /** 鉤索：施放者到鉤爪之間的鎖鏈；鉤到後（投射物消失）鎖鏈帶著鉤爪收回 */
  private updateHook(flying: readonly FxFlying[]): void {
    const hook = flying.find((f) => f.skillId === 'utility.grapple_hook');
    if (hook && this.hookFrom) {
      this.hookAt = hook.position;
      this.chainLine(this.hookFrom, hook.position, 0.05);
    } else if (this.hookFrom && this.hookAt) {
      // 鉤住：0.3 秒內收回
      const from = this.hookFrom;
      const to = this.hookAt;
      this.hookFrom = null;
      this.hookAt = null;
      this.sparksBurst(to, 0.4, 0xffe0a0, 10);
      this.addItem(new THREE.Group(), 0.3, (age) => {
        const k = 1 - age / 0.3;
        this.chainLine(from, vec2(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k), 0.05);
      });
    }
  }

  /** 電擊：太快看不清楚，沿路留下一串會停留的電光殘影 */
  private sparkTrails(flying: readonly FxFlying[], dt: number): void {
    for (const f of flying) {
      if (f.skillId !== 'magic.spark') continue;
      for (let n = 0; n < Math.ceil(60 * dt); n++) {
        this.glow.add({ p: this.v3(f.position, 0.6), v: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 0.5), rand(-0.6, 0.6)), gravity: 0, drag: 2, life: rand(0.45, 0.8), size: [rand(14, 22), 3], color: [linear(0xffffff), linear(0xf5e663)], alpha: [1, 0] });
      }
    }
  }

  // ─────────── 演出 ───────────

  private v3(p: Vec2, h = 0): THREE.Vector3 {
    return new THREE.Vector3(p.x, h, p.y);
  }

  private addItem(obj: THREE.Object3D, life: number, tick: Item['tick'], dispose: () => void = () => {}): void {
    this.group.add(obj);
    this.items.push({ obj, age: 0, life, tick, dispose });
  }

  /** 加亮的平面（光帶、刀光、地裂）：以 tick 改透明度 */
  private additivePlane(width: number, height: number, map: THREE.Texture, color: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, color: linear(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  }

  private planeItem(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, life: number, tick: Item['tick']): void {
    this.addItem(mesh, life, tick, () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }

  /**
   * 重砍：由上往下的弧形刀光，砍到地面濺起碎石與塵土。
   * 刀光畫在面向鏡頭的立面上（從左上斜劈到右下）：畫在攻擊方向的垂直面時，往鏡頭方向砍會變成一條線看不見
   */
  private overheadSlash(at: Vec2, dir: Vec2): void {
    const side = dir.x - dir.y > 0 ? 1 : -1;
    const segments = 16;
    const r = 1.05;
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i <= segments; i++) {
      // 弧：從頭頂斜上方掃到另一側的地面
      const a = THREE.MathUtils.degToRad(110 - (i / segments) * 150);
      for (const [rr, v] of [
        [r * 0.6, 0],
        [r, 1],
      ] as const) {
        pos.push(Math.cos(a) * rr * side, 0.75 + Math.sin(a) * rr, 0);
        uv.push(i / segments, v);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < segments; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.bandTex, color: linear(0xfff4dc), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(at.x - dir.x * 0.3, 0, at.y - dir.y * 0.3);
    // 立面朝向鏡頭（鏡頭在 +X +Z 方向）
    mesh.rotation.y = Math.PI / 4;
    // 由上往下掃出來（0.12 秒），再淡出
    this.addItem(mesh, 0.42, (age) => {
      const k = Math.min(1, age / 0.12);
      g.setDrawRange(0, Math.max(6, Math.floor(segments * k) * 6));
      mesh.material.opacity = age < 0.12 ? 1 : 1 - (age - 0.12) / 0.3;
    }, () => {
      g.dispose();
      mesh.material.dispose();
    });
    this.later.push({ at: this.time + 0.12, run: () => {
      this.dust(at, 10, 0.5);
      this.debris(at, 7, 1.4, ROCK);
      this.shockRing(at, 0.9, 0xfff0d0);
    } });
  }

  /** 突進：起點一團風壓、路徑上一道快速閃過的殘影光帶與風線、終點揚塵 */
  private dash(from: Vec2, to: Vec2, dir: Vec2, color: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(0.5, Math.hypot(dx, dy));
    // 腰部高度一道平放的殘影光帶（平放才不會在朝鏡頭方向衝刺時變成一條線）
    const band = this.additivePlane(len, 0.7, this.bandTex, color);
    band.position.set(from.x + dx / 2, 0.65, from.y + dy / 2);
    band.rotation.set(-Math.PI / 2, 0, -Math.atan2(dy, dx));
    this.planeItem(band, 0.32, (age) => (band.material.opacity = 1 - age / 0.32));
    // 平躺的一道（地上的光影）
    const floor = this.additivePlane(len, 0.6, this.bandTex, color);
    floor.position.set(from.x + dx / 2, 0.03, from.y + dy / 2);
    floor.rotation.set(-Math.PI / 2, 0, -Math.atan2(dy, dx));
    this.planeItem(floor, 0.4, (age) => (floor.material.opacity = 0.7 * (1 - age / 0.4)));
    // 風線：沿路的細長光點往前飛
    for (let i = 0; i < 26; i++) {
      const k = Math.random();
      const p = this.v3(vec2(from.x + dx * k, from.y + dy * k), rand(0.2, 1.3));
      this.glow.add({ p, v: new THREE.Vector3(dir.x * rand(6, 11), 0, dir.y * rand(6, 11)), gravity: 0, drag: 5, life: rand(0.2, 0.4), size: [rand(8, 14), 2], color: [linear(0xffffff), linear(color)], alpha: [0.9, 0] });
    }
    this.dust(from, 10, 0.5);
    this.shockRing(from, 1.1, 0xdfe8ff);
    this.dust(to, 6, 0.4);
  }

  /** 爆裂箭：一支箭射向天空、畫一道弧落到目標，著地爆炸 */
  private lobArrow(from: Vec2, to: Vec2, start: number, land: number): void {
    const mesh = new THREE.Mesh(this.arrowGeo, new THREE.MeshStandardMaterial({ color: 0x6a4a2a, emissive: linear(0xff6a24), emissiveIntensity: 0.8 }));
    mesh.castShadow = true;
    const flight = Math.max(0.35, land - start);
    const t0 = this.time + Math.max(0, start);
    mesh.visible = false;
    const a = this.v3(from, 1.1);
    const b = this.v3(to, 0.1);
    const prev = new THREE.Vector3();
    this.addItem(mesh, Math.max(0, start) + flight + 0.02, () => {
      const k = (this.time - t0) / flight;
      if (k < 0) return;
      mesh.visible = true;
      prev.copy(mesh.position);
      mesh.position.lerpVectors(a, b, Math.min(1, k));
      // 拋物線：射向天空再落下（最高 2.4）
      mesh.position.y += Math.sin(Math.min(1, k) * Math.PI) * 2.4;
      if (k > 0.02) mesh.lookAt(prev.clone().sub(mesh.position).multiplyScalar(-1).add(mesh.position));
      mesh.rotateX(Math.PI / 2);
      for (let n = 0; n < 3; n++) this.glow.add({ p: mesh.position.clone(), v: new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3)), gravity: 0, drag: 2, life: rand(0.3, 0.55), size: [rand(18, 28), 3], color: [linear(FIRE[0]), linear(FIRE[2])], alpha: [1, 0] });
    }, () => (mesh.material as THREE.Material).dispose());
  }

  /** 狙殺：蓄力時一條紅色瞄準線，放箭時一道貫穿畫面的金色光矢 */
  private snipe(from: Vec2, dir: Vec2, impactIn: number): void {
    const len = 12;
    const mk = (width: number, color: number, h: number) => {
      const m = this.additivePlane(len, width, this.bandTex, color);
      m.position.set(from.x + (dir.x * len) / 2, h, from.y + (dir.y * len) / 2);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(dir.y, dir.x));
      return m;
    };
    const aim = mk(0.06, 0xff3030, 0.9);
    this.planeItem(aim, impactIn, (age) => (aim.material.opacity = 0.3 + 0.7 * (age / impactIn)));
    this.later.push({ at: this.time + impactIn, run: () => {
      const beam = mk(0.5, 0xffd870, 0.9);
      this.planeItem(beam, 0.45, (age) => {
        beam.material.opacity = 1 - age / 0.45;
        beam.scale.y = 1 - age / 0.6;
      });
      const core = mk(0.12, 0xffffff, 0.91);
      this.planeItem(core, 0.3, (age) => (core.material.opacity = 1 - age / 0.3));
      this.shockRing(from, 0.8, 0xffd870);
      for (let i = 0; i < 30; i++) {
        const k = Math.random() * len;
        this.glow.add({ p: this.v3(vec2(from.x + dir.x * k, from.y + dir.y * k), 0.9), v: new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)), gravity: 2, drag: 2, life: rand(0.3, 0.6), size: [10, 2], color: [linear(0xffffff), linear(0xffc860)], alpha: [1, 0] });
      }
    } });
  }

  /** 火焰爆破：大一倍的火球從手上飛向落點，砸中爆炸（爆炸在 impact） */
  private bigFireball(from: Vec2, to: Vec2, impactIn: number): void {
    const flight = Math.min(0.35, Math.max(0.15, impactIn));
    const t0 = this.time + impactIn - flight;
    const a = this.v3(from, 1.2);
    const b = this.v3(to, 0.3);
    const ball = new THREE.Object3D();
    this.addItem(ball, impactIn + 0.01, () => {
      const k = (this.time - t0) / flight;
      if (k < 0) {
        // 蓄力：手上的火越來越大
        const c = this.v3(from, 1.2);
        this.glow.add({ p: c.add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.1, 0.2), rand(-0.15, 0.15))), v: new THREE.Vector3(0, rand(0.3, 0.8), 0), gravity: 0, drag: 1, life: 0.3, size: [24, 6], color: [linear(FIRE[0]), linear(FIRE[2])], alpha: [1, 0] });
        return;
      }
      ball.position.lerpVectors(a, b, Math.min(1, k));
      ball.position.y += Math.sin(Math.min(1, k) * Math.PI) * 0.8;
      for (let n = 0; n < 6; n++) {
        this.glow.add({ p: ball.position.clone().add(new THREE.Vector3(rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25))), v: new THREE.Vector3(rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5)), gravity: 0, drag: 1, life: rand(0.25, 0.45), size: [rand(50, 70), 10], color: [linear(FIRE[0]), linear(FIRE[2])], alpha: [1, 0] });
      }
      this.smoke.add({ p: ball.position.clone(), v: new THREE.Vector3(0, 0.6, 0), gravity: 0, drag: 0.5, life: 0.7, size: [24, 50], color: [linear(SMOKE), linear(SMOKE)], alpha: [0.5, 0] });
    });
  }

  /** 蓄力：施放期間手上（武器）聚光 */
  private charge(at: Vec2, duration: number, color: number): void {
    const o = new THREE.Object3D();
    this.addItem(o, Math.max(0.05, duration), (age) => {
      const k = age / Math.max(0.05, duration);
      for (let n = 0; n < 2; n++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.6 * (1 - k) + 0.1;
        const p = this.v3(vec2(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r), 1.1 + rand(-0.2, 0.3));
        const v = this.v3(at, 1.15).sub(p).multiplyScalar(3);
        this.glow.add({ p, v, gravity: 0, drag: 0, life: 0.25, size: [8 + 14 * k, 4], color: [linear(0xffffff), linear(color)], alpha: [0.9, 0] });
      }
    });
  }

  /** 裂地擊：前方扇形的地面炸開、地裂透光、土塊從地面突出、塵土飛揚 */
  private fanQuake(at: Vec2, dir: Vec2, radius: number, angleDeg: number): void {
    const base = Math.atan2(dir.y, dir.x);
    const span = THREE.MathUtils.degToRad(angleDeg);
    const crack = this.additivePlane(radius * 2, radius * 2, this.crackTex, 0xffb050);
    crack.position.set(at.x, 0.03, at.y);
    crack.rotation.x = -Math.PI / 2;
    // 只留扇形：用 alphaTest 不行（加亮）——以三角扇的幾何取代整片
    crack.geometry.dispose();
    crack.geometry = fanGeometry(radius, base, span) as unknown as THREE.PlaneGeometry;
    crack.rotation.x = 0;
    this.planeItem(crack, 1.4, (age) => (crack.material.opacity = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.15) / 1.25)));
    // 土刺：由近到遠依序從地面竄出
    for (let i = 0; i < 34; i++) {
      const a = base + rand(-span / 2, span / 2);
      const d = rand(0.5, radius);
      const p = vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
      const delay = (d / radius) * 0.22;
      const h = rand(0.35, 0.8) * (1.1 - d / radius / 2);
      const rock = new THREE.Mesh(this.iceGeo, new THREE.MeshStandardMaterial({ color: linear(i % 3 ? ROCK : 0x6e5a44), flatShading: true, roughness: 1 }));
      rock.castShadow = true;
      rock.position.set(p.x, 0, p.y);
      rock.rotation.set(rand(-0.35, 0.35), rand(0, Math.PI), rand(-0.35, 0.35));
      const w = rand(0.12, 0.24);
      rock.scale.set(w, 0.001, w);
      this.addItem(rock, 1.6 + delay, (age) => {
        const t = age - delay;
        if (t < 0) return;
        // 竄出（0.08 秒）→ 停留 → 沉回地下
        const up = Math.min(1, t / 0.08);
        const down = t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.4) : 1;
        rock.scale.y = Math.max(0.001, h * up * down);
      }, () => (rock.material as THREE.Material).dispose());
      if (i % 3 === 0) this.later.push({ at: this.time + delay, run: () => this.dust(p, 2, 0.2) });
    }
    this.later.push({ at: this.time + 0.05, run: () => this.debris(at, 10, 2, ROCK) });
  }

  /** 雷柱：寬的鋸齒光柱從天上劈下，落點電光炸開、地面焦痕 */
  private thunder(at: Vec2, width: number, strength: number): void {
    const height = 9;
    for (let k = 0; k < 2; k++) {
      const col = this.additivePlane(width * (k ? 0.45 : 1), height, this.boltTex[Math.floor(Math.random() * 3)]!, k ? 0xffffff : 0xf5e663);
      col.position.set(at.x, height / 2, at.y);
      // 永遠面向鏡頭（鏡頭在 +X +Z 方向）
      col.rotation.y = Math.PI / 4;
      this.planeItem(col, 0.32, (age) => (col.material.opacity = (age < 0.05 ? 1 : 1 - (age - 0.05) / 0.27) * (0.8 + 0.2 * Math.sin(age * 90))));
    }
    this.sparksBurst(at, 1.2, 0xf5e663, Math.round(34 * strength));
    this.shockRing(at, 1.4 * strength + width, 0xfff6b0);
    const scorch = this.additivePlane(1, 1, this.crackTex, 0xf5e663);
    scorch.position.set(at.x, 0.03, at.y);
    scorch.rotation.x = -Math.PI / 2;
    scorch.scale.setScalar(1.6 * strength + width);
    this.planeItem(scorch, 0.8, (age) => (scorch.material.opacity = 0.9 * (1 - age / 0.8)));
  }

  /** 爆炸：一團往上翻滾的火焰、火星、黑煙柱、地上的衝擊環 */
  private explosion(at: Vec2, radius: number, color: number, power: number): void {
    const n = Math.round(60 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.5, 2.6) * radius * 0.7;
      // 白熱的只有少數，大多是橘紅色（加亮混合疊太多白色會整團發白）
      this.glow.add({ p: this.v3(at, rand(0.1, 0.5)), v: new THREE.Vector3(Math.cos(a) * s, rand(1, 3.4) * power, Math.sin(a) * s), gravity: -0.5, drag: 2.6, life: rand(0.35, 0.8), size: [rand(30, 60) * Math.sqrt(power), rand(10, 20)], color: [linear(i % 5 ? FIRE[1] : FIRE[0]), linear(i % 4 ? FIRE[3] : color)], alpha: [0.65, 0] });
    }
    this.sparksBurst(at, radius, 0xffd070, Math.round(30 * power));
    this.smokePuffs(at, Math.round(14 * power), radius * 0.6, 1.6 * power);
    this.shockRing(at, radius * 1.2, 0xffc070);
  }

  /** 散開的火星 / 電光 */
  private sparksBurst(at: Vec2, radius: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 5) * Math.max(0.6, Math.min(1.6, radius));
      this.glow.add({ p: this.v3(at, 0.4), v: new THREE.Vector3(Math.cos(a) * s, rand(1, 4), Math.sin(a) * s), gravity: 7, drag: 1.2, life: rand(0.35, 0.8), size: [rand(8, 13), 2], color: [linear(0xffffff), linear(color)], alpha: [1, 0] });
    }
  }

  /** 火舌：從地上竄起、往上縮小變暗 */
  private flameTongue(at: Vec2, size: number): void {
    this.glow.add({ p: this.v3(at, 0.05), v: new THREE.Vector3(rand(-0.15, 0.15), rand(1.2, 2.4) * size, rand(-0.15, 0.15)), gravity: -0.6, drag: 0.4, life: rand(0.45, 0.85), size: [rand(26, 42) * size, 6], color: [linear(Math.random() < 0.3 ? FIRE[0] : FIRE[1]), linear(FIRE[3])], alpha: [0.6, 0] });
    if (Math.random() < 0.12) this.smoke.add({ p: this.v3(at, rand(0.6, 1.2) * size), v: new THREE.Vector3(rand(-0.1, 0.1), 0.6, rand(-0.1, 0.1)), gravity: 0, drag: 0.3, life: rand(0.8, 1.4), size: [24, 56], color: [linear(SMOKE), linear(SMOKE)], alpha: [0.45, 0] });
    if (Math.random() < 0.2) this.glow.add({ p: this.v3(at, rand(0.2, 0.8)), v: new THREE.Vector3(rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4)), gravity: 0.5, drag: 0.3, life: rand(0.6, 1.1), size: [6, 2], color: [linear(0xffe090), linear(0xff5020)], alpha: [1, 0] });
  }

  private flames(at: Vec2, radius: number, n: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.sqrt(Math.random());
      this.flameTongue(vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), size + rand(0, 0.4));
    }
  }

  private smokePuffs(at: Vec2, n: number, radius: number, rise = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.random();
      this.smoke.add({ p: this.v3(vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), rand(0.2, 0.6)), v: new THREE.Vector3(Math.cos(a) * 0.4, rand(0.6, 1.4) * rise, Math.sin(a) * 0.4), gravity: 0, drag: 0.6, life: rand(1, 1.8), size: [rand(30, 50), rand(80, 120)], color: [linear(0x4a3a30), linear(SMOKE)], alpha: [0.6, 0] });
    }
  }

  private dust(at: Vec2, n: number, radius: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.add({ p: this.v3(vec2(at.x + Math.cos(a) * radius * 0.3, at.y + Math.sin(a) * radius * 0.3), 0.1), v: new THREE.Vector3(Math.cos(a) * rand(0.8, 2), rand(0.3, 1.1), Math.sin(a) * rand(0.8, 2)), gravity: 0, drag: 1.8, life: rand(0.7, 1.3), size: [rand(20, 34), rand(50, 80)], color: [linear(DUST), linear(0x5a4a3a)], alpha: [0.55, 0] });
    }
  }

  /** 冰：冰晶碎片往外噴、寒霧擴散（power 越大越久） */
  private frostBlast(at: Vec2, radius: number, power: number): void {
    for (let i = 0; i < Math.round(26 * power); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 4) * Math.min(1.6, radius);
      this.glow.add({ p: this.v3(at, 0.3), v: new THREE.Vector3(Math.cos(a) * s, rand(1, 3.5), Math.sin(a) * s), gravity: 6, drag: 1, life: rand(0.5, 1) * power, size: [rand(9, 14), 3], color: [linear(0xffffff), linear(ICE)], alpha: [1, 0] });
    }
    for (let i = 0; i < Math.round(10 * power); i++) {
      const a = Math.random() * Math.PI * 2;
      this.fog(vec2(at.x + Math.cos(a) * radius * 0.5 * Math.random(), at.y + Math.sin(a) * radius * 0.5 * Math.random()), ICE, power);
    }
    // 冰刺：一圈從地面竄出（power 越大越多）
    const spikes = Math.round(8 * power * Math.min(2, radius));
    for (let i = 0; i < spikes; i++) this.icePillar(vec2(at.x + Math.cos((i / spikes) * Math.PI * 2) * radius * rand(0.5, 0.95), at.y + Math.sin((i / spikes) * Math.PI * 2) * radius * rand(0.5, 0.95)), rand(0.3, 0.6), 0.7 * power, rand(0, 0.08));
    this.shockRing(at, radius, ICE);
  }

  private fog(at: Vec2, color: number, power: number): void {
    this.smoke.add({ p: this.v3(at, rand(0.05, 0.3)), v: new THREE.Vector3(rand(-0.4, 0.4), rand(0.05, 0.3), rand(-0.4, 0.4)), gravity: 0, drag: 0.8, life: rand(1, 1.8) * power, size: [rand(40, 60), rand(90, 130)], color: [linear(0xe8f8ff), linear(color)], alpha: [0.35, 0] });
  }

  /** 絕對零度：整片地面滿滿的冰柱（留到冰凍區域結束）、寒霧 */
  private iceField(at: Vec2, radius: number): void {
    const n = Math.round(radius * radius * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.sqrt(Math.random());
      this.icePillar(vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), rand(0.4, 1.3) * (1 - (d / radius) * 0.4), 8, (d / radius) * 0.25);
    }
    this.frostBlast(at, radius, 1.4);
  }

  /** 一根冰柱：竄出 → 停留 life 秒 → 碎裂 */
  private icePillar(at: Vec2, height: number, life: number, delay: number): void {
    const m = new THREE.Mesh(this.iceGeo, new THREE.MeshStandardMaterial({ color: linear(Math.random() < 0.5 ? ICE : ICE_DARK), emissive: linear(0x2a6a9a), emissiveIntensity: 0.35, flatShading: true, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }));
    m.castShadow = true;
    m.position.set(at.x, 0, at.y);
    m.rotation.set(rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.3, 0.3));
    const w = rand(0.1, 0.2) * Math.max(0.6, height);
    m.scale.set(w, 0.001, w);
    let shattered = false;
    this.addItem(m, delay + life, (age) => {
      const t = age - delay;
      if (t < 0) return;
      m.scale.y = Math.max(0.001, height * Math.min(1, t / 0.1));
      // 最後 0.25 秒碎裂：縮小並噴出冰屑
      if (t > life - 0.25) {
        m.scale.multiplyScalar(0.92);
        if (!shattered) {
          shattered = true;
          for (let i = 0; i < 5; i++) this.glow.add({ p: m.position.clone().setY(height * 0.5), v: new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)), gravity: 6, drag: 1, life: 0.5, size: [8, 2], color: [linear(0xffffff), linear(ICE)], alpha: [1, 0] });
        }
      }
    }, () => (m.material as THREE.Material).dispose());
  }

  /** 飛起的碎石（會落地彈跳） */
  private debris(at: Vec2, n: number, speed: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const rock = new THREE.Mesh(this.rockGeo, new THREE.MeshStandardMaterial({ color: linear(color), flatShading: true, roughness: 1 }));
      rock.castShadow = true;
      rock.scale.setScalar(rand(0.05, 0.13));
      rock.position.set(at.x, 0.2, at.y);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * rand(0.5, 1.5) * speed, rand(2, 4.5) * Math.min(1.5, speed * 0.6), Math.sin(a) * rand(0.5, 1.5) * speed);
      const spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      this.addItem(rock, rand(1.2, 1.8), (age, dt) => {
        v.y -= 12 * dt;
        rock.position.addScaledVector(v, dt);
        if (rock.position.y < 0.04) {
          rock.position.y = 0.04;
          v.y *= -0.35;
          v.x *= 0.6;
          v.z *= 0.6;
        }
        rock.rotation.x += spin.x * dt;
        rock.rotation.y += spin.y * dt;
        if (age > 1) rock.scale.multiplyScalar(0.94);
      }, () => (rock.material as THREE.Material).dispose());
    }
  }

  /** 地上一圈快速擴散的衝擊環 */
  private shockRing(at: Vec2, radius: number, color: number): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: linear(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.04, at.y);
    this.addItem(ring, 0.4, (age) => {
      const k = age / 0.4;
      ring.scale.setScalar(0.2 + radius * (1 - (1 - k) * (1 - k)));
      ring.material.opacity = 1 - k;
    }, () => {
      ring.geometry.dispose();
      ring.material.dispose();
    });
  }

  /** 盾擊：往前推的圓錐衝擊波（三道弧） */
  private coneWave(at: Vec2, dir: Vec2, radius: number, color: number): void {
    const base = Math.atan2(dir.y, dir.x);
    for (let k = 0; k < 3; k++) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24, 1, -base - 0.6, 1.2), new THREE.MeshBasicMaterial({ color: linear(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(at.x - dir.x * radius * 0.5, 0.5, at.y - dir.y * radius * 0.5);
      const delay = k * 0.06;
      this.addItem(arc, 0.4 + delay, (age) => {
        const t = Math.max(0, age - delay) / 0.4;
        arc.visible = age >= delay;
        arc.scale.setScalar(0.3 + radius * 1.1 * t);
        arc.material.opacity = 0.9 * (1 - t);
      }, () => {
        arc.geometry.dispose();
        arc.material.dispose();
      });
    }
    this.sparksBurst(at, 0.5, 0xffe8b0, 12);
  }

  /** 閃光粉：刺眼的白光、一大團慢慢散開的金白色粉塵（約 1.2 秒） */
  private flashPowder(at: Vec2, radius: number): void {
    const flash = this.additivePlane(1, 1, this.glowTex, 0xffffff);
    flash.position.set(at.x, 0.6, at.y);
    flash.rotation.y = Math.PI / 4;
    this.planeItem(flash, 0.35, (age) => {
      flash.scale.setScalar(radius * 3 * (0.5 + age * 2));
      flash.material.opacity = 1 - age / 0.35;
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.sqrt(Math.random());
      this.smoke.add({ p: this.v3(vec2(at.x + Math.cos(a) * d * 0.4, at.y + Math.sin(a) * d * 0.4), rand(0.2, 0.9)), v: new THREE.Vector3(Math.cos(a) * rand(0.4, 1.2), rand(0, 0.4), Math.sin(a) * rand(0.4, 1.2)), gravity: 0, drag: 0.9, life: rand(1, 1.6), size: [rand(30, 50), rand(80, 120)], color: [linear(0xfffae0), linear(0xffe48a)], alpha: [0.55, 0] });
      this.glow.add({ p: this.v3(vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), rand(0.2, 1.2)), v: new THREE.Vector3(rand(-0.3, 0.3), rand(-0.1, 0.3), rand(-0.3, 0.3)), gravity: 0, drag: 0.5, life: rand(0.8, 1.5), size: [6, 2], color: [linear(0xffffff), linear(0xffe14a)], alpha: [1, 0] });
    }
    this.shockRing(at, radius, 0xffffff);
  }

  /** 箭雨：一支箭從天上斜斜落下、插在地上（停留約 2.5 秒） */
  private fallingArrow(at: Vec2, radius: number): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.sqrt(Math.random());
      const p = vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
      const m = new THREE.Mesh(this.arrowGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a44 }));
      m.castShadow = true;
      const tilt = new THREE.Euler(rand(-0.25, 0.25), 0, rand(-0.25, 0.25));
      const fall = 0.12;
      const delay = rand(0, 0.1);
      m.visible = false;
      this.addItem(m, delay + fall + 2.6, (age) => {
        const t = age - delay;
        if (t < 0) return;
        m.visible = true;
        const k = Math.min(1, t / fall);
        m.rotation.copy(tilt);
        m.position.set(p.x - (1 - k) * 0.6, 0.28 + (1 - k) * 5, p.y - (1 - k) * 0.6);
        if (k === 1 && t < fall + 0.02) this.dust(p, 1, 0.1);
        if (t > fall + 2.2) m.position.y -= (t - fall - 2.2) * 0.6;
      }, () => (m.material as THREE.Material).dispose());
    }
  }

  /** 毒：冒出的綠色泡泡 */
  private bubbles(at: Vec2, radius: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.sqrt(Math.random());
      this.glow.add({ p: this.v3(vec2(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), 0.05), v: new THREE.Vector3(rand(-0.2, 0.2), rand(0.5, 1.4), rand(-0.2, 0.2)), gravity: -0.3, drag: 0.6, life: rand(0.6, 1.2), size: [rand(10, 18), rand(16, 26)], color: [linear(color), linear(0x2a6a1a)], alpha: [0.8, 0] });
    }
    for (let i = 0; i < n / 3; i++) this.fog(vec2(at.x + rand(-radius, radius) * 0.5, at.y + rand(-radius, radius) * 0.5), color, 1);
  }

  /** 鎖鏈：兩點之間一節節的鐵環（每幀重畫） */
  private chainLine(from: Vec2, to: Vec2, life: number): void {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const links = Math.max(2, Math.round(len * 5));
    for (let i = 0; i <= links; i++) {
      const k = i / links;
      const p = this.v3(vec2(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k), 0.9 - Math.sin(k * Math.PI) * 0.15);
      this.glow.add({ p, v: new THREE.Vector3(), gravity: 0, drag: 0, life, size: [7, 7], color: [linear(0xd8d0c0), linear(0xd8d0c0)], alpha: [0.9, 0.9] });
    }
  }
}

/** 扇形（地面）幾何：中心在原點、朝 base 方向展開 span 弧度，UV 對應整張貼圖 */
function fanGeometry(radius: number, base: number, span: number): THREE.BufferGeometry {
  const seg = 24;
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0.5, 0.5];
  for (let i = 0; i <= seg; i++) {
    const a = base - span / 2 + (span * i) / seg;
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  const idx: number[] = [];
  for (let i = 1; i <= seg; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
