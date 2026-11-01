import { it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { Bot } from '../sim/bot';
import { BUILDS, PRESET, setupCharacter, type Preset } from '../sim/character';
import { DT, data, makeWorld, xpTable } from '../sim/run';

/** 除錯用：F=樓層 B=流派 P=機器人 T=秒數 EVERY=每幾秒印一次 */
it('trace', async () => {
  const floor = Number(process.env.F ?? 2);
  const build = BUILDS.find((b) => b.id === (process.env.B ?? 'melee'))!;
  const { world, commands, events } = makeWorld(floor, Number(process.env.SEED ?? 1000 + floor * 17));
  setupCharacter(world, data, floor, build, xpTable(), process.env.PRESET ? { ...PRESET, ...(process.env.LV ? { level: Number(process.env.LV), itemLevel: Number(process.env.LV) } : {}), ...(process.env.R ? { rarity: process.env.R as Preset['rarity'] } : {}) } : undefined);
  const p = world.player;
  console.error('level', world.progress.level, 'hp', p.maxHp, 'mana', p.maxMana, 'dmg', p.stats.get('damageMin').toFixed(0), p.stats.get('damageMax').toFixed(0), 'sp', p.stats.get('spellPower').toFixed(0), 'def', p.stats.get('defense').toFixed(0));
  console.error('combos', JSON.stringify(world.loadout.combos.slice(0, 4)));
  const bot = new Bot(world, commands, build, (process.env.P as 'normal') ?? 'normal', new Rng(1).fork('bot'));
  let dealt = 0, taken = 0, kills = 0;
  const fails = new Map<string, number>();
  events.on('SkillFailed', (e) => { if (e.actorId === p.id) fails.set(`${e.skillId}:${e.reason}`, (fails.get(`${e.skillId}:${e.reason}`) ?? 0) + 1); });
  const bySource = new Map<string, number>();
  events.on('ActorDamaged', (e) => {
    if (e.sourceId === p.id) dealt += e.amount;
    if (e.targetId !== p.id) return;
    taken += e.amount;
    const src = world.actors.find((a) => a.id === e.sourceId);
    const key = `${src?.name ?? 'dot'}:${src?.cast?.skill.id ?? e.element}`;
    bySource.set(key, (bySource.get(key) ?? 0) + e.amount);
  });
  events.on('ActorDied', (e) => { if (e.killerId === p.id) kills++; if (e.actorId === p.id) console.error('DIED', world.playTime.toFixed(1)); });
  const every = Number(process.env.EVERY ?? 5) * 60;
  for (let t = 0; t < 60 * Number(process.env.T ?? 60); t++) {
    bot.update(DT);
    world.update(DT);
    if (t % every === 0) {
      const tg = (bot as unknown as { chase: { id: number } | null }).chase;
      const target = tg ? world.actors.find((a) => a.id === tg.id) : null;
      const awake = world.actors.filter((a) => a.alive && a.faction === 'enemy' && Math.hypot(a.position.x - p.position.x, a.position.y - p.position.y) < 8).length;
      console.error(`t${Math.round(t / 60)} hp${Math.round(p.hp)} mp${Math.round(p.mana)} pos${p.position.x.toFixed(0)},${p.position.y.toFixed(0)} path${p.path.length} cast${p.cast?.skill.id ?? '-'} target:${target?.name ?? '-'}@${target ? Math.round(Math.hypot(target.position.x - p.position.x, target.position.y - p.position.y)) : '-'} near8:${awake} dealt${Math.round(dealt)} taken${Math.round(taken)} kills${kills} remain${world.floors.remainingToOpen} champ${world.floors.championAlive} pots${world.potions.count} boss${(() => { const b = world.actors.find((a) => a.isBoss); return b ? `${Math.round(b.hp)}/${Math.round(b.maxHp)}@${Math.round(Math.hypot(b.position.x - p.position.x, b.position.y - p.position.y))}` : "-"; })()}`);
    }
  }
  {
    const { Pathfinder } = await import('../../../src/game/movement/Pathfinder');
    const pf = new Pathfinder(world.nav);
    const cell = world.nav.cellOf(p.position);
    const rows = [];
    for (let dy = -3; dy <= 3; dy++) { let row = ''; for (let dx = -3; dx <= 3; dx++) row += world.nav.isWalkable(cell.x + dx, cell.y + dy) ? '.' : '#'; rows.push(row); }
    console.error('pos', p.position, 'walkable', world.nav.isWalkableAt(p.position.x, p.position.y), 'clear', world.nav.isClearAt(p.position, p.radius), 'pathToSpawn', pf.findPath(p.position, world.spawnPoint, p.radius).length, '\n' + rows.join('\n'), 'statuses', p.statuses.map((x) => x.kind).join(','), 'intent', JSON.stringify(p.intent), 'combo', world.combos.isRunning(p));
  }
  for (const a of world.actors.filter((a) => a.alive && a.faction === 'enemy').sort((a, b) => Math.hypot(a.position.x - p.position.x, a.position.y - p.position.y) - Math.hypot(b.position.x - p.position.x, b.position.y - p.position.y)).slice(0, 4)) {
    const { Pathfinder } = await import('../../../src/game/movement/Pathfinder');
    const pf = new Pathfinder(world.nav);
    console.error(a.name, a.position, 'path', pf.findPath(p.position, a.position, p.radius).length, 'clear', world.nav.isClearAt(a.position, p.radius), 'los', world.nav.hasLineOfSight(p.position, a.position, 0.1));
  }
  console.error('taken by source', JSON.stringify([...bySource].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v)])));
  console.error('fails', JSON.stringify([...fails]));
});
