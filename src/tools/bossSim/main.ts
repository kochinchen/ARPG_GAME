import { Application, type WebGLRenderer } from 'pixi.js';
import { CommandQueue } from '../../core/CommandQueue';
import { GameLoop } from '../../core/GameLoop';
import { IsoProjection } from '../../core/math/IsoProjection';
import { normalize, sub } from '../../core/math/Vec2';
import { gameData } from '../../data';
import { DataRegistry } from '../../data/DataRegistry';
import type { Element } from '../../data/schema/common';
import type { EnemyDef } from '../../data/schema/enemy';
import { defenseMitigation } from '../../game/combat/DamagePipeline';
import { STAT_LABELS } from '../../game/items/ItemDescriber';
import type { GameCommand } from '../../game/Commands';
import { InputManager } from '../../input/InputManager';
import { Camera } from '../../render/Camera';
import { Renderer } from '../../render/Renderer';
import { PALETTE } from '../../render/palette';
import type { ThreeWorld } from '../../render/three/ThreeWorld';
import { SimRecorder } from './SimRecorder';
import { createSim, GEAR_LABELS, tickSim, type GearId, type SimConfig } from './SimWorld';
import { buildAreaTable, currentAreaScale, currentRadius, judgeArea, largest, oldRadius, type AreaSkill } from './AreaTable';
import { buildPhaseTable, buildSkillTable, phaseStatIds } from './SkillTable';

/**
 * 開發用：魔王模擬器（http://localhost:5173/boss-sim.html）。
 * 遊戲的世界、AI、傷害流程與畫法，只是場上只有一隻敵人和一個不攻擊、不會倒下的主角。
 * 換設定 = 帶新網址重新載入（世界與紀錄全部重來）。
 */

const LOG_LINES = 40;
const REFRESH_SECONDS = 0.25;
/** 範圍表每 5 層一欄 */
const AREA_FLOORS = [1, 5, 10, 15, 20, 25, 30, 35];
const RING_ACTUAL = 0xff3a30;
const RING_OLD = 0xffd040;
const RING_SCATTER = 0xc8c0b0;
const ELEMENT_NAMES: Record<Element, string> = { physical: '物理', fire: '火焰', cold: '冰寒', lightning: '閃電', poison: '毒素' };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;
const sec = (n: number) => `${n.toFixed(1)}s`;
const severity = (ratio: number) => (ratio >= 1 ? 'bad' : ratio >= 0.3 ? 'warn' : '');

function readConfig(fighters: readonly EnemyDef[], legendaries: readonly string[], lastFloor: number, maxLevel: number): SimConfig {
  const params = new URLSearchParams(location.search);
  const def = fighters.find((e) => e.id === `enemy.${params.get('enemy')}`) ?? fighters.find((e) => e.id === 'enemy.crypt_guardian')!;
  const clamp = (value: string | null, fallback: number, max: number) => {
    const n = Number(value ?? fallback);
    return Number.isInteger(n) ? Math.min(max, Math.max(1, n)) : fallback;
  };
  const gear = params.get('gear');
  const floor = clamp(params.get('floor'), 5, lastFloor);
  return {
    enemyId: def.id,
    floor,
    level: clamp(params.get('level'), Math.round(floor * 1.4) + 1, maxLevel),
    gear: gear !== null && gear in GEAR_LABELS ? (gear as GearId) : 'shield',
    phase: clamp(params.get('phase'), 1, def.phases.length + 1),
    wear: (params.get('wear') ?? '').split(',').filter((id) => legendaries.includes(id)),
  };
}

function applyConfig(config: SimConfig): void {
  const params = new URLSearchParams({ enemy: config.enemyId.replace('enemy.', ''), floor: String(config.floor), level: String(config.level), gear: config.gear });
  if (config.phase > 1) params.set('phase', String(config.phase));
  if (config.wear?.length) params.set('wear', config.wear.join(','));
  location.search = params.toString();
}

async function start(): Promise<void> {
  const catalog = DataRegistry.load(gameData);
  const fighters = catalog.enemies.all.filter((e) => e.ai !== 'none');
  const config = readConfig(fighters, catalog.legendaries.all.map((l) => l.id), catalog.balance.endgame.lastFloor, catalog.balance.maxLevel);
  const sim = createSim(config);
  const { world, data, enemy } = sim;
  const def = data.enemies.get(config.enemyId);
  const recorder = new SimRecorder(world, data, enemy);

  const panel = document.getElementById('panel')!;
  const nativeFloor = new Map<string, number>();
  for (let floor = 1; floor <= data.balance.endgame.lastFloor; floor++) {
    const f = data.floors.all.find((d) => d.floors[0] <= floor && floor <= d.floors[1]);
    const id = f?.throne?.enemyId ?? (f?.boss && floor % f.boss.every === 0 ? f.boss.enemyId : null);
    if (id && !nativeFloor.has(id)) nativeFloor.set(id, floor);
  }
  const option = (e: (typeof fighters)[number]) => {
    const home = nativeFloor.get(e.id);
    return `<option value="${e.id}"${e.id === config.enemyId ? ' selected' : ''}>${e.name}${home ? `（${home}F）` : ''}</option>`;
  };
  panel.innerHTML = `
    <div class="row">
      <label>敵人 <select id="enemy">
        <optgroup label="魔王">${fighters.filter((e) => e.boss).map(option).join('')}</optgroup>
        <optgroup label="一般怪物">${fighters.filter((e) => !e.boss).map(option).join('')}</optgroup>
      </select></label>
      <label>樓層 <input id="floor" type="number" min="1" max="${data.balance.endgame.lastFloor}" value="${config.floor}"></label>
      <label>主角等級 <input id="level" type="number" min="1" max="${data.balance.maxLevel}" value="${config.level}"></label>
    </div>
    <div class="row" style="margin-top:6px">
      <label>裝備 <select id="gear">${(Object.keys(GEAR_LABELS) as GearId[]).map((g) => `<option value="${g}"${g === config.gear ? ' selected' : ''}>${GEAR_LABELS[g]}</option>`).join('')}</select></label>
      <button id="pause">暫停</button>
      <button id="restart" title="敵人回到第一階段，紀錄清空">重新開始</button>
      <button id="clear" title="戰鬥繼續，紀錄清空">清空紀錄</button>
    </div>
    <div class="row" style="margin-top:6px" id="phasePick">
      <span class="sub">階段</span>
      ${def.phases.length === 0
        ? '<span class="sub">這隻敵人沒有階段</span>'
        : ['初始', ...def.phases.map((p) => p.label)].map((label, i) => `<button data-phase="${i + 1}" class="${config.phase === i + 1 ? 'on' : ''}">${i + 1}・${label}</button>`).join('')}
    </div>
    <div class="tabs">
      <button id="tabFight" class="on">戰鬥紀錄</button>
      <button id="tabArea">範圍檢視</button>
    </div>
    <div id="areaPane" class="hidden">
      <div class="row" style="margin-top:8px">
        <label>招式 <select id="areaSkill" style="max-width:300px"></select></label>
        <label>樓層 <input id="areaFloor" type="number" min="1" max="${data.balance.endgame.lastFloor}" value="${config.floor}"></label>
      </div>
      <div class="sub" style="margin-top:6px">
        圈畫在敵人身上、照實際大小（滾輪縮小才看得到全部，可先按暫停）：
        <span class="key" style="background:#ff3a30"></span>目前的範圍（預警也一樣大）
        <span class="key" style="background:#ffd040"></span>魔王改動前的範圍
        <span class="key" style="background:#c8c0b0"></span>落點散布
      </div>
      <div id="areaDetail" style="margin-top:8px"></div>
      <h2>所有會放大的招式 <small>半徑（格）；點一列就預覽</small></h2>
      <div class="sub">魔王倍率：${AREA_FLOORS.map((f) => `${f}F ×${currentAreaScale(f, true, data).toFixed(2)}`).join('・')}，放大後最多 ${data.balance.difficulty.monsterBoost.bossSkillAreaCap} 格（看整招最大的範圍，等比例放大）<br>一般怪與精英倍率：${AREA_FLOORS.map((f) => `${f}F ×${currentAreaScale(f, false, data).toFixed(2)}`).join('・')}<br><span class="bad">紅字</span> = 看到出招才跑也跑不掉（移速 4、貼身站位）；<span class="bad">紅底</span> = 落點鋪滿整個散布範圍；<span style="color:#4f463a">灰字</span> = 這一層不會出現</div>
      <div id="areaAll" style="margin-top:6px"></div>
    </div>
    <div id="fightPane">
    <h2>敵人 <small>${def.name}・第 ${config.floor} 層${def.phases.length ? `・階段 ${config.phase}` : ''}</small></h2>
    <div id="enemyInfo"></div>
    <h2>主角 <small>Lv ${config.level}・${GEAR_LABELS[config.gear]}</small></h2>
    <div id="playerInfo"></div>
    <h2>技能 <small>傷害是打在目前主角身上的數字；灰色 = 目前階段不會用</small></h2>
    <div id="skills"></div>
    <h2>紀錄 <small>換敵人、樓層、階段、等級或裝備都會重新紀錄</small></h2>
    <div id="summary" class="stats tiles"></div>
    <div id="rows" style="margin-top:8px"></div>
    <h2>最近的傷害</h2>
    <div id="log"></div>
    </div>`;
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const change = (patch: Partial<SimConfig>) => applyConfig({ ...config, ...patch });
  const numberInput = (id: 'floor' | 'level') => {
    const input = el<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (Number.isInteger(n) && n >= Number(input.min) && n <= Number(input.max)) change({ [id]: n });
      else input.value = String(config[id]);
    });
  };
  el<HTMLSelectElement>('enemy').addEventListener('change', (e) => change({ enemyId: (e.target as HTMLSelectElement).value, phase: 1 }));
  el<HTMLSelectElement>('gear').addEventListener('change', (e) => change({ gear: (e.target as HTMLSelectElement).value as GearId }));
  numberInput('floor');
  numberInput('level');
  el('restart').addEventListener('click', () => change({}));
  el('clear').addEventListener('click', () => {
    recorder.reset();
    refreshRecord();
  });
  el('pause').addEventListener('click', () => {
    loop.paused = !loop.paused;
    el('pause').textContent = loop.paused ? '繼續' : '暫停';
    el('pause').classList.toggle('on', loop.paused);
  });
  el('phasePick').addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-phase]');
    if (button) change({ phase: Number(button.dataset.phase) });
  });

  // ── 範圍檢視：不重新載入，敵人繼續打 ──
  const areaSkills = buildAreaTable(data);
  const areaGroups: [string, AreaSkill[]][] = [
    [`${def.name}的招式`, areaSkills.filter((s) => s.users.includes(def.name))],
    ['魔王', areaSkills.filter((s) => s.boss)],
    ['一般怪物', areaSkills.filter((s) => !s.boss && !s.mimic)],
    ['學主角技能的怪物', areaSkills.filter((s) => s.mimic)],
  ];
  const skillSelect = el<HTMLSelectElement>('areaSkill');
  skillSelect.innerHTML = areaGroups
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => `<optgroup label="${label}">${list.map((s) => `<option value="${s.id}">${s.name}（${s.users[0]}）</option>`).join('')}</optgroup>`)
    .join('');
  let areaOn = false;
  let areaFloor = config.floor;
  const pickedArea = () => areaSkills.find((s) => s.id === skillSelect.value) ?? areaSkills[0]!;
  const mainShape = (s: AreaSkill) => s.shapes.reduce((a, b) => (b.radius > a.radius ? b : a));

  const refreshArea = () => {
    const skill = pickedArea();
    const shape = mainShape(skill);
    const row = (label: string, radius: (floor: number) => number) =>
      `<tr><td class="sub">${label}</td>${AREA_FLOORS.map((f) => {
        const r = radius(f);
        const verdict = judgeArea(shape, r, skill.windup);
        return `<td class="n ${skill.floors.includes(f) ? (verdict === 'ok' ? '' : verdict) : 'dim'}">${r.toFixed(1)}</td>`;
      }).join('')}</tr>`;
    const here = currentRadius(skill, shape, areaFloor, data);
    const before = oldRadius(shape.radius, areaFloor, data);
    const facts = [
      shape.angleDeg < 360 ? `${shape.angleDeg}° 扇形` : '圓形',
      shape.kind === 'zone' ? `地面持續 ${shape.duration} 秒` : '瞬間',
      `前搖 ${skill.windup.toFixed(2)} 秒${shape.delay ? ` + 落下 ${shape.delay} 秒` : ''}`,
      skill.cooldown > 0 ? `冷卻 ${skill.cooldown} 秒` : '沒有冷卻',
      shape.repeat > 1 ? `落下 ${shape.repeat} 次${shape.scatter ? `、散布半徑 ${shape.scatter} 格` : ''}` : '',
    ].filter(Boolean);
    const density = shape.scatter > 0 && shape.repeat > 1 ? `<div class="sub" style="margin-top:4px">第 ${areaFloor} 層平均每個位置被打中 ${(shape.repeat * (here / shape.scatter) ** 2).toFixed(1)} 次</div>` : '';
    el('areaDetail').innerHTML = `<div class="stats">
        ${stat(`第 ${areaFloor} 層半徑`, `${here.toFixed(1)} 格`, judgeArea(shape, here, skill.windup) === 'ok' ? '' : 'bad')}
        ${stat('改動前', skill.boss ? `${before.toFixed(1)} 格` : '沒改')}
        ${stat('地面預警', skill.telegraph ? '有' : '沒有')}
        ${stat('走出去要', `${(here / 4).toFixed(1)} 秒`)}
      </div>
      <div class="sub" style="margin-top:4px">${skill.users.join('、')}・第 ${skill.floors[0]}～${skill.floors[skill.floors.length - 1]} 層<br>${facts.join('・')}</div>${density}
      <table style="margin-top:6px"><tr><th></th>${AREA_FLOORS.map((f) => `<th class="n">${f}F</th>`).join('')}</tr>
      ${row('目前', (f) => currentRadius(skill, shape, f, data))}
      ${skill.boss ? row('改動前', (f) => oldRadius(shape.radius, f, data)) : ''}</table>`;
    for (const tr of document.querySelectorAll<HTMLElement>('#areaAll tbody tr')) tr.classList.toggle('picked', tr.dataset.id === skill.id);
  };

  el('areaAll').innerHTML = `<table><thead><tr><th>招式</th><th class="n">基礎</th>${AREA_FLOORS.map((f) => `<th class="n">${f}F</th>`).join('')}</tr></thead><tbody>${areaSkills
    .map((s) => {
      const shape = mainShape(s);
      const cells = AREA_FLOORS.map((f) => {
        const r = currentRadius(s, shape, f, data);
        const verdict = judgeArea(shape, r, s.windup);
        return `<td class="n ${s.floors.includes(f) ? (verdict === 'ok' ? '' : verdict) : 'dim'}">${r.toFixed(1)}</td>`;
      }).join('');
      return `<tr data-id="${s.id}" title="${s.users.join('、')}"><td>${s.name}<div class="sub">${s.users[0]}</div></td><td class="n">${largest(s)}</td>${cells}</tr>`;
    })
    .join('')}</tbody></table>`;
  el('areaAll').addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (!tr) return;
    skillSelect.value = tr.dataset.id!;
    refreshArea();
  });
  skillSelect.addEventListener('change', refreshArea);
  const areaFloorInput = el<HTMLInputElement>('areaFloor');
  areaFloorInput.addEventListener('change', () => {
    const n = Number(areaFloorInput.value);
    if (Number.isInteger(n) && n >= 1 && n <= data.balance.endgame.lastFloor) areaFloor = n;
    else areaFloorInput.value = String(areaFloor);
    refreshArea();
  });
  const showTab = (area: boolean) => {
    areaOn = area;
    el('tabArea').classList.toggle('on', area);
    el('tabFight').classList.toggle('on', !area);
    el('areaPane').classList.toggle('hidden', !area);
    el('fightPane').classList.toggle('hidden', area);
    if (area) refreshArea();
  };
  el('tabArea').addEventListener('click', () => showTab(true));
  el('tabFight').addEventListener('click', () => showTab(false));
  /** 把選中的招式照實際大小畫在敵人身上 */
  const areaRings = () => {
    const skill = pickedArea();
    const shape = mainShape(skill);
    const ring = (radius: number, color: number, width: number, fill = 0) => ({ radius, angleDeg: shape.angleDeg, color, width, fill });
    return [
      ...(shape.scatter > 0 ? [{ ...ring(shape.scatter, RING_SCATTER, 1), angleDeg: 360 }] : []),
      ...(skill.boss ? [ring(oldRadius(shape.radius, areaFloor, data), RING_OLD, 2)] : []),
      ring(currentRadius(skill, shape, areaFloor, data), RING_ACTUAL, 3, 0.14),
    ];
  };

  const stat = (label: string, value: string, cls = '') => `<div>${label}<b class="${cls}">${value}</b></div>`;

  const refreshEnemy = () => {
    const elements = enemy.innateElements ? `<div class="sub" style="margin-top:4px">屬性：${enemy.innateElements.map((e) => ELEMENT_NAMES[e]).join(' + ')}（每次出招抽一種；技能表以第一種計算）</div>` : '';
    el('enemyInfo').innerHTML = `<div class="stats">
      ${stat('生命', `${fmt(enemy.hp)} / ${fmt(enemy.maxHp)}`)}
      ${stat('基礎傷害', `${fmt(enemy.stats.get('damageMin') * (1 + enemy.stats.get('damageBonus')))}–${fmt(enemy.stats.get('damageMax') * (1 + enemy.stats.get('damageBonus')))}`)}
      ${stat('攻速 / 移速', `${enemy.stats.get('attackSpeed').toFixed(2)} / ${enemy.stats.get('moveSpeed').toFixed(1)}`)}
      ${stat('傷害加成', pct(enemy.stats.get('damageBonus')))}
    </div>${elements}${phaseTable()}`;
  };

  /** 各階段對照：不必切過去就看得到差異，目前的階段加亮 */
  const phaseTable = () => {
    if (def.phases.length === 0) return '';
    const columns = buildPhaseTable(def, enemy, data);
    const row = (label: string, cell: (c: (typeof columns)[number]) => string) =>
      `<tr><td class="sub">${label}</td>${columns.map((c, i) => `<td class="${i === config.phase - 1 ? 'now' : ''}">${cell(c)}</td>`).join('')}</tr>`;
    const list = (items: string[], sign: string) => items.map((n) => `<div>${sign}${n}</div>`).join('');
    return `<table style="margin-top:8px"><tr><th></th>${columns.map((c, i) => `<th class="${i === config.phase - 1 ? 'now' : ''}">${i + 1}・${c.label}</th>`).join('')}</tr>
      ${row('血量門檻', (c) => (c.hpBelow === 1 ? '開場' : `${pct(c.hpBelow)} 以下`))}
      ${row('基礎傷害', (c) => `${fmt(c.stats.get('damageMin') * (1 + c.stats.get('damageBonus')))}–${fmt(c.stats.get('damageMax') * (1 + c.stats.get('damageBonus')))}`)}
      ${row('傷害加成', (c) => pct(c.stats.get('damageBonus')))}
      ${row('攻速', (c) => c.stats.get('attackSpeed').toFixed(2))}
      ${row('移速', (c) => c.stats.get('moveSpeed').toFixed(1))}
      ${phaseStatIds(def).map((id) => row(STAT_LABELS[id] ?? id, (c) => pct(c.stats.get(id)))).join('')}
      ${row('招式變化', (c) => list(c.added, '＋') + list(c.removed, '－') || '<span class="sub">—</span>')}
      ${columns.some((c) => c.mechanics.length) ? row('機制', (c) => c.mechanics.map((m) => `<div>${m}</div>`).join('') || '<span class="sub">—</span>') : ''}
    </table>`;
  };

  const refreshPlayer = () => {
    const s = world.player.stats;
    const mitigation = defenseMitigation(s.get('defense'), data.balance.combat.defenseConstant);
    const r = (stat_: Parameters<typeof s.get>[0]) => pct(Math.min(data.balance.combat.maxResist, Math.max(0, s.get(stat_))));
    el('playerInfo').innerHTML = `<div class="stats">
      ${stat('最大生命', fmt(world.player.maxHp))}
      ${stat('防禦（物理減傷）', `${fmt(s.get('defense'))}（${pct(mitigation)}）`)}
      ${stat('閃避 / 格擋', `${pct(s.get('dodgeChance'))} / ${pct(s.get('blockChance'))}`)}
      ${stat('減傷', pct(s.get('damageReduction')))}
      ${stat('火焰抗性', r('fireResist'))}
      ${stat('冰寒抗性', r('coldResist'))}
      ${stat('閃電抗性', r('lightningResist'))}
      ${stat('毒素抗性', r('poisonResist'))}
    </div>`;
  };

  const refreshSkills = () => {
    const phase = world.bosses.phaseOf(enemy);
    const maxHp = world.player.maxHp;
    const rows = buildSkillTable(def, enemy, world.player, data).map((s) => {
      const damage = s.lines.length === 0
        ? '<span class="sub">無傷害</span>'
        : s.lines.map((l) => `<div class="e-${l.element}">${ELEMENT_NAMES[l.element]} ${fmt(l.min)}–${fmt(l.max)}${l.count > 1 ? ` ×${l.count}` : ''}</div>`).join('');
      const when = s.passive ? '被動' : s.barrage ? '收爪時連發' : s.cooldown > 0 ? `冷卻 ${s.cooldown}s` : '主要攻擊';
      const phases = def.phases.length === 0 || s.passive ? '' : `・階段 ${s.phases.map((p) => p + 1).join(',')}`;
      const off = !s.passive && !s.phases.includes(phase);
      return `<tr class="${off ? 'off' : ''}" title="${s.description}">
        <td>${s.name}<div class="sub">${when}・前搖 ${s.castTime.toFixed(1)}s${s.telegraph ? '・有預警' : ''}${phases}</div>${s.extras.length ? `<div class="sub">${s.extras.join('、')}</div>` : ''}</td>
        <td>${damage}</td>
        <td class="n ${severity(s.fullHit / maxHp)}">${s.lines.length ? `${fmt(s.fullHit)}<div class="sub">${pct(s.fullHit / maxHp)}</div>` : ''}</td>
      </tr>`;
    });
    el('skills').innerHTML = `<table><tr><th>招式</th><th>每擊傷害</th><th class="n" title="站著不動、每一下都打中的合計；散落的招式實際上不會全中">全中上限</th></tr>${rows.join('')}</table>`;
  };

  const refreshRecord = () => {
    const s = recorder.summary;
    const maxHp = world.player.maxHp;
    el('summary').innerHTML = [
      stat('計時', sec(s.elapsed)),
      stat('總傷害', fmt(s.total)),
      stat('每秒傷害', fmt(s.dps)),
      stat('撐得了（預估）', s.dps > 0 ? sec(maxHp / s.dps) : '—'),
      stat('單次最高', `${fmt(s.maxHit)}（${pct(s.maxHitPct)}）`, severity(s.maxHitPct)),
      stat('1 秒內最高', `${fmt(s.burst1s)}（${pct(s.burst1s / maxHp)}）`, severity(s.burst1s / maxHp)),
      stat('5 秒內最高', `${fmt(s.burst5s)}（${pct(s.burst5s / maxHp)}）`, severity(s.burst5s / maxHp)),
      stat('倒下次數（換算）', (s.total / maxHp).toFixed(1)),
      stat('命中次數', fmt(s.hits)),
      stat('閃避', fmt(s.dodges)),
      stat('格擋', fmt(s.blocks)),
    ].join('');
    const table = recorder.table;
    el('rows').innerHTML = table.length === 0
      ? '<div class="empty">還沒有受到攻擊。</div>'
      : `<table><tr><th>招式</th><th class="n">出招</th><th class="n">命中</th><th class="n">總傷害</th><th class="n">平均</th><th class="n">最高</th></tr>${table
          .map((r) => {
            const source = r.source === enemy.name ? '' : `${r.source}・`;
            const elements = [...r.elements].map((e) => `<span class="e-${e}">${ELEMENT_NAMES[e]}</span>`).join(' ');
            return `<tr><td>${source}${r.skill}<div class="sub">${r.phase} ${elements}</div></td><td class="n">${r.casts || '—'}</td><td class="n">${r.hits}</td><td class="n">${fmt(r.total)}</td><td class="n">${r.hits ? fmt(r.total / r.hits) : '—'}</td><td class="n ${severity(r.maxPct)}">${r.hits ? `${fmt(r.max)}<div class="sub">${pct(r.maxPct)}</div>` : '—'}</td></tr>`;
          })
          .join('')}</table>`;
    const recent = recorder.hits.slice(-LOG_LINES).reverse();
    el('log').innerHTML = recent.length === 0
      ? '<div class="empty">—</div>'
      : `<table>${recent
          .map((h) => `<tr><td>${sec(h.time - recorder.hits[0]!.time)}</td><td>${h.source === enemy.name ? '' : `${h.source}・`}${h.skill}</td><td class="e-${h.element}">${ELEMENT_NAMES[h.element]}</td><td class="n ${h.crit ? 'crit' : ''}">${fmt(h.amount)}</td><td class="n ${severity(h.pct)}">${pct(h.pct)}</td></tr>`)
          .join('')}</table>`;
  };

  // 畫面：與 main.ts 相同的 Pixi + Three.js 組合
  const host = document.getElementById('game')!;
  const app = new Application();
  await app.init({ preference: 'webgl', resizeTo: host, background: PALETTE.background, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  host.appendChild(app.canvas);
  const projection = new IsoProjection();
  const camera = new Camera(projection);
  let three: ThreeWorld | null = null;
  try {
    const gl = (app.renderer as WebGLRenderer).gl;
    if (!(gl instanceof WebGL2RenderingContext)) throw new Error('瀏覽器不支援 WebGL2');
    const { ThreeWorld } = await import('../../render/three/ThreeWorld');
    three = new ThreeWorld(app.canvas, gl, projection);
    app.ticker.remove(app.render, app);
    app.ticker.add(() => {});
  } catch (error) {
    console.warn('無法啟動 Three.js 畫法，改用 Pixi 畫法', error);
    three = null;
  }
  app.renderer.resetState();
  const renderer = new Renderer(app, projection, world, camera, data, three);
  renderer.setThree(three !== null);
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.zoomBy(Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // 主角只能走路：點敵人也當成點地板，施放技能、喝藥水的指令都不送進遊戲
  const input = new CommandQueue<GameCommand>();
  const inputManager = new InputManager(app.canvas, input, {
    screenToWorld: (screen) => camera.screenToWorld(screen),
    pickActor: () => null,
    pickInteractable: () => null,
    isPaused: () => loop.paused,
  });
  const forwardMovement = () => {
    for (const command of input.drain()) {
      if (command.type === 'PrimaryAction') sim.commands.push({ ...command, targetId: null, interactId: null, standStill: false });
      else if (command.type === 'PrimaryRelease') sim.commands.push(command);
    }
  };

  const now = () => performance.now() / 1000;
  let nextRefresh = 0;
  let shownPhase = -1;
  const loop = new GameLoop({
    update: (dt) => {
      forwardMovement();
      tickSim(sim, dt);
      recorder.flush();
    },
    render: (alpha) => {
      renderer.rangePreview = areaOn ? { center: enemy.position, direction: normalize(sub(world.player.position, enemy.position)), rings: areaRings() } : null;
      renderer.render(alpha);
      renderer.consumeRoars();
      inputManager.poll(now());
      if (now() < nextRefresh) return;
      nextRefresh = now() + REFRESH_SECONDS;
      // 階段改變時屬性與傷害加成會變：怪物資訊與技能表跟著重算
      const phase = world.bosses.phaseOf(enemy);
      if (phase !== shownPhase) {
        shownPhase = phase;
        refreshEnemy();
        refreshSkills();
      }
      refreshRecord();
    },
  });
  refreshPlayer();
  loop.start({ now }, (cb) => requestAnimationFrame(cb));
}

void start();
