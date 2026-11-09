import { distance } from '../../core/math/Vec2';
import { NO_MODS } from '../combo/StepMods';
import type { Actor } from '../entities/Actor';
import type { AiContext } from './IAiState';

/** Modifier 的來源：狀況速度、靈活派這一箭的射程 */
const PACE_SOURCE = 'ai:pace';
const VOLLEY_SOURCE = 'ai:volley';
/** 射程加成取到這麼細（Tile），變化太小就不重算 */
const RANGE_STEP = 0.05;

/**
 * 移動速度隨狀況變化（balance.enemyTactics.pace，乘在基本速度上）：
 * - 追擊時主角在 sprintDistance 格外：追趕 + sprint（有 EnemyDef.run 的怪改用自己的跑步速度與距離；第一次發現主角的衝刺全程都跑）
 * - 誘敵逃跑、傳令兵求援、跑去撿藥水：+ errand
 * - 遊擊繞到背後的途中：+ flank
 * - 靈活派（弓手）被貼近後退：+ retreat
 * - 自爆的怪衝上去：+ sprint
 * 靈活派每一箭的飛行速度與射程另見 volley。魔王不套用。
 */
export function updatePace(ctx: AiContext): void {
  const { self, brain, tactics, targeting } = ctx;
  const pace = tactics.pace;
  const target = brain.targetId === null ? null : (targeting.getActor(brain.targetId) ?? null);
  let bonus = 0;
  if (!self.isBoss) {
    switch (brain.state) {
      case 'chase':
        if (brain.kamikaze) bonus = pace.sprint;
        else if (brain.charging && !self.cast) bonus = brain.run!.bonus;
        else if (brain.flanking) bonus = pace.flank;
        else if (brain.retreating && brain.tactics.includes('agile')) bonus = pace.retreat;
        else if (target && !self.cast && distance(self.position, target.position) > (brain.run?.beyond ?? pace.sprintDistance)) bonus = brain.run?.bonus ?? pace.sprint;
        break;
      case 'flee':
      case 'call':
        bonus = pace.errand;
        break;
      case 'errand':
        bonus = brain.errand?.kind === 'potion' ? pace.errand : 0;
        break;
      default:
        bonus = 0;
    }
  }
  if (bonus !== brain.pace) {
    self.stats.removeBySource(PACE_SOURCE);
    if (bonus > 0) self.stats.addModifier({ stat: 'moveSpeed', kind: 'more', value: bonus, source: PACE_SOURCE });
    brain.pace = bonus;
  }
  if (brain.tactics.includes('agile')) volley(ctx, target);
}

/**
 * 靈活派（弓手）每一箭的飛行速度與射程（balance.enemyTactics.agile）：
 * 主角離得越遠，箭飛得越快、射得越遠（near 格內不加、far 格外加滿）；每一箭再擲一次隨機 ± jitter；精英再乘上 1 + elite。
 * 射程加在 projectileRange 上（出手距離與飛行距離都變長）；飛行速度放在這一箭的意圖上（SkillIntent.mods）。
 */
function volley(ctx: AiContext, target: Actor | null): void {
  const { self, brain, tactics, rng, skills } = ctx;
  const a = tactics.agile;
  // 每出手一次重擲下一箭的隨機值
  if (self.castCount !== brain.volleyCast) {
    brain.volleyCast = self.castCount;
    brain.volleyRoll = rng.range(-1, 1);
  }
  const d = target ? distance(self.position, target.position) : 0;
  const t = Math.min(1, Math.max(0, (d - a.near) / (a.far - a.near)));
  const elite = self.elite ? 1 + a.elite : 1;
  const jitter = a.jitter * brain.volleyRoll;
  const speed = (1 + a.speed * t + jitter) * elite - 1;
  const skill = skills.has(brain.skillId) ? skills.get(brain.skillId) : null;
  const base = skill?.range ?? 0;
  const range = Math.max(0, Math.round((base * ((1 + a.range * t + jitter) * elite - 1)) / RANGE_STEP) * RANGE_STEP);
  if (range !== brain.volleyRange) {
    self.stats.removeBySource(VOLLEY_SOURCE);
    if (range > 0) self.stats.addModifier({ stat: 'projectileRange', kind: 'flat', value: range, source: VOLLEY_SOURCE });
    brain.volleyRange = range;
  }
  const intent = self.intent;
  if (intent && intent.skillId === brain.skillId && intent.mods?.projectileSpeed !== speed) intent.mods = { ...NO_MODS, projectileSpeed: speed };
}
