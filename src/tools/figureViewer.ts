/**
 * 開發用：角色樣態預覽（http://localhost:5173/viewer.html）。
 * 八個方向 × 各種樣態：待機與跑步即時播放；攻擊、施法、受傷、倒地顯示關鍵姿勢。繪製方式與遊戲內相同。
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { vec2, type Vec2 } from '../core/math/Vec2';
import { HEROINE } from '../render/figure/Heroine';
import type { Pose } from '../render/figure/FigureModel';
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

const P = HEROINE.poses;
const ROWS: Row[] = [
  { label: '待機\n（接發球站姿）' },
  { label: '跑步', moving: true },
  { label: '攻擊・引拍', pose: P.attackWindup },
  { label: '攻擊・揮出', pose: P.attackStrike },
  { label: '施法・蓄力', pose: P.castWindup },
  { label: '施法・放出', pose: P.castRelease },
  { label: '受傷', pose: P.hit },
  { label: '倒地', pose: P.dead },
];

const CELL_W = Math.min(128, Math.floor((window.innerWidth - 32 - 116) / 8));
const CELL_H = Math.min(124, Math.floor((window.innerHeight - 80) / 8));
const LABEL_W = 116;
const HEADER_H = 40;
const ZOOM = Math.min(1.45, CELL_H / 88);

async function main(): Promise<void> {
  const host = document.getElementById('viewer')!;
  const app = new Application();
  await app.init({ resizeTo: host, background: 0x16130f, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  host.appendChild(app.canvas);

  const root = new Container();
  root.position.set(16, 16);
  app.stage.addChild(root);
  const text = (s: string, size = 14, color = 0xd8cbb4) =>
    new Text({ text: s, style: { fontFamily: 'sans-serif', fontSize: size, fill: color, align: 'center', lineHeight: size * 1.35 } });

  const title = text('女主角 · 多面體樣態預覽（八方向）', 18, 0xe8c47a);
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
      const figure = new PolyFigure(HEROINE);
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
