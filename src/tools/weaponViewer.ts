import { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { legendaries } from '../data/legendaries';
import type { Rarity, WeaponType } from '../data/schema/item';
import { figureScale, type AttackVariant, type FigureModel, type Pose } from '../render/figure/FigureModel';
import { blenderShield } from '../render/figure/gear/BlenderShield';
import { armorSpec, heroineOutfit, uniqueArmorSpec, UNIQUE_ARMOR_IDS, type ArmorSlot } from '../render/figure/gear/ArmorLooks';
import type { GearTheme } from '../render/figure/gear/GearTheme';
import { HEROINE } from '../render/figure/Heroine';
import { PolyFigure, type FigureState } from '../render/figure/PolyFigure';
import { apply, jointRotation, type M3, type Mesh, type V3 } from '../render/figure/Poly3D';
import { baseModelLook, HOLD, mountFor, themedLook, uniqueLook, UNIQUE_WEAPON_IDS, type WeaponLook } from '../render/figure/weapons/WeaponLooks';
import { ThreeWorld } from '../render/three/ThreeWorld';

/**
 * 開發用：裝備預覽（http://localhost:5173/weapon-viewer.html）。
 * 九種裝備（劍、斧、弓、杖、盾、頭盔、盔甲、手套、鞋子）各 T1～T8，可加詞綴主題（換色、變形），或從右邊清單選橘 / 紅裝備。
 * 左邊：武器懸在空中放大轉動；防具是只穿那一件的女主角在轉。右邊：女主角穿著所有選好的裝備，可走跑、揮擊。
 * 「底稿改」：劍、弓、杖是 Blender 建的、斧是 TRELLIS 生成的底稿改出來的（BlenderSwords / BlenderBowStaff / TrellisAxes）；防具還沒有底稿，先顯示現在遊戲的。
 * 網址：?kind=sword&tier=5&src=base|game&rarity=rare&themes=fire,speed&unique=legendary.cold_moon&zoom=4
 */

type Kind = WeaponType | ArmorSlot;
const WEAPONS: WeaponType[] = ['sword', 'axe', 'bow', 'staff'];
const ARMORS: ArmorSlot[] = ['shield', 'helmet', 'armor', 'gloves', 'boots'];
const KIND_NAME: Record<Kind, string> = { sword: '劍', axe: '斧', bow: '弓', staff: '杖', shield: '盾', helmet: '頭盔', armor: '盔甲', gloves: '手套', boots: '鞋子' };
const isWeapon = (k: Kind): k is WeaponType => (WEAPONS as string[]).includes(k);

const THEME_LIST: [GearTheme, string, string][] = [
  ['fire', '火焰', '火焰傷害% / 火焰抗性'],
  ['cold', '冰霜', '冰霜傷害% / 冰霜抗性'],
  ['lightning', '閃電', '閃電傷害% / 閃電抗性'],
  ['poison', '劇毒', '毒素傷害% / 毒素抗性'],
  ['blood', '吸血', '吸血'],
  ['arcane', '奧術', '吸魔、法術強度、法術傷害、施法速度、魔力上限、耗魔降低'],
  ['crit', '暴擊', '暴擊率、暴擊傷害'],
  ['vital', '生命', '生命上限、生命回復'],
  ['guard', '防禦（變形）', '防禦、減傷、抗擊退、抗暈眩'],
  ['speed', '敏捷（變形）', '攻擊速度、移動速度、閃避、遠程傷害'],
  ['thorns', '荊棘（變形）', '荊棘'],
  ['brutal', '蠻力（變形）', '最小 / 最大傷害、近戰傷害'],
];
const RARITY_LIST: [Rarity, string, string][] = [
  ['normal', '白', '#d8d8d8'],
  ['magic', '藍', '#6aa8ff'],
  ['rare', '黃', '#ffd84a'],
  ['epic', '紫', '#c07aff'],
];

/** 每種裝備的設定：階級 + 稀有度 + 詞綴主題，或一件橘 / 紅；on = 穿在右邊的女主角身上 */
interface Cfg {
  tier: number;
  rarity: Rarity;
  themes: GearTheme[];
  unique: string | null;
  on: boolean;
}

const params = new URLSearchParams(location.search);
const startKind = (Object.keys(KIND_NAME) as Kind[]).find((k) => k === params.get('kind')) ?? 'sword';
const cfgs = new Map<Kind, Cfg>((Object.keys(KIND_NAME) as Kind[]).map((k) => [k, { tier: 5, rarity: 'normal', themes: [], unique: null, on: k === 'sword' }]));
{
  const c = cfgs.get(startKind)!;
  c.tier = Math.min(8, Math.max(1, Number(params.get('tier')) || 5));
  c.rarity = (RARITY_LIST.find(([r]) => r === params.get('rarity'))?.[0] ?? 'normal') as Rarity;
  c.themes = (params.get('themes') ?? '').split(',').filter((t): t is GearTheme => THEME_LIST.some(([id]) => id === t)).slice(0, 2);
  c.unique = params.get('unique');
  c.on = true;
}
const state = {
  kind: startKind as Kind,
  /** 右邊女主角手上的武器 */
  weapon: (isWeapon(startKind) ? startKind : 'sword') as WeaponType,
  src: (params.get('src') === 'game' ? 'game' : 'base') as 'game' | 'base',
  move: 'idle' as 'idle' | 'walk' | 'run',
  dir: 1,
  spin: true,
  speed: 1,
  zoom: Number(params.get('zoom')) || 4,
  /** 鏡頭：全身（兩個並排）、展示品的上半身或頭 */
  cam: (params.get('cam') === 'head' ? 'head' : params.get('cam') === 'upper' ? 'upper' : 'all') as 'all' | 'upper' | 'head',
  loop: null as (() => void) | null,
};
const cfg = () => cfgs.get(state.kind)!;
const names = new Map(legendaries.map((d) => [d.id, d.name]));

function weaponLook(kind: WeaponType): WeaponLook {
  const c = cfgs.get(kind)!;
  if (c.unique) {
    const u = uniqueLook(c.unique);
    if (u) return u;
  }
  if (state.src === 'base') return baseModelLook(kind, c.tier, c.rarity, c.themes);
  return themedLook(kind, c.tier, c.rarity, c.themes);
}
type Outfit = Parameters<typeof heroineOutfit>[0];
function armorFor<K extends ArmorSlot>(slot: K): NonNullable<Outfit[K]> {
  const c = cfgs.get(slot)!;
  return (c.unique && uniqueArmorSpec(slot, c.unique)) || armorSpec(slot, c.tier, c.rarity, c.rarity === 'normal' ? [] : c.themes);
}
/** 能拿盾：單手武器（劍、斧） */
const canShield = () => state.weapon === 'sword' || state.weapon === 'axe';

/** 懸在空中的武器：把拿法（HOLD）轉回去、刃 / 頭朝上，以中心為原點；放大 FLOAT_SCALE 倍，上下輕晃 */
const FLOAT_SCALE = 2;
function floatingModel(l: WeaponLook): FigureModel {
  const m: M3 = jointRotation(HOLD[l.kind]);
  // 旋轉矩陣的反矩陣 = 轉置
  const inv = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]] as unknown as M3;
  // 沿 -Y、頭朝下 → 繞 X 轉半圈：頭朝上
  const up = (v: V3): V3 => {
    const r = apply(inv, v);
    return [r[0], -r[1], -r[2]];
  };
  const verts = l.meshes.flatMap((me) => me.verts.map(up));
  const c = [0, 1, 2].map((k) => (Math.min(...verts.map((v) => v[k]!)) + Math.max(...verts.map((v) => v[k]!))) / 2);
  const meshes: Mesh[] = l.meshes.map((me) => ({ ...me, verts: me.verts.map((v) => up(v)).map((v): V3 => [v[0] - c[0]!, v[1] - c[1]!, v[2] - c[2]!]) }));
  const float = (t: number): Pose => ({ rootY: Math.sin(t * 1.6) * 1.2, angles: {} });
  const still = float(0);
  return {
    parts: [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes }],
    hipHeight: 40 / FLOAT_SCALE,
    referenceRadius: HEROINE.referenceRadius,
    poses: { ready: float, run: float, attackWindup: still, attackStrike: still, castWindup: still, castRelease: still, hit: still, dead: still },
  };
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
const world = new ThreeWorld(canvas, gl, new IsoProjection());
const FLOOR = 0x4a4038;
const SIZE = 40;
world.setMap([], 1, [], { style: 'rubble', accent: 0, glow: 0 }, [0, 0, SIZE, 0, SIZE, SIZE, FLOOR, 0, 0, SIZE, SIZE, 0, SIZE, FLOOR]);
/** 女主角在右、展示品在左（畫面左邊 = World 的 -x、+y） */
const heroAt = vec2(SIZE / 2 + 0.9, SIZE / 2 - 0.9);
const showAt = vec2(SIZE / 2 - 0.9, SIZE / 2 + 0.9);
const center = vec2(SIZE / 2, SIZE / 2);
const scale = figureScale(HEROINE, 0.3);

const hero = new PolyFigure(HEROINE, scale);
const heroSink = world.createFigure(true);
hero.sink = heroSink;
const showSink = world.createFigure(true);
let show = new PolyFigure(HEROINE, scale);
/** 防具展示用的女主角放大一點 */
const MANNEQUIN_SCALE = 1.35;

function apply_(): void {
  hero.setWeapon(mountFor(weaponLook(state.weapon)));
  const outfit: Outfit = {};
  for (const slot of ARMORS) if (cfgs.get(slot)!.on && (slot !== 'shield' || canShield())) (outfit as Record<ArmorSlot, unknown>)[slot] = armorFor(slot);
  const shieldBuild = state.src === 'base' ? blenderShield : undefined;
  hero.setOutfit(heroineOutfit(outfit, shieldBuild));
  if (isWeapon(state.kind)) show = new PolyFigure(floatingModel(weaponLook(state.kind)), scale * FLOAT_SCALE);
  else {
    show = new PolyFigure(HEROINE, scale * MANNEQUIN_SCALE);
    // 盾牌拿在左手，右手空著；其他防具兩手都空著
    show.setWeapon(null);
    show.setOutfit(heroineOutfit({ [state.kind]: armorFor(state.kind) } as Outfit, shieldBuild));
  }
  show.sink = showSink;
  const c = cfg();
  const q = new URLSearchParams({ kind: state.kind, tier: String(c.tier), src: state.src, zoom: String(Math.round(state.zoom * 10) / 10) });
  if (state.cam !== 'all') q.set('cam', state.cam);
  if (c.rarity !== 'normal') q.set('rarity', c.rarity);
  if (c.themes.length) q.set('themes', c.themes.join(','));
  if (c.unique) q.set('unique', c.unique);
  history.replaceState(null, '', `?${q}`);
}

// ── 介面 ──
const DIRS: { label: string; facing: Vec2 }[] = [
  { label: '下', facing: vec2(1, 1) },
  { label: '右下', facing: vec2(1, 0) },
  { label: '右', facing: vec2(1, -1) },
  { label: '右上', facing: vec2(0, -1) },
  { label: '上', facing: vec2(-1, -1) },
  { label: '左上', facing: vec2(-1, 0) },
  { label: '左', facing: vec2(-1, 1) },
  { label: '左下', facing: vec2(0, 1) },
];
const WINDUP = 0.45;
const actions: { label: string; run: () => void }[] = [
  ...(['slash', 'thrust', 'overhead'] as AttackVariant[]).map((v) => ({ label: { slash: '橫斬', thrust: '突刺', overhead: '上劈' }[v as 'slash'], run: () => hero.act('attack', WINDUP, v) })),
  { label: '受傷', run: () => hero.hit() },
];
const bar = document.getElementById('bar')!;
const status = document.getElementById('status')!;
const list = document.getElementById('list')!;
const toggles: (() => void)[] = [];
const refresh = () => {
  for (const t of toggles) t();
  const c = cfg();
  const what = c.unique ? `${names.get(c.unique) ?? c.unique}（${c.unique.startsWith('mythic') ? '紅' : '橘'}）` : `T${c.tier}・${RARITY_LIST.find(([r]) => r === c.rarity)![1]}${c.themes.length ? `・${c.themes.map((t) => THEME_LIST.find(([id]) => id === t)![1].replace('（變形）', '')).join('＋')}` : ''}`;
  const base = isWeapon(state.kind) && !c.unique ? (state.src === 'game' ? '現在遊戲的' : state.kind === 'axe' ? 'TRELLIS 底稿改' : 'Blender 底稿改') : state.kind === 'shield' && state.src === 'base' && !c.unique ? 'Blender 底稿改' : state.src === 'base' ? '還沒有底稿，顯示現在遊戲的' : '現在遊戲的';
  const note = c.themes.length && c.rarity === 'normal' && !c.unique ? '　※ 白裝不套詞綴主題，請選藍以上' : '';
  status.textContent = `${KIND_NAME[state.kind]} ${what}（${base}）${note}　左邊${isWeapon(state.kind) ? `懸空的放大 ${FLOAT_SCALE} 倍` : '只穿這一件'}　滑鼠滾輪縮放、← → 轉身`;
  for (const el of list.querySelectorAll<HTMLElement>('[data-id]')) el.classList.toggle('on', cfgs.get(el.dataset.kind as Kind)!.unique === el.dataset.id && state.kind === el.dataset.kind);
};
const group = (title: string, parent: HTMLElement = bar) => {
  const g = document.createElement('div');
  g.className = 'group';
  const t = document.createElement('span');
  t.textContent = title;
  g.append(t);
  parent.append(g);
  return g;
};
const button = (g: HTMLElement, label: string, onClick: () => void, isOn?: () => boolean, tip?: string) => {
  const b = document.createElement('button');
  b.textContent = label;
  if (tip) b.title = tip;
  b.onclick = () => {
    onClick();
    refresh();
  };
  if (isOn) toggles.push(() => b.classList.toggle('on', isOn()));
  g.append(b);
  return b;
};
const row = () => {
  const r = document.createElement('div');
  r.className = 'row';
  bar.append(r);
  return r;
};

const r1 = row();
const title = document.createElement('b');
title.textContent = '裝備預覽';
r1.append(title);
const gKind = group('種類', r1);
const selectKind = (k: Kind) => {
  state.kind = k;
  if (isWeapon(k)) state.weapon = k;
  cfgs.get(k)!.on = true;
};
for (const k of Object.keys(KIND_NAME) as Kind[]) button(gKind, KIND_NAME[k], () => (selectKind(k), apply_()), () => state.kind === k);
const gTier = group('階級', r1);
for (let t = 1; t <= 8; t++) button(gTier, `T${t}`, () => ((cfg().tier = t), (cfg().unique = null), apply_()), () => !cfg().unique && cfg().tier === t);
const gSrc = group('版本', r1);
button(gSrc, '底稿改', () => ((state.src = 'base'), apply_()), () => state.src === 'base', '劍、弓、杖、盾：Blender 底稿；斧：TRELLIS 底稿；頭盔、盔甲、手套、鞋子還沒有底稿');
button(gSrc, '現在遊戲的', () => ((state.src = 'game'), apply_()), () => state.src === 'game');

const r2 = row();
const gRar = group('稀有度', r2);
for (const [r, label, color] of RARITY_LIST) {
  const b = button(gRar, label, () => ((cfg().rarity = r), (cfg().unique = null), apply_()), () => !cfg().unique && cfg().rarity === r);
  b.style.color = color;
}
const gTheme = group('詞綴主題（最多 2 個，先選的是主色）', r2);
for (const [th, label, stats] of THEME_LIST) {
  button(
    gTheme,
    label,
    () => {
      const c = cfg();
      c.unique = null;
      if (c.themes.includes(th)) c.themes = c.themes.filter((x) => x !== th);
      else c.themes = [...c.themes, th].slice(-2);
      // 白裝不套主題：選了主題就自動升到黃
      if (c.themes.length && c.rarity === 'normal') c.rarity = 'rare';
      apply_();
    },
    () => !cfg().unique && cfg().themes.includes(th),
    `會出現這個外觀的詞綴：${stats}`,
  );
}
button(gTheme, '清除', () => ((cfg().themes = []), apply_()));
const gWorn = group('右邊穿著', r2);
for (const k of ARMORS) button(gWorn, KIND_NAME[k], () => ((cfgs.get(k)!.on = !cfgs.get(k)!.on), apply_()), () => cfgs.get(k)!.on, k === 'shield' ? '拿弓、杖時不會拿盾' : undefined);

const r3 = row();
const gMove = group('移動', r3);
for (const [m, label] of [['idle', '待機'], ['walk', '走路'], ['run', '跑步']] as const) button(gMove, label, () => (state.move = m), () => state.move === m);
const gAct = group('揮擊', r3);
for (const a of actions) button(gAct, a.label, () => ((state.loop = null), a.run()));
button(gAct, '輪流連續', () => {
  let i = 0;
  state.loop = state.loop ? null : () => actions[i++ % 3]!.run();
}, () => state.loop !== null);
const gDir = group('方向', r3);
DIRS.forEach((d, i) => button(gDir, d.label, () => (state.dir = i), () => state.dir === i));
const gSpin = group('展示品', r3);
button(gSpin, '自動旋轉', () => (state.spin = !state.spin), () => state.spin);
const gCam = group('鏡頭', r3);
for (const [c, label, z] of [['all', '全身', 4], ['upper', '左邊上半身', 9], ['head', '左邊頭部', 16]] as const) button(gCam, label, () => ((state.cam = c), (state.zoom = z), apply_()), () => state.cam === c);
const gSpeed = group('速度', r3);
for (const s of [0.25, 0.5, 1]) button(gSpeed, `×${s}`, () => (state.speed = s), () => state.speed === s);

// ── 橘 / 紅清單（依種類分組；戒指、護身符沒有外觀，只列出名稱） ──
{
  const withLook = new Set([...UNIQUE_WEAPON_IDS, ...UNIQUE_ARMOR_IDS]);
  const kinds: [string, string][] = [...(Object.entries(KIND_NAME) as [string, string][]), ['ring', '戒指'], ['amulet', '護身符']];
  const head = document.createElement('h3');
  head.textContent = `橘 / 紅裝備（${legendaries.filter((d) => d.rarity === 'legendary').length} 橘、${legendaries.filter((d) => d.rarity === 'mythic').length} 紅）`;
  list.append(head);
  for (const [kind, kname] of kinds) {
    const items = legendaries.filter((d) => d.kind === kind).sort((a, b) => (a.rarity === b.rarity ? 0 : a.rarity === 'legendary' ? -1 : 1));
    if (!items.length) continue;
    const h = document.createElement('h4');
    h.textContent = `${kname}（${items.length}）`;
    list.append(h);
    for (const d of items) {
      const el = document.createElement('div');
      el.className = `item ${d.rarity}`;
      el.textContent = d.name;
      el.title = `${d.id}${d.role ? `\n${d.role}` : ''}${d.lore ? `\n${d.lore}` : ''}`;
      const has = kind in KIND_NAME && withLook.has(d.id);
      if (!has) {
        el.classList.add('none');
        el.title += '\n（沒有外觀）';
      } else {
        el.dataset.id = d.id;
        el.dataset.kind = kind;
        el.onclick = () => {
          selectKind(kind as Kind);
          cfgs.get(kind as Kind)!.unique = d.id;
          apply_();
          refresh();
        };
      }
      list.append(el);
    }
  }
}

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') state.dir = (state.dir + 7) % 8;
  else if (e.key === 'ArrowRight') state.dir = (state.dir + 1) % 8;
  else return;
  refresh();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.zoom = Math.min(16, Math.max(0.5, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
}, { passive: false });

function resize(): void {
  const top = bar.getBoundingClientRect().height;
  const right = list.getBoundingClientRect().width;
  list.style.top = `${top}px`;
  canvas.style.top = `${top}px`;
  canvas.style.width = `${innerWidth - right}px`;
  canvas.style.height = `${innerHeight - top}px`;
  canvas.width = Math.round((innerWidth - right) * devicePixelRatio);
  canvas.height = Math.round((innerHeight - top) * devicePixelRatio);
}
addEventListener('resize', resize);
resize();
apply_();
refresh();

let last = performance.now();
let spinAngle = 0;
let loopTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * state.speed;
  last = now;
  if (state.spin) spinAngle += dt * 0.8;
  if (state.loop) {
    loopTimer -= dt;
    if (loopTimer <= 0) {
      state.loop();
      loopTimer = 1.4;
    }
  }
  const facing = DIRS[state.dir]!.facing;
  const s: FigureState = { facing, moving: state.move !== 'idle', alive: true, speed: state.move === 'walk' ? 2 : 6 };
  hero.update(dt, s);
  show.update(dt, { facing: state.spin ? vec2(Math.cos(spinAngle), Math.sin(spinAngle)) : facing, moving: false, alive: true, speed: 0 });
  heroSink.place(heroAt, vec2(0, 0), 0, 0xffffff, 1, true);
  showSink.place(showAt, vec2(0, 0), 0, 0xffffff, 1, true);
  // 鏡頭對著角色的腰（地面中心往畫面上方移一點）
  // 鏡頭往畫面上方移 = 地面往 (-x, -y) 方向；展示品的女主角放大了 MANNEQUIN_SCALE 倍
  const focus = state.cam === 'all' ? vec2(center.x - 0.45, center.y - 0.45) : vec2(showAt.x - (state.cam === 'head' ? 2.05 : 1.3), showAt.y - (state.cam === 'head' ? 2.05 : 1.3));
  world.renderFloor(focus, canvas.width, canvas.height, state.zoom * devicePixelRatio, vec2(center.x + 2, center.y + 2), 14, 0x0d0b09, dt);
  world.renderObjects();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
