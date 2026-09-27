/**
 * 開發用：角色樣態預覽（http://localhost:5173/viewer.html）。
 * 八個方向 × 各種樣態：待機與跑步即時播放；攻擊、施法、受傷、倒地顯示關鍵姿勢。繪製方式與遊戲內相同。
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { HEROINE } from '../render/figure/Heroine';
import type { AttackVariant, FigureModel, Pose } from '../render/figure/FigureModel';
import { MERCHANT } from '../render/figure/Merchant';
import { MONSTER_MODELS } from '../render/figure/Monsters';
import { PolyFigure } from '../render/figure/PolyFigure';
import { GearAuraView } from '../render/views/GearAuraView';
import { EffectLayer } from '../render/views/EffectLayer';
import type { ImpactKind } from '../render/views/fx/ImpactFx';
import { IsoProjection } from '../core/math/IsoProjection';
import { WeaponGlowView } from '../render/views/WeaponGlowView';
import { lookByKey, mountFor, tierLook, UNIQUE_WEAPON_IDS, uniqueLook, type WeaponLook } from '../render/figure/weapons/WeaponLooks';
import type { WeaponType } from '../data/schema/item';
import { RARITIES, type Rarity } from '../data/schema/item';

/** 畫面上的八個方向（欄）與對應的 World 面向 */
const DIRECTIONS: { label: string; facing: Vec2 }[] = [
  { label: '下', facing: vec2(1, 1) },
  { label: '右下', facing: vec2(1, 0) },
  { label: '右', facing: vec2(1, -1) },
  { label: '右上', facing: vec2(0, -1) },
  { label: '上', facing: vec2(-1, -1) },
  { label: '左上', facing: vec2(-1, 0) },
  { label: '左', facing: vec2(-1, 1) },
  { label: '左下', facing: vec2(0, 1) },
];

type Row = { label: string; moving?: boolean; speed?: number; pose?: Pose; play?: AttackVariant | 'hit' | 'death' };

/** 非人形怪物（10 樓以上）的名稱 */
const CREATURE_LABELS: Record<string, string> = {
  bone_hound: '骨刺獵獸',
  blood_lizard: '血鱗獵蜥',
  shadow_panther: '暗影獵豹',
  acid_beetle: '酸液甲蟲',
  hatchling_spider: '孵化蜘蛛',
  hook_claw: '鉤爪蟲',
  horned_brute: '角甲巨獸',
  molten_brute: '熔顎巨獸',
  quake_beast: '震地獸',
  poison_spitter: '毒沫噴吐者',
  frost_sporeling: '寒霜孢子體',
  fire_crawler: '火囊爬行者',
  eye_floater: '單眼浮體',
  brain_floater: '腦海浮體',
  void_spore: '虛空孢子',
  egg_matron: '卵囊母體',
  soul_flower: '奪魂寄生花',
  burrower: '鑽地寄生蟲',
};
const CREATURE_KEYS = new Set(Object.keys(CREATURE_LABELS));

/** 可以預覽的模型（?model=）：radius 為遊戲中的碰撞半徑（決定大小） */
const MODELS: { key: string; label: string; model: FigureModel; radius: number; boss?: boolean }[] = [
  { key: 'heroine', label: '女主角', model: HEROINE, radius: 0.3 },
  { key: 'skeleton', label: '骷髏戰士', model: MONSTER_MODELS['enemy.skeleton']!, radius: 0.32 },
  { key: 'ghoul', label: '食屍鬼', model: MONSTER_MODELS['enemy.ghoul']!, radius: 0.28 },
  { key: 'archer', label: '骷髏弓手', model: MONSTER_MODELS['enemy.skeleton_archer']!, radius: 0.3 },
  { key: 'armored', label: '重甲骷髏', model: MONSTER_MODELS['enemy.armored_skeleton']!, radius: 0.42 },
  { key: 'mage', label: '骷髏法師', model: MONSTER_MODELS['enemy.skeleton_mage']!, radius: 0.3 },
  { key: 'dummy', label: '訓練木樁', model: MONSTER_MODELS['enemy.training_dummy']!, radius: 0.35 },
  { key: 'merchant', label: '商人', model: MERCHANT, radius: 0.3 },
  // 樓層魔王（遊戲中的大小 = radius × size）與眷屬
  ...(
    [
      ['crypt_guardian', '5F 墓穴守衛', 0.5 * 2.2],
      ['fallen_priest', '10F 墮落神官', 0.5 * 2.2],
      ['cultist', '狂熱信徒', 0.3],
      ['lava_behemoth', '15F 熔岩巨獸', 0.5 * 2.4],
      ['fallen_knight', '20F 墮落騎士', 0.5 * 2.2],
      ['spider_queen', '25F 蜘蛛女王', 0.5 * 2.1],
      ['abyss_lord', '30F 深淵魔王', 0.5 * 2.5],
    ] as const
  ).map(([key, label, radius]) => ({ key, label, model: MONSTER_MODELS[`enemy.${key}`]!, radius, boss: true })),
  // 非人形怪物（10 樓以上）
  ...Object.entries(CREATURE_LABELS).map(([key, label]) => {
    const model = MONSTER_MODELS[`enemy.${key}`]!;
    return { key, label, model, radius: model.referenceRadius };
  }),
];
const params = new URLSearchParams(location.search);
const selected = MODELS.find((m) => m.key === params.get('model')) ?? MODELS[0]!;
/** ?zoom=3：放大檢查細節（格子超出畫面時可捲動） */
const USER_ZOOM = Math.max(1, Number(params.get('zoom')) || 1);
/** ?aura=mythic&level=4：主角加上裝備光芒（檢查各稀有度的光芒效果） */
const AURA = RARITIES.includes(params.get('aura') as Rarity) ? (params.get('aura') as Rarity) : null;
const AURA_LEVEL = Math.min(4, Math.max(1, Number(params.get('level')) || 3));

/** ?weapon=bow:5 / staff:3 / legendary.cold_moon：主角拿指定的武器（檢查弓、法杖的招式） */
const WEAPON = selected.key === 'heroine' && params.get('weapon') ? lookByKey(params.get('weapon')!) : null;
const armed = (figure: PolyFigure): PolyFigure => {
  if (WEAPON) figure.setWeapon(mountFor(WEAPON));
  return figure;
};

const P = selected.model.poses;
const ATTACK_LABELS: Record<AttackVariant, string> = { slash: '橫斬', thrust: '突刺', overhead: '上劈', shoot: '射箭', staff: '法杖施法' };
/** ?anim=slash / thrust / overhead / hit / death：列出該段動作的每個關鍵姿勢 */
const ANIM = params.get('anim');
function animRows(): Row[] | null {
  const variant = ANIM && P.attackVariants?.[ANIM as AttackVariant];
  if (variant) return [...variant.windup, ...variant.strike].map((pose, i) => ({ label: `${ATTACK_LABELS[ANIM as AttackVariant]} ${i + 1}${i < variant.windup.length ? '（前搖）' : '（命中後）'}`, pose }));
  if (ANIM === 'hit' && P.hitKeys) return P.hitKeys.map((pose, i) => ({ label: `受傷 ${i + 1}`, pose }));
  if (ANIM === 'death' && P.deathKeys) return P.deathKeys.map((pose, i) => ({ label: `死亡 ${i + 1}`, pose }));
  return null;
}
const ROWS: Row[] = animRows() ?? [
  { label: selected.key === 'heroine' ? '待機\n（戒備姿勢）' : '待機' },
  ...(P.walk ? [{ label: '走路', moving: true, speed: 1.5 }] : []),
  { label: '跑步', moving: true },
  // 招式：實際播放（每 1.6 秒一次）；多段攻擊：列出每個關鍵姿勢；否則只列引拍與揮出
  ...(P.attackVariants
    ? (Object.keys(P.attackVariants) as AttackVariant[]).map((v) => ({ label: `${ATTACK_LABELS[v]}（播放）`, play: v }))
    : P.attackChain
      ? [...P.attackChain.windup, ...P.attackChain.strike].map((pose, i) => ({ label: `攻擊 ${i + 1}${i < P.attackChain!.windup.length ? '（前搖）' : '（命中後）'}`, pose }))
      : [
          { label: '攻擊・引拍', pose: P.attackWindup },
          { label: '攻擊・揮出', pose: P.attackStrike },
        ]),
  { label: '施法・蓄力', pose: P.castWindup },
  { label: '施法・放出', pose: P.castRelease },
  P.hitKeys ? { label: '受傷（播放）', play: 'hit' } : { label: '受傷', pose: P.hit },
  P.deathKeys ? { label: '死亡（播放）', play: 'death' } : { label: '倒地', pose: P.dead },
];

/** ?debug=joints,bones,edges,pivot,facing,anchor（或 debug=all）：除錯疊圖 */
const DEBUG = params.get('debug');
if (DEBUG) {
  const on = (k: string) => DEBUG === 'all' || DEBUG.split(',').includes(k);
  PolyFigure.debug = { joints: on('joints'), bones: on('bones'), edges: on('edges'), pivot: on('pivot'), facing: on('facing'), anchor: on('anchor') };
}

const CELL_W = Math.min(128, Math.floor((window.innerWidth - 32 - 116) / 8)) * USER_ZOOM;
const CELL_H = Math.min(124, Math.floor((window.innerHeight - 80) / ROWS.length)) * USER_ZOOM;
const LABEL_W = 116;
const HEADER_H = 40;
const ZOOM = Math.min(1.45 * USER_ZOOM, CELL_H / 88) * (0.3 / selected.radius) ** 0.5;

/** 模型有 dynamicShadow 時：影子隨站姿與重心移動 */
function drawShadow(g: Graphics, figure: PolyFigure): void {
  const s = figure.shadow;
  g.clear();
  if (s) g.ellipse(s.x, s.y, s.rx, s.rx / 2).fill({ color: 0x000000, alpha: 0.35 });
}

/** 右上角切換模型的下拉選單 */
function modelNav(): void {
  const select = document.createElement('select');
  select.style.cssText = 'position:fixed;top:10px;right:12px;z-index:1;padding:3px 8px;font:14px sans-serif;color:#d8cbb4;background:#2a231d;border:1px solid #5a4c3e';
  for (const m of MODELS) {
    const option = document.createElement('option');
    option.value = m.key;
    option.textContent = m.label;
    option.selected = m === selected;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    params.set('model', select.value);
    location.search = params.toString();
  });
  document.body.appendChild(select);
}

/**
 * ?model=gallery：所有非人形怪物排在一起；?model=bosses：樓層魔王與主角並排（比較大小）。
 * 右下方向；pose=attack / windup / cast / dead / run 可切換樣態。
 */
function gallery(app: Application, bosses: boolean): void {
  const creatures = bosses ? [MODELS[0]!, ...MODELS.filter((m) => m.boss)] : MODELS.filter((m) => CREATURE_KEYS.has(m.key));
  const poseKey = params.get('pose');
  const cols = bosses ? 4 : 6;
  const w = (window.innerWidth - 32) / cols;
  const h = (window.innerHeight - 40) / Math.ceil(creatures.length / cols);
  const cells: { figure: PolyFigure; pose: Pose | undefined }[] = [];
  creatures.forEach((m, i) => {
    const cell = new Container();
    cell.position.set(16 + (i % cols) * w + w / 2, 30 + Math.floor(i / cols) * h + h - 34);
    const ground = new Graphics().poly([-50, 0, 0, -25, 50, 0, 0, 25]).fill({ color: 0x2a241e });
    const figure = new PolyFigure(m.model, m.radius / m.model.referenceRadius);
    figure.graphics.scale.set((bosses ? Math.min(1.1, h / 150) : Math.min(2.4, h / 80)) * USER_ZOOM);
    const label = new Text({ text: m.label, style: { fontFamily: 'sans-serif', fontSize: 13, fill: 0xd8cbb4 } });
    label.anchor.set(0.5, 0);
    label.position.set(0, 18);
    cell.addChild(ground, figure.graphics, label);
    app.stage.addChild(cell);
    const P = m.model.poses;
    const pose = poseKey === 'attack' ? P.attackStrike : poseKey === 'windup' ? P.attackWindup : poseKey === 'cast' ? P.castWindup : poseKey === 'dead' ? P.dead : undefined;
    cells.push({ figure, pose });
  });
  const facing = vec2(Number(params.get('fx') ?? 1), Number(params.get('fy') ?? 0));
  app.ticker.add((ticker) => {
    for (const c of cells) {
      if (c.pose) c.figure.showPose(c.pose, facing);
      else c.figure.update(ticker.deltaMS / 1000, { facing, moving: poseKey === 'run', alive: true });
    }
  });
}

/**
 * ?model=X&close=1：單一模型的特寫（左 / 下（正面）/ 右 / 上（背面）四個方向，自動放大到填滿格子）。
 * pose=attack / windup / cast / dead 切換樣態，省略為待機動畫。
 */
function closeUp(app: Application): void {
  const dirs: { label: string; facing: Vec2 }[] = [
    { label: '左', facing: vec2(-1, 1) },
    { label: '下（正面）', facing: vec2(1, 1) },
    { label: '右', facing: vec2(1, -1) },
    { label: '上（背面）', facing: vec2(-1, -1) },
  ];
  const w = (window.innerWidth - 32) / dirs.length;
  const h = window.innerHeight - 80;
  const P = selected.model.poses;
  const poseKey = params.get('pose');
  // pose=a1～a6：多段攻擊的第 n 個關鍵姿勢
  const chain = P.attackChain ? [...P.attackChain.windup, ...P.attackChain.strike] : [];
  const chainKey = /^a(\d)$/.exec(poseKey ?? '');
  // pose=slash3 / thrust5 / overhead6 / hit2 / death4：招式、受傷、死亡的第 n 個關鍵姿勢
  const animKey = /^(slash|thrust|overhead|shoot|staff|hit|death)(\d)$/.exec(poseKey ?? '');
  const animKeys = (name: string): Pose[] => {
    const v = P.attackVariants?.[name as AttackVariant];
    if (v) return [...v.windup, ...v.strike];
    return (name === 'hit' ? P.hitKeys : name === 'death' ? P.deathKeys : undefined) ?? [];
  };
  const pose = animKey
    ? (animKeys(animKey[1]!)[Number(animKey[2]) - 1] ?? null)
    : chainKey
    ? (chain[Number(chainKey[1]) - 1] ?? null)
    : poseKey === 'attack' ? P.attackStrike : poseKey === 'windup' ? P.attackWindup : poseKey === 'cast' ? P.castWindup : poseKey === 'hit' ? P.hit : poseKey === 'dead' ? P.dead : null;
  const cells = dirs.map((d, i) => {
    const cell = new Container();
    cell.position.set(16 + i * w + w / 2, 60 + h * 0.78);
    const figure = armed(new PolyFigure(selected.model, 1));
    figure.showPose(P.ready(0), d.facing);
    // 依模型大小自動縮放
    const b = figure.graphics.getLocalBounds();
    const k = Math.min((w * 0.85) / Math.max(1, b.width), (h * 0.7) / Math.max(1, b.height));
    figure.graphics.scale.set(k);
    const shadow = new Graphics();
    shadow.scale.set(k);
    const ground = new Graphics().ellipse(0, 0, w * 0.35, w * 0.12).fill({ color: 0x2a241e });
    const label = new Text({ text: d.label, style: { fontFamily: 'sans-serif', fontSize: 14, fill: 0xd8cbb4 } });
    label.anchor.set(0.5, 0);
    label.position.set(0, -h * 0.72);
    cell.addChild(ground, shadow, figure.graphics, label);
    app.stage.addChild(cell);
    return { figure, facing: d.facing, shadow };
  });
  const title = new Text({ text: `${selected.label} · 特寫`, style: { fontFamily: 'sans-serif', fontSize: 18, fill: 0xe8c47a } });
  title.position.set(16, 12);
  app.stage.addChild(title);
  app.ticker.add((ticker) => {
    for (const c of cells) {
      if (pose) c.figure.showPose(pose, c.facing);
      else c.figure.update(ticker.deltaMS / 1000, { facing: c.facing, moving: poseKey === 'run', alive: true });
      drawShadow(c.shadow, c.figure);
    }
  });
}

/**
 * ?model=weapons：主角拿著每一種武器（8 階基底 × 4 種 + 橘 / 紅專屬造型），含武器微光。
 * set=sword / axe / bow / staff / uniques 只看一組（較大）；rarity=magic… 指定基底的光芒；fx、fy 改面向。
 */
function weaponGallery(app: Application): void {
  const set = params.get('set');
  const rarity = (RARITIES.includes(params.get('rarity') as Rarity) ? params.get('rarity') : 'normal') as Rarity;
  const kinds: WeaponType[] = ['sword', 'axe', 'bow', 'staff'];
  const entries: { label: string; look: WeaponLook; rarity: Rarity }[] = [];
  const TIER_NAMES: Record<WeaponType, string[]> = {
    sword: ['短劍', '鐵製長劍', '騎士長劍', '符文戰劍', '黑鋼重劍', '血紋之刃', '古代王者劍', '深淵裂魂劍'],
    axe: ['手斧', '鐵製戰斧', '月刃斧', '裂骨斧', '黑鋼巨斧', '血紋屠斧', '古代獸牙斧', '深淵噬魂斧'],
    bow: ['短弓', '獵弓', '長弓', '符文戰弓', '複合骨弓', '血紋刺弓', '古代鷹弓', '深淵穿雲弓'],
    staff: ['短杖', '橡木法杖', '水晶杖', '符文杖', '黑鋼骨杖', '血紋元素杖', '古代賢者杖', '深淵虛空杖'],
  };
  for (const kind of kinds) {
    if (set && set !== kind) continue;
    for (let tier = 1; tier <= 8; tier++) entries.push({ label: TIER_NAMES[kind][tier - 1]!, look: tierLook(kind, tier), rarity });
  }
  if (!set || set === 'uniques') {
    for (const id of UNIQUE_WEAPON_IDS) entries.push({ label: id.split('.')[1]!, look: uniqueLook(id)!, rarity: id.startsWith('mythic') ? 'mythic' : 'legendary' });
  }
  const cols = set ? (set === 'uniques' ? 5 : 4) : 10;
  const w = (window.innerWidth - 32) / cols;
  const h = (window.innerHeight - 40) / Math.ceil(entries.length / cols);
  const facing = vec2(Number(params.get('fx') ?? 1), Number(params.get('fy') ?? 0));
  const scale = Math.min(3.2, h / 80) * USER_ZOOM;
  const cells = entries.map((e, i) => {
    const cell = new Container();
    cell.position.set(16 + (i % cols) * w + w / 2, 30 + Math.floor(i / cols) * h + h - 26);
    const holder = new Container();
    holder.scale.set(scale);
    const figure = new PolyFigure(HEROINE, 1);
    figure.setWeapon(mountFor(e.look));
    const glow = new WeaponGlowView();
    glow.set(e.rarity, e.look.glow ?? null);
    holder.addChild(glow.back, figure.graphics, glow.front);
    const ground = new Graphics().ellipse(0, 0, 24 * scale, 11 * scale).fill({ color: 0x2a241e });
    const label = new Text({ text: e.label, style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xd8cbb4 } });
    label.anchor.set(0.5, 0);
    label.position.set(0, 8);
    cell.addChild(ground, holder, label);
    app.stage.addChild(cell);
    return { figure, glow };
  });
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    for (const c of cells) {
      c.figure.update(dt, { facing, moving: params.get('pose') === 'run', alive: true });
      c.glow.update(dt, c.figure.weaponAxis, true);
    }
  });
}

/**
 * ?model=fx：技能特效預覽。上方：各種投射物來回飛行；下方：各種範圍爆發輪流觸發（special=1 看 Combo 特別招的顏色）。
 */
function fxPreview(app: Application): void {
  const projection = new IsoProjection();
  const world = new Container();
  const objects = new Container();
  objects.sortableChildren = true;
  const layer = new EffectLayer(projection, objects);
  world.addChild(layer.ground, objects);
  world.scale.set(USER_ZOOM);
  app.stage.addChild(world);
  const special = params.get('special') === '1';
  const place = () => world.position.set(window.innerWidth / 2 - projection.toScreen(vec2(6, 6)).x * USER_ZOOM, 40);
  place();
  const skills = ['ranged.quick_shot', 'ranged.piercing_shot', 'ranged.backstep_shot', 'ranged.charge_shot', 'ranged.spread_shot', 'ranged.weak_point', 'ranged.pinning_shot', 'ranged.execution_shot', 'ranged.mark_shot', 'magic.fireball', 'magic.ice_orb', 'magic.spark', 'magic.ice_lance', 'enemy.poison_spit', 'enemy.frost_spores'];
  const fake = (id: string, i: number) => ({
    id: i + 1,
    skill: { id, tags: id.startsWith('ranged') ? ['ranged'] : ['spell'] },
    onHit: [],
    mods: { combo: special ? { success: true } : null },
    radius: 0.25,
    position: vec2(0, 0),
    prevPosition: vec2(0, 0),
    direction: vec2(1, -1),
  });
  const projectiles = skills.map(fake);
  const impacts: { kind: ImpactKind; radius: number; big?: boolean; angle?: number }[] = [
    { kind: 'fire', radius: 1 },
    { kind: 'fire', radius: 2.5, big: true },
    { kind: 'frost', radius: 1.8 },
    { kind: 'frost', radius: 4, big: true },
    { kind: 'lightning', radius: 1.2 },
    { kind: 'poison', radius: 1.4 },
    { kind: 'shockwave', radius: 2 },
    { kind: 'shockwave', radius: 3, big: true },
    { kind: 'slash', radius: 1.3, angle: 120 },
    { kind: 'whirl', radius: 1.8 },
    { kind: 'burst', radius: 1 },
    { kind: 'arrowRain', radius: 0.9 },
  ];
  let clock = 0;
  let next = 0;
  let chainAt = 1;
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    clock += dt;
    // 投射物：沿著一排來回飛
    projectiles.forEach((p, i) => {
      const x = 2 + ((clock * 3 + i * 0.7) % 8);
      const pos = vec2(x - 2 + i * 0.55, 2 - (x - 2) + i * 0.55 - 1);
      p.prevPosition = p.position;
      p.position = pos;
    });
    if (clock >= next) {
      next = clock + 2.4;
      impacts.forEach((im, i) => {
        const pos = vec2(6 + (i % 4) * 4.2 - 2, 12 + Math.floor(i / 4) * 4.2 - (i % 4) * 2);
        layer.spawnImpact({ kind: im.kind, position: pos, radius: im.radius, color: { fire: 0xff7a2a, frost: 0x7fd4ff, lightning: 0xf5e663, poison: 0x7ed957 }[im.kind as string] ?? 0xd8cbb4, direction: vec2(1, 0), angleDeg: im.angle ?? 360, big: im.big ?? false, special });
      });
    }
    if (clock >= chainAt) {
      chainAt = clock + 1.2;
      layer.spawnChain([vec2(3, 7), vec2(5, 9), vec2(4, 12), vec2(7, 13)], 0xf5e663, special);
    }
    layer.update(dt, projectiles as never, 1, [], []);
  });
}

async function main(): Promise<void> {
  modelNav();
  const host = document.getElementById('viewer')!;
  const app = new Application();
  await app.init({ resizeTo: host, background: 0x16130f, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  host.appendChild(app.canvas);
  if (params.get('close')) {
    closeUp(app);
    return;
  }
  if (params.get('model') === 'fx') {
    fxPreview(app);
    return;
  }
  if (params.get('model') === 'weapons') {
    weaponGallery(app);
    return;
  }
  if (params.get('model') === 'gallery' || params.get('model') === 'bosses') {
    gallery(app, params.get('model') === 'bosses');
    return;
  }

  const root = new Container();
  root.position.set(16, 16);
  app.stage.addChild(root);
  const text = (s: string, size = 14, color = 0xd8cbb4) =>
    new Text({ text: s, style: { fontFamily: 'sans-serif', fontSize: size, fill: color, align: 'center', lineHeight: size * 1.35 } });

  const title = text(`${selected.label} · 多面體樣態預覽（八方向）`, 18, 0xe8c47a);
  title.position.set(0, -4);
  root.addChild(title);

  DIRECTIONS.forEach((d, i) => {
    const t = text(d.label);
    t.anchor.set(0.5, 0);
    t.position.set(LABEL_W + i * CELL_W + CELL_W / 2, HEADER_H - 12);
    root.addChild(t);
  });

  const cells: { figure: PolyFigure; row: Row; facing: Vec2; aura: GearAuraView | null; shadow: Graphics }[] = [];
  ROWS.forEach((row, r) => {
    const y = HEADER_H + 14 + r * CELL_H;
    const label = text(row.label, 13);
    label.anchor.set(0, 0.5);
    label.position.set(0, y + CELL_H / 2);
    root.addChild(label);
    DIRECTIONS.forEach((d, c) => {
      const x = LABEL_W + c * CELL_W;
      const cell = new Container();
      cell.position.set(x + CELL_W / 2, y + CELL_H - 16);
      // 地面格與影子
      const ground = new Graphics().poly([-40, 0, 0, -20, 40, 0, 0, 20]).fill({ color: 0x2a241e });
      if (!selected.model.dynamicShadow) ground.ellipse(0, 0, 13, 6.5).fill({ color: 0x000000, alpha: 0.4 });
      const figure = armed(new PolyFigure(selected.model, selected.radius / selected.model.referenceRadius));
      // 模型（與光芒）一起縮放
      const holder = new Container();
      holder.scale.set(ZOOM);
      const aura = AURA && selected.key === 'heroine' ? new GearAuraView(58) : null;
      aura?.set(AURA_LEVEL, AURA!);
      const shadow = new Graphics();
      holder.addChild(shadow, ...(aura ? [aura.back] : []), figure.graphics, ...(aura ? [aura.front] : []));
      cell.addChild(ground, holder);
      root.addChild(cell);
      cells.push({ figure, row, facing: d.facing, aura, shadow });
    });
  });

  let clock = 0;
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    const prev = clock;
    clock += dt;
    // 播放列：每 1.6 秒出招 / 受傷一次；死亡列倒地 2.4 秒後站起來
    const tick = Math.floor(clock / 1.6) > Math.floor(prev / 1.6) || prev === 0;
    const alive = clock % 3.2 > 2.4;
    for (const cell of cells) {
      const play = cell.row.play;
      if (tick && play === 'hit') cell.figure.hit();
      else if (tick && play !== undefined && play !== 'hit' && play !== 'death') cell.figure.act('attack', 0.35, play);
      // 關鍵姿勢直接畫出；待機、走路、跑步與播放列即時播放
      if (cell.row.pose) cell.figure.showPose(cell.row.pose, cell.facing);
      else cell.figure.update(dt, { facing: cell.facing, moving: cell.row.moving ?? false, alive: play === 'death' ? alive : true, speed: cell.row.speed ?? 4 });
      cell.aura?.update(dt, cell.figure.weaponTip, true);
      drawShadow(cell.shadow, cell.figure);
    }
  });
}

void main();
