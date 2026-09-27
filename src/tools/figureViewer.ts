/**
 * 開發用：角色樣態預覽（http://localhost:5173/viewer.html）。
 * 八個方向 × 各種樣態：待機與跑步即時播放；攻擊、施法、受傷、倒地顯示關鍵姿勢。繪製方式與遊戲內相同。
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { HEROINE } from '../render/figure/Heroine';
import type { FigureModel, Pose } from '../render/figure/FigureModel';
import { CREATURE_MODELS } from '../render/figure/Creatures';
import { MERCHANT } from '../render/figure/Merchant';
import { MONSTER_MODELS } from '../render/figure/Monsters';
import { PolyFigure } from '../render/figure/PolyFigure';

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

type Row = { label: string; moving?: boolean; pose?: Pose };

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
  ...Object.entries({
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
  }).map(([key, label]) => {
    const model = CREATURE_MODELS[`enemy.${key}`]!;
    return { key, label, model, radius: model.referenceRadius };
  }),
];
const params = new URLSearchParams(location.search);
const selected = MODELS.find((m) => m.key === params.get('model')) ?? MODELS[0]!;
/** ?zoom=3：放大檢查細節（格子超出畫面時可捲動） */
const USER_ZOOM = Math.max(1, Number(params.get('zoom')) || 1);

const P = selected.model.poses;
const ROWS: Row[] = [
  { label: selected.key === 'heroine' ? '待機\n（戒備姿勢）' : '待機' },
  { label: '跑步', moving: true },
  { label: '攻擊・引拍', pose: P.attackWindup },
  { label: '攻擊・揮出', pose: P.attackStrike },
  { label: '施法・蓄力', pose: P.castWindup },
  { label: '施法・放出', pose: P.castRelease },
  { label: '受傷', pose: P.hit },
  { label: '倒地', pose: P.dead },
];

const CELL_W = Math.min(128, Math.floor((window.innerWidth - 32 - 116) / 8)) * USER_ZOOM;
const CELL_H = Math.min(124, Math.floor((window.innerHeight - 80) / 8)) * USER_ZOOM;
const LABEL_W = 116;
const HEADER_H = 40;
const ZOOM = Math.min(1.45 * USER_ZOOM, CELL_H / 88) * (0.3 / selected.radius) ** 0.5;

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
  const creatures = bosses ? [MODELS[0]!, ...MODELS.filter((m) => m.boss)] : MODELS.filter((m) => CREATURE_MODELS[`enemy.${m.key}`]);
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

async function main(): Promise<void> {
  modelNav();
  const host = document.getElementById('viewer')!;
  const app = new Application();
  await app.init({ resizeTo: host, background: 0x16130f, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  host.appendChild(app.canvas);
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

  const cells: { figure: PolyFigure; row: Row; facing: Vec2 }[] = [];
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
      const ground = new Graphics()
        .poly([-40, 0, 0, -20, 40, 0, 0, 20])
        .fill({ color: 0x2a241e })
        .ellipse(0, 0, 13, 6.5)
        .fill({ color: 0x000000, alpha: 0.4 });
      const figure = new PolyFigure(selected.model, selected.radius / selected.model.referenceRadius);
      figure.graphics.scale.set(ZOOM);
      cell.addChild(ground, figure.graphics);
      root.addChild(cell);
      cells.push({ figure, row, facing: d.facing });
    });
  });

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    for (const cell of cells) {
      // 關鍵姿勢直接畫出；待機與跑步即時播放
      if (cell.row.pose) cell.figure.showPose(cell.row.pose, cell.facing);
      else cell.figure.update(dt, { facing: cell.facing, moving: cell.row.moving ?? false, alive: true });
    }
  });
}

void main();
