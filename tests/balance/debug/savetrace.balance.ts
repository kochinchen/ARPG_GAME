import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { Bot, type Persona } from '../sim/bot';
import { applySave, loadSave } from '../sim/fromSave';
import { DT, data, makeWorld } from '../sim/run';

/**
 * 除錯用：存檔角色打一層的過程（SAVE=存檔路徑、F=樓層、P=機器人、SEED、T=秒數上限、OUT=輸出檔）。
 * 印出：每次受傷時攻擊者離多遠、各種怪打了多少與殺了幾隻、出手與走位各佔多少時間、倒下前 6 秒的經過。
 */
it('savetrace', () => {
  const save = loadSave(process.env.SAVE!, data);
  const floor = Number(process.env.F ?? save.data.floor.current);
  const seed = Number(process.env.SEED ?? 1000 + floor * 17);
  const persona = (process.env.P ?? 'kiter') as Persona;
  const { world, commands, events } = makeWorld(1, save.data.meta.runSeed);
  applySave(world, data, save.data, floor, seed);
  const bot = new Bot(world, commands, save.build, persona, new Rng(seed).fork('bot'));
  const p = world.player;
  const nameOf = (id: number | null) => {
    const a = id === null ? undefined : world.actors.find((x) => x.id === id);
    return a ? (a.defId ? data.enemies.get(a.defId).name : a.name) : '持續傷害';
  };
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const taken = new Map<string, { amount: number; hits: number; far: number; distSum: number }>();
  const dealt = new Map<string, number>();
  const kills = new Map<string, number>();
  const recent: string[] = [];
  let casts = 0;
  let dead = false;
  events.on('ActorDamaged', (e) => {
    const source = e.sourceId === null ? undefined : world.actors.find((a) => a.id === e.sourceId);
    if (e.targetId === p.id) {
      const key = `${nameOf(e.sourceId)}・${source?.cast?.skill.name ?? e.element}`;
      const t = taken.get(key) ?? { amount: 0, hits: 0, far: 0, distSum: 0 };
      const dist = source ? d(source.position, p.position) : 0;
      t.amount += e.amount / p.maxHp;
      t.hits++;
      t.distSum += dist;
      if (dist > 5) t.far++;
      taken.set(key, t);
      recent.push(`${world.playTime.toFixed(1)} 受傷 ${e.amount}（${key}，距離 ${dist.toFixed(1)}）剩 ${Math.round(p.hp)}`);
    } else if (e.sourceId === p.id) {
      const key = nameOf(e.targetId);
      dealt.set(key, (dealt.get(key) ?? 0) + e.amount);
    }
  });
  events.on('ActorDied', (e) => {
    if (e.actorId === p.id) dead = true;
    else if (e.faction === 'enemy') kills.set(nameOf(e.actorId), (kills.get(nameOf(e.actorId)) ?? 0) + 1);
  });
  events.on('SkillCast', (e) => {
    if (e.actorId === p.id) casts++;
  });

  const stuckLog: string[] = [];
  const start = world.playTime;
  let walking = 0;
  let casting = 0;
  let standing = 0;
  let nearSum = 0;
  let ticks = 0;
  const limit = Number(process.env.T ?? 300) * 60;
  for (let t = 0; t < limit && !dead && !world.floors.exitOpen; t++) {
    const before = { ...p.position };
    const wasOk = world.nav.isWalkableAt(p.position.x, p.position.y);
    const castBefore = p.cast?.skill.name ?? '-';
    bot.update(DT);
    world.update(DT);
    ticks++;
    if (wasOk && !world.nav.isWalkableAt(p.position.x, p.position.y))
      stuckLog.push(`${world.playTime.toFixed(2)} 主角進到不可走的格子：${before.x.toFixed(2)},${before.y.toFixed(2)} → ${p.position.x.toFixed(2)},${p.position.y.toFixed(2)}（移動 ${d(before, p.position).toFixed(2)} 格）施放 ${castBefore} 狀態 ${p.statuses.map((x) => x.kind).join(',') || '-'} 路徑 ${p.path.length} 連段 ${world.combos.isRunning(p)} 決定 ${bot.decision}｜最近事件：${recent.slice(-3).join(' ／ ')}`);
    if (p.cast) casting++;
    else if (p.path.length > 0) walking++;
    else standing++;
    let near = Infinity;
    for (const a of world.actors) if (a.alive && a.faction === 'enemy') near = Math.min(near, d(a.position, p.position));
    if (near < 15) nearSum += near;
    if (t % 60 === 0) recent.push(`${world.playTime.toFixed(1)} 血 ${Math.round(p.hp)}/${Math.round(p.maxHp)} 魔 ${Math.round(p.mana)} 最近的怪 ${near.toFixed(1)} ${p.cast ? `施放 ${p.cast.skill.name}` : p.path.length ? '走路' : '站著'}${p.statuses.length ? ` 狀態 ${p.statuses.map((x) => x.kind).join(',')}` : ''}${world.combos.isRunning(p) ? ' 連段中' : ''}${p.intent ? ` 意圖 ${p.intent.skillId}→${(() => { const a = world.actors.find((x) => x.id === p.intent!.targetId); return a ? `${nameOf(a.id)} d=${d(a.position, p.position).toFixed(1)} hp=${Math.round(a.hp)}${a.untouchable ? ' 無法選取' : ''}` : '地面'; })()}` : ''} 站位可走=${world.nav.isClearAt(p.position, p.radius)} ｜${bot.decision}`);
    while (recent.length > 60) recent.shift();
  }
  const time = world.playTime - start;
  const lines: string[] = [];
  lines.push(`${persona} 第 ${floor} 層 seed ${seed}：${dead ? '倒下' : world.floors.exitOpen ? '過關' : '時間到'}，${time.toFixed(0)} 秒，出手 ${casts} 次，施放 ${Math.round((casting / ticks) * 100)}%、走路 ${Math.round((walking / ticks) * 100)}%、站著 ${Math.round((standing / ticks) * 100)}%`);
  lines.push('受傷來源（最大生命的倍數・次數・平均距離・5 格外的比例）：');
  for (const [k, v] of [...taken].sort((a, b) => b[1].amount - a[1].amount).slice(0, 12)) lines.push(`  ${v.amount.toFixed(2)}  ${v.hits} 次  ${(v.distSum / v.hits).toFixed(1)} 格  ${Math.round((v.far / v.hits) * 100)}%  ${k}`);
  lines.push(`擊殺：${[...kills].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join('、')}`);
  lines.push(`造成傷害：${[...dealt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k} ${Math.round(n)}`).join('、')}`);
  lines.push(...stuckLog.slice(0, 6));
  if (dead || !world.floors.exitOpen) {
    lines.push('最後的經過：', ...recent.slice(-45).map((l) => `  ${l}`));
    // 倒下時周圍的地形（# 牆、. 地板、P 主角、英文字母 = 3 格內的怪，每格再切 2×2 看細一點）
    const near = world.actors.filter((a) => a.alive && a.faction === 'enemy' && d(a.position, p.position) < 4);
    lines.push(`主角 ${p.position.x.toFixed(2)},${p.position.y.toFixed(2)}；` + near.map((a, i) => `${String.fromCharCode(97 + i)}=${nameOf(a.id)} ${a.position.x.toFixed(2)},${a.position.y.toFixed(2)} 半徑 ${a.radius.toFixed(2)} 視線 ${world.nav.hasLineOfSight(p.position, a.position, 0.1)}`).join('；'));
    for (let y = Math.floor(p.position.y) - 3; y <= Math.floor(p.position.y) + 3; y += 0.5) {
      let row = '  ';
      for (let x = Math.floor(p.position.x) - 4; x <= Math.floor(p.position.x) + 4; x += 0.5) {
        const here = { x: x + 0.25, y: y + 0.25 };
        const foe = near.findIndex((a) => d(a.position, here) < 0.36);
        row += d(p.position, here) < 0.36 ? 'P' : foe >= 0 ? String.fromCharCode(97 + foe) : world.nav.isWalkableAt(here.x, here.y) ? '.' : '#';
      }
      lines.push(row);
    }
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, lines.join('\n'));
  else console.error(lines.join('\n'));
});
