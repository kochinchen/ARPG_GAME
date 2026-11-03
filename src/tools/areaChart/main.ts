import { gameData } from '../../data';
import { DataRegistry } from '../../data/DataRegistry';
import { buildAreaTable, currentRadius, judgeArea, oldRadius, type AreaShape, type AreaSkill } from '../bossSim/AreaTable';

/**
 * 開發用：敵方範圍圖（http://localhost:5173/area-chart.html，npm run package:sim 產生單一 HTML）。
 * 不必開打：選招式與樓層，照遊戲的等角比例畫出範圍，主角當比例尺、框出預設縮放時 1080p 畫面的大小。
 */

const data = DataRegistry.load(gameData);
const skills = buildAreaTable(data, true);
const FLOORS = [1, 5, 10, 15, 20, 25, 30, 35];
const LAST_FLOOR = data.balance.endgame.lastFloor;

/** 和遊戲相同的等角投影（1 格 = 寬 64、高 32 px） */
const sx = (x: number, y: number) => (x - y) * 32;
const sy = (x: number, y: number) => (x + y) * 16;
const SCREEN = { w: 1920, h: 1080 };
const VIEW = 'viewBox="-1080 -600 2160 1200"';
const NEW_COLOR = '#ff3a30';
const ZONE_COLOR = '#b45cff';
const OLD_COLOR = '#ffd040';
/** 主角站在施放者面前幾格（往畫面右下） */
const HERO_GAP = 2;
const HERO_HEIGHT = 58;

const fmt = (n: number) => n.toFixed(1);

/** 圓或扇形（World 座標）的畫面多邊形；扇形朝主角 */
function outline(cx: number, cy: number, radius: number, angleDeg: number, offsetDeg = 0): string {
  const full = angleDeg >= 360;
  const span = (Math.min(angleDeg, 360) * Math.PI) / 180;
  const base = (offsetDeg * Math.PI) / 180;
  const points: string[] = full ? [] : [`${sx(cx, cy)},${sy(cx, cy)}`];
  const segments = 72;
  for (let i = 0; i <= segments; i++) {
    const a = full ? (i / segments) * Math.PI * 2 : base - span / 2 + (span * i) / segments;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    points.push(`${sx(x, y).toFixed(1)},${sy(x, y).toFixed(1)}`);
  }
  return points.join(' ');
}

/** 固定的亂數：同一招每次畫出來的落點一樣 */
const seeded = (seed: number) => {
  const v = Math.sin(seed * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

function ground(): string {
  const lines: string[] = [];
  for (let i = -40; i <= 40; i += 5) {
    lines.push(`<line x1="${sx(i, -40)}" y1="${sy(i, -40)}" x2="${sx(i, 40)}" y2="${sy(i, 40)}"/>`);
    lines.push(`<line x1="${sx(-40, i)}" y1="${sy(-40, i)}" x2="${sx(40, i)}" y2="${sy(40, i)}"/>`);
  }
  return `<g stroke="#2c251e" stroke-width="1.5">${lines.join('')}</g>`;
}

function hero(): string {
  const x = sx(HERO_GAP, 0);
  const y = sy(HERO_GAP, 0);
  return `<g><ellipse cx="${x}" cy="${y}" rx="16" ry="8" fill="#000" opacity=".5"/><path d="M${x - 9} ${y} L${x - 11} ${y - HERO_HEIGHT * 0.62} L${x + 11} ${y - HERO_HEIGHT * 0.62} L${x + 9} ${y} Z" fill="#7ec8ff"/><circle cx="${x}" cy="${y - HERO_HEIGHT * 0.8}" r="10" fill="#d6ecff"/></g>`;
}

function caster(): string {
  return '<g><ellipse cx="0" cy="0" rx="26" ry="13" fill="#000" opacity=".5"/><path d="M-18 0 L-14 -66 L14 -66 L18 0 Z" fill="#6b5a48"/><circle cx="0" cy="-78" r="13" fill="#8b7660"/></g>';
}

/** 長條（World 座標）的畫面多邊形：從施放者腳下朝主角延伸 */
function strip(line: NonNullable<AreaShape['line']>): string {
  const a = (line.offsetDeg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const [nx, ny] = [-dy * (line.width / 2), dx * (line.width / 2)];
  const corners: [number, number][] = [[nx, ny], [nx + dx * line.length, ny + dy * line.length], [-nx + dx * line.length, -ny + dy * line.length], [-nx, -ny]];
  return corners.map(([x, y]) => `${sx(x, y).toFixed(1)},${sy(x, y).toFixed(1)}`).join(' ');
}

function shapeSvg(skill: AreaSkill, shape: AreaShape, floor: number, index: number, thick: number): string {
  if (shape.line) return `<polygon points="${strip(shape.line)}" fill="${NEW_COLOR}" fill-opacity=".2" stroke="${NEW_COLOR}" stroke-width="${thick}"/>`;
  const radius = currentRadius(skill, shape, floor, data);
  const color = shape.kind === 'zone' ? ZONE_COLOR : NEW_COLOR;
  if (shape.scatter > 0 && shape.repeat > 1) {
    const spots: string[] = [];
    for (let i = 0; i < shape.repeat; i++) {
      const angle = seeded(i * 2 + 1 + index * 31) * Math.PI * 2;
      const distance = Math.sqrt(seeded(i * 2 + 2 + index * 31)) * shape.scatter;
      spots.push(`<polygon points="${outline(HERO_GAP + Math.cos(angle) * distance, Math.sin(angle) * distance, radius, 360)}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="${thick * 0.5}"/>`);
    }
    return `<polygon points="${outline(HERO_GAP, 0, shape.scatter, 360)}" fill="none" stroke="#c8c0b0" stroke-width="${thick * 0.6}" stroke-dasharray="${thick * 3} ${thick * 2}"/>${spots.join('')}`;
  }
  return `<polygon points="${outline(0, 0, radius, shape.angleDeg)}" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="${thick}"/>`;
}

function drawing(skill: AreaSkill, floor: number, thick: number, showScreen: boolean): string {
  const biggest = skill.shapes.reduce((a, b) => (b.radius > a.radius ? b : a));
  const old = oldRadius(biggest.radius, floor, data);
  const scattered = biggest.scatter > 0 && biggest.repeat > 1;
  const oldRing = scattered || !skill.scales || !skill.boss ? '' : `<polygon points="${outline(0, 0, old, biggest.angleDeg)}" fill="none" stroke="${OLD_COLOR}" stroke-width="${thick * 0.7}" stroke-dasharray="${thick * 3} ${thick * 2}"/>`;
  const frame = showScreen ? `<rect x="${-SCREEN.w / 2}" y="${-SCREEN.h / 2}" width="${SCREEN.w}" height="${SCREEN.h}" fill="none" stroke="#6f8fa8" stroke-width="3" stroke-dasharray="14 10"/><text x="${-SCREEN.w / 2 + 14}" y="${-SCREEN.h / 2 + 36}" fill="#8fb0c8" font-size="30">1080p 畫面（預設縮放）</text>` : '';
  return `<svg ${VIEW} role="img" aria-label="${skill.name} 第 ${floor} 層的範圍">${ground()}${oldRing}${skill.shapes.map((s, i) => shapeSvg(skill, s, floor, i, thick)).join('')}${caster()}${hero()}${frame}</svg>`;
}

const app = document.getElementById('app')!;
const groups: [string, AreaSkill[]][] = [
  ['魔王', skills.filter((s) => s.scales && s.boss)],
  ['一般怪物', skills.filter((s) => s.scales && !s.boss && !s.mimic)],
  ['學主角技能的怪物', skills.filter((s) => s.scales && s.mimic)],
  ['不隨樓層放大（長條、固定範圍）', skills.filter((s) => !s.scales)],
];
const label = (s: AreaSkill) => `${s.name}（${s.users[0]}）`;
app.innerHTML = `
  <h1>敵方範圍圖</h1>
  <div class="sub">長條招式（例如深淵統御者的盾牌衝撞）在「不隨樓層放大」那一組。照遊戲的等角比例畫：地上每一格線 = 5 格。藍色小人是主角，棕色是施放者（固定大小，只當位置參考）。</div>
  <div class="row">
    <label>招式 <select id="skill">${groups.map(([name, list]) => `<optgroup label="${name}">${list.map((s) => `<option value="${s.id}">${label(s)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label>樓層 <input id="floor" type="range" min="1" max="${LAST_FLOOR}" value="30"> <b id="floorText"></b></label>
    <span id="floorButtons">${FLOORS.map((f) => `<button data-floor="${f}">${f}F</button>`).join(' ')}</span>
  </div>
  <div class="sub">
    <span class="key" style="background:${NEW_COLOR}"></span>目前的範圍
    <span class="key" style="background:${ZONE_COLOR}"></span>地面持續區域
    <span class="key" style="background:${OLD_COLOR}"></span>魔王改動前（虛線；一般怪沒改）
    <span class="key" style="background:#c8c0b0"></span>落點散布（散落招式畫出每一發）
  </div>
  <div id="facts" class="facts"></div>
  <div id="big"></div>
  <h2>這一招每 5 層的變化 <small>比例相同，可以直接比較</small></h2>
  <div id="strip" class="strip"></div>
  <h2>所有招式 <small id="galleryNote"></small></h2>
  <div id="gallery" class="gallery"></div>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const skillSelect = el<HTMLSelectElement>('skill');
const floorInput = el<HTMLInputElement>('floor');
skillSelect.value = new URLSearchParams(location.search).get('skill') ?? 'enemy.lord_domain';

/** 圓：半徑；長條：長 × 寬 */
function sizeText(skill: AreaSkill, shape: AreaShape, floor: number): string {
  return shape.line ? `${shape.line.length} × ${shape.line.width} 格` : `${fmt(currentRadius(skill, shape, floor, data))} 格`;
}

const extent = (s: AreaSkill) => Math.max(...s.shapes.map((shape) => shape.radius));

function picked(): AreaSkill {
  return skills.find((s) => s.id === skillSelect.value) ?? skills[0]!;
}

function render(): void {
  const skill = picked();
  const floor = Number(floorInput.value);
  const biggest = skill.shapes.reduce((a, b) => (b.radius > a.radius ? b : a));
  const radius = currentRadius(skill, biggest, floor, data);
  const verdict = judgeArea(biggest, radius, skill.windup);
  el('floorText').textContent = `${floor}F`;
  for (const b of el('floorButtons').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', Number(b.dataset.floor) === floor);
  const scatter = biggest.scatter > 0 && biggest.repeat > 1;
  const size = biggest.line
    ? [['長 × 寬', `${biggest.line.length} × ${biggest.line.width} 格`], ['往旁邊閃出去', `${fmt(biggest.line.width / 2 / 4)} 秒`]]
    : [
        ['半徑', `${fmt(radius)} 格`],
        ...(skill.scales && skill.boss ? [['改動前', `${fmt(oldRadius(biggest.radius, floor, data))} 格`]] : []),
        ['直徑佔畫面寬', `${Math.round(((radius * 2 * 45.25) / SCREEN.w) * 100)}%`],
        ['從中心走出去', `${fmt(radius / 4)} 秒`],
      ];
  el('facts').innerHTML = [
    ...size,
    ...(skill.scales ? [] : [['隨樓層放大', '不會']]),
    ['前搖', `${(skill.windup + biggest.delay).toFixed(2)} 秒`],
    ...(scatter ? [['每個位置平均被打中', `${(biggest.repeat * (radius / biggest.scatter) ** 2).toFixed(1)} 次`]] : []),
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')
    + `<div>判定<b class="${verdict === 'ok' ? '' : 'bad'}">${verdict === 'ok' ? '躲得掉' : verdict === 'blanket' ? '落點鋪滿' : '來不及跑'}</b></div>`
    + `<div>出現在<b style="font-size:13px">${skill.floors.includes(floor) ? '' : '<span class="bad">這層不會出現</span>・'}${skill.floors[0]}～${skill.floors[skill.floors.length - 1]} 層</b></div>`;
  el('big').innerHTML = drawing(skill, floor, 4, true);
  el('strip').innerHTML = FLOORS.map((f) => `<div>${drawing(skill, f, 9, false)}<div class="cap">${f}F・${sizeText(skill, biggest, f)}${skill.floors.includes(f) ? '' : '（不出現）'}</div></div>`).join('');
  el('galleryNote').textContent = `第 ${floor} 層；點一張就放大看`;
  el('gallery').innerHTML = [...skills]
    .sort((a, b) => Number(b.scales) - Number(a.scales) || extent(b) - extent(a))
    .map((s) => {
      const main = s.shapes.reduce((a, b) => (b.radius > a.radius ? b : a));
      return `<button class="card ${s.id === skill.id ? 'on' : ''}" data-id="${s.id}">${drawing(s, floor, 9, false)}<span>${s.name}・${sizeText(s, main, floor)}</span><span class="sub">${s.users[0]}${s.floors.includes(floor) ? '' : '・這層不出現'}</span></button>`;
    })
    .join('');
}

skillSelect.addEventListener('change', render);
floorInput.addEventListener('input', render);
el('floorButtons').addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-floor]');
  if (!button) return;
  floorInput.value = button.dataset.floor!;
  render();
});
el('gallery').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (!card) return;
  skillSelect.value = card.dataset.id!;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
render();
