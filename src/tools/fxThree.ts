import { Application, Container, type WebGLRenderer } from 'pixi.js';
import { IsoProjection } from '../core/math/IsoProjection';
import { normalize, rotate, vec2, type Vec2 } from '../core/math/Vec2';
import { DataRegistry } from '../data/DataRegistry';
import { gameData } from '../data';
import type { EffectDef } from '../data/schema/effects';
import type { SkillDef } from '../data/schema/skill';
import { firstElement } from '../game/skills/effects/AreaEffect';
import { HEROINE } from '../render/figure/Heroine';
import { MONSTER_MODELS } from '../render/figure/Monsters';
import { PolyFigure } from '../render/figure/PolyFigure';
import { mountFor, tierLook } from '../render/figure/weapons/WeaponLooks';
import { ELEMENT_COLORS } from '../render/palette';
import { BIG_IMPACTS, impactKind, itemFxColor } from '../render/Renderer';
import { ThreeWorld } from '../render/three/ThreeWorld';
import { EffectLayer } from '../render/views/EffectLayer';

/**
 * 技能特效預覽（開發用，/fx-three.html）：與遊戲相同的 Three.js 畫法，照技能資料演出一招
 * （主角施法 → 投射物飛向木頭假人 → 爆發、延遲落下、持續區域、連鎖），一直重播。
 * - ?skill=magic.fireball：只看這一招（預設：所有招式輪流）
 * - ?record=1：每 0.1 秒存一張畫面到 art/Skills/review/<招式>/（開發伺服器的 /__save-frame），做成 review.html
 */
const params = new URLSearchParams(location.search);
const RECORD = params.get('record') === '1';
const ZOOM = Number(params.get('zoom')) || 1.5;
const W = 560;
const H = 400;
/** 錄製：每幾秒一張、每招最長幾秒 */
const FRAME_STEP = 0.1;
const MAX_TIME = 4.2;
const DT = 1 / 60;

const data = DataRegistry.load(gameData);
const CATEGORY_ORDER = ['melee', 'ranged', 'magic'];
const skills = data.skills.all
  .filter((s) => s.kind === 'active' && (CATEGORY_ORDER.includes(s.tree?.category ?? '') || s.id.startsWith('utility.')))
  .sort((a, b) => (CATEGORY_ORDER.indexOf(a.tree?.category ?? 'z') + 1 || 9) - (CATEGORY_ORDER.indexOf(b.tree?.category ?? 'z') + 1 || 9) || (a.tree?.tier ?? 9) - (b.tree?.tier ?? 9));
const only = params.get('skill');
const list = only ? skills.filter((s) => s.id === only) : skills;

const host = document.getElementById('host')!;
host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
const app = new Application();
await app.init({ preference: 'webgl', width: W, height: H, background: 0x0d0b09, antialias: true, resolution: 1 });
host.appendChild(app.canvas);
const projection = new IsoProjection();
const three = new ThreeWorld(app.canvas, (app.renderer as WebGLRenderer).gl, projection);
app.renderer.resetState();
app.ticker.stop();
const FLOOR = 0x4a4038;
three.setMap([], 0.5, [], { style: 'rubble', accent: 0, glow: 0 }, [-10, -10, 30, -10, 30, 30, FLOOR, -10, -10, 30, 30, -10, 30, FLOOR]);

const CASTER = vec2(8, 8);
/** 目標（木頭假人）：近戰站在面前，其他在 4.5 格外 */
let TARGET = vec2(11.2, 11.2);
const targetFor = (skill: SkillDef) => (skill.tree?.category === 'melee' ? vec2(9, 9) : vec2(11.2, 11.2));

/** 固定的亂數（每招每次錄出來都一樣） */
function seed(n: number): void {
  let s = n >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Flying {
  id: number;
  skill: { id: string; tags: readonly string[] };
  onHit: readonly EffectDef[];
  mods: { combo: null };
  radius: number;
  position: Vec2;
  prevPosition: Vec2;
  direction: Vec2;
  from: Vec2;
  speed: number;
  start: number;
  end: number;
}

/** 一招的演出：依時間觸發的事件 */
class Show {
  readonly world = new Container();
  readonly objects = new Container();
  readonly layer: EffectLayer;
  readonly hero = new PolyFigure(HEROINE);
  readonly dummy = new PolyFigure(MONSTER_MODELS['enemy.training_dummy']!);
  readonly heroSink = three.createFigure(true);
  readonly dummySink = three.createFigure(true);
  private events: { at: number; run: () => void }[] = [];
  readonly projectiles: Flying[] = [];
  readonly zones: { id: number; position: Vec2; radius: number; effects: readonly EffectDef[]; from: number; to: number; ctx: { skill: { id: string } } }[] = [];
  readonly pending: { id: number; position: Vec2; effects: readonly EffectDef[]; from: number; to: number; ctx: { skill: { id: string }; rank: number; mods: { aoeRadius: number } }; followCaster: false }[] = [];
  heroAt = CASTER;
  time = 0;
  last = 0;
  private nextId = 1;
  private readonly dir: Vec2;

  constructor(readonly skill: SkillDef) {
    TARGET = targetFor(skill);
    this.objects.sortableChildren = true;
    this.layer = new EffectLayer(projection, this.objects);
    this.world.addChild(this.layer.ground, this.objects);
    this.layer.listener = three.skillFx;
    app.stage.addChild(this.world);
    this.hero.sink = this.heroSink;
    this.dummy.sink = this.dummySink;
    const category = skill.tree?.category;
    this.hero.setWeapon(mountFor(tierLook(category === 'ranged' ? 'bow' : category === 'magic' ? 'staff' : 'sword', 3)));
    const d = vec2(TARGET.x - CASTER.x, TARGET.y - CASTER.y);
    const len = Math.hypot(d.x, d.y);
    this.dir = vec2(d.x / len, d.y / len);
    const cast = Math.max(0.15, skill.castTime ?? 0.3);
    const tags = skill.tags;
    if (tags.includes('spell')) this.hero.act('cast', cast);
    else this.hero.act('attack', cast, tags.includes('ranged') || tags.includes('projectile') ? 'shoot' : tags.includes('heavy') ? 'overhead' : 'slash');
    const origin = skill.targeting === 'ground' ? TARGET : CASTER;
    // 與遊戲相同：出招事件（突進終點、延遲秒數）
    const dash = skill.effects.find((e) => e.type === 'dash');
    const delayed = skill.effects.find((e) => e.type === 'delayed');
    const dashTo = dash && dash.type === 'dash' ? vec2(CASTER.x + this.dir.x * (dash.direction === 'forward' ? 1 : -1) * (dash.passThrough || dash.direction === 'backward' ? dash.distance : Math.min(dash.distance, Math.hypot(TARGET.x - CASTER.x, TARGET.y - CASTER.y) - 0.6)), CASTER.y + this.dir.y * (dash.direction === 'forward' ? 1 : -1) * (dash.passThrough || dash.direction === 'backward' ? dash.distance : Math.min(dash.distance, Math.hypot(TARGET.x - CASTER.x, TARGET.y - CASTER.y) - 0.6))) : undefined;
    this.at(0, () => this.layer.cast({ skillId: skill.id, caster: CASTER, point: skill.targeting === 'enemy' ? TARGET : skill.targeting === 'ground' ? TARGET : vec2(CASTER.x + this.dir.x * 5, CASTER.y + this.dir.y * 5), direction: this.dir, impactIn: cast, ...(dashTo ? { dashTo } : {}), ...(delayed && delayed.type === 'delayed' ? { delay: delayed.delay } : {}) }));
    this.schedule(skill.effects, origin, this.dir, cast);
  }

  dispose(): void {
    three.skillFx.clear();
    this.world.destroy({ children: true });
    this.heroSink.dispose();
    this.dummySink.dispose();
  }

  private at(time: number, run: () => void): void {
    this.events.push({ at: time, run });
    this.last = Math.max(this.last, time);
  }

  private impact(area: Extract<EffectDef, { type: 'area' }>, position: Vec2, dir: Vec2, time: number): void {
    const element = firstElement(area.effects);
    const radius = Array.isArray(area.radius) ? area.radius[0]! : (area.radius as number);
    const angleDeg = area.angleDeg ?? 360;
    const direction = area.offsetDeg ? rotate(dir, area.offsetDeg) : dir;
    const center = area.at === 'target' ? TARGET : position;
    this.at(time, () => {
      this.layer.spawnImpact({
        kind: impactKind(this.skill.id, this.skill.tags, element, angleDeg, radius),
        position: center,
        radius,
        color: itemFxColor(this.skill.id, element) ?? ELEMENT_COLORS[element ?? 'physical'] ?? 0xffffff,
        direction,
        angleDeg,
        big: BIG_IMPACTS.has(this.skill.id) || radius >= 3,
        special: false,
        glow: element !== null && element !== 'physical',
        skillId: this.skill.id,
        element,
      });
      if (Math.hypot(center.x - TARGET.x, center.y - TARGET.y) < radius + 0.6) this.dummy.hit();
    });
    this.schedule(area.effects, center, dir, time);
  }

  private schedule(effects: readonly EffectDef[], origin: Vec2, dir: Vec2, time: number): void {
    for (const e of effects) {
      if (e.type === 'area') this.impact(e, origin, dir, time);
      else if (e.type === 'projectile') {
        const count = Array.isArray(e.count) ? e.count[0]! : (e.count as number);
        const spread = Array.isArray(e.spreadDeg) ? e.spreadDeg[0]! : (e.spreadDeg as number);
        for (let i = 0; i < count; i++) {
          const angle = count > 1 ? (spread >= 360 ? (i / count) * 360 : -spread / 2 + (spread * i) / (count - 1)) : 0;
          const d = rotate(dir, angle);
          const dist = Math.abs(angle) < 10 ? Math.hypot(TARGET.x - origin.x, TARGET.y - origin.y) : Math.min(e.range, 5);
          const end = time + dist / e.speed;
          const p: Flying = { id: this.nextId++, skill: { id: this.skill.id, tags: this.skill.tags }, onHit: e.onHit, mods: { combo: null }, radius: e.radius, position: origin, prevPosition: origin, direction: d, from: origin, speed: e.speed, start: time, end };
          this.at(time, () => this.projectiles.push(p));
          const hit = vec2(origin.x + d.x * dist, origin.y + d.y * dist);
          this.at(end, () => {
            this.projectiles.splice(this.projectiles.indexOf(p), 1);
            if (Math.abs(angle) < 10) this.dummy.hit();
          });
          this.schedule(e.onHit, hit, d, end);
        }
      } else if (e.type === 'zone') {
        const duration = typeof e.duration === 'number' ? e.duration : e.duration[0];
        const z = { id: this.nextId++, position: origin, radius: e.radius, effects: e.effects, from: time, to: time + duration, ctx: { skill: { id: this.skill.id } } };
        this.zones.push(z);
        this.at(Math.min(time + duration, time + 2.4), () => {});
      } else if (e.type === 'delayed') {
        for (let k = 0; k < e.repeat; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = e.scatter * Math.sqrt(Math.random());
          const pos = vec2(origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r);
          const start = time + k * e.interval;
          const area = e.effects.find((x) => x.type === 'area');
          if (area) this.pending.push({ id: this.nextId++, position: pos, effects: e.effects, from: start, to: start + e.delay, ctx: { skill: { id: this.skill.id }, rank: 1, mods: { aoeRadius: 0 } }, followCaster: false });
          this.schedule(e.effects, pos, rotate(dir, e.spinDeg * k), start + e.delay);
        }
      } else if (e.type === 'chain') {
        const points = [CASTER, TARGET];
        for (let k = 0; k < e.jumps; k++) points.push(vec2(TARGET.x + [1.6, -0.6, 1.2][k % 3]! + k * 0.4, TARGET.y + [-1.4, 1.5, 1.8][k % 3]! + k * 0.3));
        const element = firstElement(e.effects) ?? 'lightning';
        this.at(time, () => {
          this.layer.spawnChain(points, ELEMENT_COLORS[element] ?? 0xffffff, false);
          this.dummy.hit();
        });
      } else if (e.type === 'damage') {
        this.at(time, () => this.dummy.hit());
      } else if (e.type === 'device' && e.behavior === 'turret') {
        // 圖騰、投射器：放下後朝目標連射幾發（機關本體只在遊戲裡畫）
        const shots = Math.min(6, Array.isArray(e.shots) ? e.shots[0]! : (e.shots as number));
        // 放在主角身旁（落點就是假人的位置，從那裡射看不出來）
        const at = vec2(CASTER.x + 1.2, CASTER.y - 0.6);
        const toTarget = normalize(vec2(TARGET.x - at.x, TARGET.y - at.y));
        for (let k = 0; k < shots; k++) this.schedule(e.onShot, at, toTarget, time + 0.3 + k * e.interval);
      } else if (e.type === 'device') {
        // 機關（地雷、火藥桶）：放下 0.8 秒後引爆，看爆炸的樣子
        const blast = e.onTrigger.length ? e.onTrigger : e.onDestroy.length ? e.onDestroy : e.onExpire;
        this.schedule(blast, origin, dir, time + 0.8);
      } else if (e.type === 'dash') {
        const sign = e.direction === 'forward' ? 1 : -1;
        const dist = Math.min(e.distance, e.direction === 'forward' ? Math.hypot(TARGET.x - CASTER.x, TARGET.y - CASTER.y) - 0.8 : e.distance);
        const to = vec2(CASTER.x + dir.x * dist * sign, CASTER.y + dir.y * dist * sign);
        this.at(time, () => {
          const from = this.heroAt;
          const t0 = this.time;
          this.move = (t) => {
            const k = Math.min(1, (t - t0) / 0.15);
            this.heroAt = vec2(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
          };
        });
        this.schedule(e.onPath, to, dir, time + 0.1);
      }
    }
  }

  private move: ((t: number) => void) | null = null;

  step(dt: number): void {
    this.time += dt;
    // 時間到的事件各執行一次（包含 0 秒的出招事件）
    const due = this.events.filter((ev) => ev.at <= this.time);
    this.events = this.events.filter((ev) => ev.at > this.time);
    for (const ev of due) ev.run();
    this.move?.(this.time);
    for (const p of this.projectiles) {
      const k = Math.min(1, (this.time - p.start) / (p.end - p.start));
      const dist = (p.end - p.start) * p.speed * k;
      p.prevPosition = p.position;
      p.position = vec2(p.from.x + p.direction.x * dist, p.from.y + p.direction.y * dist);
    }
    const zones = this.zones.filter((z) => this.time >= z.from && this.time < z.to);
    const pending = this.pending.filter((p) => this.time >= p.from && this.time < p.to).map((p) => ({ ...p, remaining: p.to - this.time }));
    this.layer.update(dt, this.projectiles as never, 1, zones as never, pending as never);
    const face = vec2(TARGET.x - this.heroAt.x, TARGET.y - this.heroAt.y);
    this.hero.update(dt, { facing: face, moving: false, alive: true });
    this.dummy.update(dt, { facing: vec2(-1, -1), moving: false, alive: true });
  }

  /** dt：距離上次畫的秒數（Three.js 的粒子、物件依此老化） */
  draw(dt: number): void {
    const view = vec2((CASTER.x + TARGET.x) / 2, (CASTER.y + TARGET.y) / 2 + 0.6);
    const s = projection.toScreen(view);
    this.world.scale.set(ZOOM);
    this.world.position.set(W / 2 - s.x * ZOOM, H / 2 - s.y * ZOOM);
    this.heroSink.place(this.heroAt, vec2(0, 0), 0, 0xffffff, 1, true);
    this.dummySink.place(TARGET, vec2(0, 0), 0, 0xffffff, 1, true);
    three.setGlows(this.layer.glows, this.layer.flying);
    const pixi = app.renderer;
    three.renderFloor(view, W, H, ZOOM, this.heroAt, 9, 0x0d0b09, dt);
    pixi.resetState();
    this.objects.visible = false;
    pixi.render({ container: app.stage, clear: false });
    this.objects.visible = true;
    three.renderObjects();
    pixi.resetState();
    this.layer.ground.visible = false;
    pixi.render({ container: app.stage, clear: false });
    this.layer.ground.visible = true;
  }

  get duration(): number {
    return Math.min(MAX_TIME, this.last + 0.9);
  }
}

async function save(path: string, body: Blob | string): Promise<void> {
  await fetch(`/__save-frame/${path}`, { method: 'POST', body });
}

if (RECORD) {
  const manifest: { id: string; name: string; category: string; description: string; frames: number }[] = [];
  for (const [i, skill] of list.entries()) {
    seed(1000 + i);
    const show = new Show(skill);
    let frames = 0;
    let nextShot = 0;
    let since = 0;
    while (show.time < show.duration) {
      show.step(DT);
      since += DT;
      // 沒有存圖的幀也要讓 Three.js 的特效老化（只算不畫）
      if (show.time >= nextShot) {
        nextShot += FRAME_STEP;
        show.draw(since);
        since = 0;
        const blob = await new Promise<Blob>((r) => app.canvas.toBlob((b) => r(b!), 'image/jpeg', 0.82));
        await save(`${skill.id}/${String(frames).padStart(2, '0')}.jpg`, blob);
        frames++;
      }
    }
    show.dispose();
    manifest.push({ id: skill.id, name: skill.name, category: skill.tree?.category ?? 'utility', description: skill.description ?? '', frames });
    document.title = `錄製中 ${i + 1} / ${list.length}`;
  }
  await save('manifest.json', JSON.stringify(manifest, null, 1));
  document.title = `完成：${list.length} 招`;
} else {
  let index = 0;
  let show = new Show(list[0]!);
  const loop = () => {
    show.step(DT);
    show.draw(DT);
    if (show.time >= show.duration) {
      show.dispose();
      index = (index + 1) % list.length;
      show = new Show(list[index]!);
      document.title = list[index]!.name;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
