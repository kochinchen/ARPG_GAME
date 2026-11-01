import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { Actor } from '../../../src/game/entities/Actor';
import { Bot, type Persona } from './bot';
import { setupCharacter, xpPerFloor, type Build, type Preset } from './character';
import { applySave, type LoadedSave } from './fromSave';

export const DT = 1 / 60;
const TICKS_PER_SEC = 60;

export const data = DataRegistry.load(gameData);

export function makeWorld(floor: number, seed: number) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor, commands, events, seed });
  return { world, commands, events };
}

let xpCache: number[] | null = null;
/** 各層的經驗（用固定種子算一次） */
export function xpTable(): number[] {
  return (xpCache ??= xpPerFloor((f) => makeWorld(f, 1).world, data.balance.endgame.lastFloor));
}

export interface RunResult {
  floor: number;
  build: string;
  persona: Persona;
  seed: number;
  level: number;
  /** 魔王層（含挑戰樓層、王座） */
  bossFloor: boolean;
  /** 過關（出口開啟） */
  cleared: boolean;
  /** 超過時間還沒過關 */
  timedOut: boolean;
  /** 過關前死過（死第一次就停：死亡率 = 這一層「至少死一次」的比例） */
  deaths: number;
  /** 過關、死亡或時間到的遊戲時間（秒） */
  time: number;
  /** 一般怪群任一秒內造成的最大傷害（佔最大生命） */
  burst1s: number;
  /** 魔王 / 小王任一秒內造成的最大傷害 */
  bossBurst1s: number;
  /** 任 5 秒內的最大受傷（持續壓力） */
  burst5s: number;
  /** 第一次死亡前的最低血量（沒死就是全程） */
  minHpPct: number;
  potions: number;
  /** 血量低於 15% 後活下來的次數 */
  nearDeaths: number;
  /** 站樁：從第一次受傷到倒下的秒數（沒倒下為 null） */
  timeToDie: number | null;
  kills: number;
  /** 主角受到的傷害來源（怪物・招式 → 佔最大生命的倍數） */
  damageBy: Record<string, number>;
  /** 第一次死亡的最後一擊（怪物・招式） */
  killer: string | null;
  /** 沒過關時：出口還差幾隻、首領是否還活著、場上還剩幾隻（找不到怪或卡住時看這裡） */
  stuck?: { remaining: number; champion: boolean; alive: number };
}

export interface RunOptions {
  floor: number;
  /** 存檔法：用這份存檔當角色（沒有時用快照法） */
  save?: LoadedSave;
  build: Build;
  /** 預設角色（固定等級、全紫或全橘、鑲滿黃核）取代快照角色 */
  preset?: Preset;
  persona: Persona;
  seed: number;
  /** 遊戲時間上限（秒） */
  maxTime?: number;
}

/** 傷害來源的名稱：怪物（精英詞綴不算）・招式；持續傷害沒有來源時用元素 */
function sourceLabel(source: Actor | undefined, element: string): string {
  if (!source) return `持續傷害・${element}`;
  const name = source.defId ? data.enemies.get(source.defId).name : source.name;
  const skill = source.cast?.skill;
  return `${name}・${skill ? skill.name : element}`;
}

export function runFloor({ floor, build, persona, seed, save, preset, maxTime = 600 }: RunOptions): RunResult {
  const { world, commands, events } = save ? makeWorld(1, save.data.meta.runSeed) : makeWorld(floor, seed);
  if (save) applySave(world, data, save.data, floor, seed);
  else setupCharacter(world, data, floor, build, xpTable(), preset);
  const bot = new Bot(world, commands, build, persona, new Rng(seed).fork('bot'));
  const player = world.player;

  const window1 = new Float64Array(TICKS_PER_SEC);
  const windowBoss = new Float64Array(TICKS_PER_SEC);
  const window5 = new Float64Array(TICKS_PER_SEC * 5);
  let tickDamage = 0;
  let tickBoss = 0;
  let sum1 = 0;
  let sumBoss = 0;
  let sum5 = 0;
  const r: RunResult = {
    floor,
    build: build.id,
    persona,
    seed,
    level: world.progress.level,
    bossFloor: world.floors.bossFloor,
    cleared: false,
    timedOut: false,
    deaths: 0,
    time: 0,
    burst1s: 0,
    bossBurst1s: 0,
    burst5s: 0,
    minHpPct: 1,
    potions: 0,
    nearDeaths: 0,
    timeToDie: null,
    kills: 0,
    damageBy: {},
    killer: null,
  };
  let firstHitAt: number | null = null;
  let lowPoint = false;
  let lastHit: string | null = null;

  events.on('ActorDamaged', (e) => {
    if (e.targetId !== player.id) return;
    const source = e.sourceId === null ? undefined : world.actors.find((a) => a.id === e.sourceId);
    const key = sourceLabel(source, e.element);
    r.damageBy[key] = (r.damageBy[key] ?? 0) + e.amount / player.maxHp;
    lastHit = key;
    if (source?.isBoss || source?.miniBoss) tickBoss += e.amount;
    else tickDamage += e.amount;
    if (firstHitAt === null) firstHitAt = world.playTime;
  });
  events.on('ActorDied', (e) => {
    if (e.actorId === player.id) {
      if (r.deaths === 0) r.killer = lastHit;
      r.deaths++;
      if (persona === 'idle' && r.timeToDie === null && firstHitAt !== null) r.timeToDie = world.playTime - firstHitAt;
    } else if (e.faction === 'enemy' && !e.summoned) r.kills++;
  });
  events.on('PotionUsed', () => r.potions++);
  events.on('ExitOpened', () => (r.cleared = true));

  const maxTicks = maxTime * TICKS_PER_SEC;
  const idleLimit = 60 * TICKS_PER_SEC;
  for (let t = 0; t < maxTicks; t++) {
    bot.update(DT);
    world.update(DT);
    const maxHp = player.maxHp;
    const i1 = t % window1.length;
    const i5 = t % window5.length;
    const total = tickDamage + tickBoss;
    sum1 += tickDamage - window1[i1]!;
    window1[i1] = tickDamage;
    sumBoss += tickBoss - windowBoss[i1]!;
    windowBoss[i1] = tickBoss;
    sum5 += total - window5[i5]!;
    window5[i5] = total;
    tickDamage = 0;
    tickBoss = 0;
    r.burst1s = Math.max(r.burst1s, sum1 / maxHp);
    r.bossBurst1s = Math.max(r.bossBurst1s, sumBoss / maxHp);
    r.burst5s = Math.max(r.burst5s, sum5 / maxHp);
    if (player.alive) {
      const hpPct = player.hp / maxHp;
      if (r.deaths === 0) r.minHpPct = Math.min(r.minHpPct, hpPct);
      if (hpPct < 0.15) lowPoint = true;
      else if (lowPoint && hpPct > 0.4) {
        lowPoint = false;
        r.nearDeaths++;
      }
    } else lowPoint = false;
    if (persona === 'idle' && (r.deaths > 0 || (firstHitAt === null ? t > idleLimit * 3 : world.playTime - firstHitAt > idleLimit))) break;
    if (persona !== 'idle' && (r.cleared || r.deaths > 0)) break;
  }
  r.time = world.playTime;
  r.timedOut = persona !== 'idle' && !r.cleared && r.deaths === 0;
  if (r.timedOut) {
    const alive = world.actors.filter((a) => a.alive && a.faction === 'enemy');
    r.stuck = { remaining: world.floors.remainingToOpen, champion: world.floors.championAlive, alive: alive.length };
  }
  return r;
}
