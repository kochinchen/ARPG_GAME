import { rankValue } from '../../data/schema/common';
import type { DataRegistry } from '../../data/DataRegistry';
import type { EffectDef } from '../../data/schema/effects';
import type { EnemyDef } from '../../data/schema/enemy';
import type { SkillDef } from '../../data/schema/skill';
import { MIMIC_PREFIX } from '../../game/enemies/MimicSkills';
import { scaleForFloor } from '../../game/world/DifficultyScaler';

type AreaData = Pick<DataRegistry, 'balance' | 'enemies' | 'skills' | 'floors'>;

/** 一招裡的一個範圍（同一招可能有好幾個） */
export interface AreaShape {
  kind: 'area' | 'zone';
  /** 基礎半徑（Tile，已含魔王的 ×1.2） */
  radius: number;
  /** 扇形角度；360 = 圓 */
  angleDeg: number;
  /** 地面持續區域的秒數 */
  duration: number;
  /** 打下來前要等幾秒（延遲落下的招式） */
  delay: number;
  /** 一次施放落下幾次 */
  repeat: number;
  /** 落點散布的半徑（0 = 不散布）；這個數字不會隨樓層放大 */
  scatter: number;
  /** 長方形（長條）：不隨樓層放大，radius 等於長度 */
  line: { length: number; width: number; offsetDeg: number } | null;
}

export interface AreaSkill {
  id: string;
  name: string;
  /** 學主角技能的怪物用的招式 */
  mimic: boolean;
  /** 誰會用（魔王排前面） */
  users: string[];
  boss: boolean;
  /** 會出現的樓層 */
  floors: number[];
  shapes: AreaShape[];
  /** 從出招到打中的秒數（前搖） */
  windup: number;
  /** 範圍會隨樓層放大（false = 只有直線範圍，或標了固定範圍） */
  scales: boolean;
  cooldown: number;
  /** 前搖時地上有預警 */
  telegraph: boolean;
}

function collect(effects: readonly EffectDef[], delay: number, repeat: number, scatter: number, out: AreaShape[]): void {
  for (const e of effects) {
    switch (e.type) {
      case 'area':
        out.push({
          kind: 'area',
          radius: rankValue(e.radius, 1),
          angleDeg: e.line ? 0 : (e.angleDeg ?? 360),
          duration: 0,
          delay,
          repeat,
          scatter,
          line: e.line ? { ...e.line, offsetDeg: e.offsetDeg } : null,
        });
        collect(e.effects, delay, repeat, scatter, out);
        break;
      case 'zone':
        out.push({ kind: 'zone', radius: e.radius, angleDeg: 360, duration: rankValue(e.duration, 1), delay, repeat, scatter, line: null });
        collect(e.effects, delay, repeat, scatter, out);
        break;
      case 'delayed':
        collect(e.effects, delay + e.delay, repeat * e.repeat, Math.max(scatter, e.scatter), out);
        break;
      case 'projectile':
        collect(e.onHit, delay, repeat * rankValue(e.count, 1), scatter, out);
        break;
      case 'dash':
        collect(e.onPath, delay, repeat, scatter, out);
        break;
      case 'chain':
        collect(e.effects, delay, repeat, scatter, out);
        break;
      default:
        break;
    }
  }
}

/** 招式：有放大的（走 SkillSystem 施放）才算。被動與連發直接執行，不會放大 */
function castSkills(def: EnemyDef): string[] {
  return [...def.skills, ...def.phases.flatMap((p) => p.skills ?? [])];
}

/** 敵人 → 會出現的樓層（召喚物跟著召喚者） */
function enemyFloors(data: AreaData): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const add = (id: string, floor: number) => {
    let set = out.get(id);
    if (!set) out.set(id, (set = new Set()));
    set.add(floor);
  };
  const { endgame, hiddenBoss, goldWalker } = data.balance;
  for (let floor = 1; floor <= endgame.lastFloor; floor++) {
    const f = data.floors.all.find((d) => d.floors[0] <= floor && floor <= d.floors[1]);
    if (!f) continue;
    for (const m of f.monsterPool) if (m.minFloor <= floor) add(m.enemyId, floor);
    if (f.boss && floor % f.boss.every === 0) add(f.boss.enemyId, floor);
    if (f.throne) add(f.throne.enemyId, floor);
    for (const id of f.miniBosses ?? []) add(id, floor);
    for (const b of hiddenBoss.bosses) if (b.floors.includes(floor)) add(b.enemyId, floor);
    if (floor >= goldWalker.minFloor) for (const id of goldWalker.enemies) add(id, floor);
  }
  // 召喚物、脫離物（召喚物可能再召喚：多跑幾輪）
  for (let round = 0; round < 3; round++) {
    for (const def of data.enemies.all) {
      const floors = out.get(def.id);
      if (!floors) continue;
      const spawned = [...def.phases.flatMap((p) => (p.detach ? [p.detach.enemyId] : []))];
      for (const id of castSkills(def)) {
        const skill = data.skills.get(id);
        const summons = (effects: readonly EffectDef[]): string[] =>
          effects.flatMap((e) => (e.type === 'summon' ? [e.enemyId] : 'effects' in e ? summons(e.effects) : []));
        spawned.push(...summons(skill.effects));
      }
      for (const id of spawned) for (const floor of floors) add(id, floor);
    }
  }
  return out;
}

function windupOf(skill: SkillDef, attackSpeed: number): number {
  return (skill.useAttackSpeed ? 1 / attackSpeed : skill.castTime) * skill.impactAt;
}

/** 敵方範圍招式（魔王、大的排前面）。預設只列會隨樓層放大的；all = 連直線與固定範圍的招式也列出 */
export function buildAreaTable(data: AreaData, all = false): AreaSkill[] {
  const floorsOf = enemyFloors(data);
  const users = new Map<string, EnemyDef[]>();
  for (const def of data.enemies.all) {
    for (const id of new Set(castSkills(def))) {
      if (id === 'basic.attack') continue;
      users.set(id, [...(users.get(id) ?? []), def]);
    }
  }
  const rows: AreaSkill[] = [];
  for (const [id, defs] of users) {
    const skill = data.skills.get(id);
    const shapes: AreaShape[] = [];
    collect(skill.effects, 0, 1, 0, shapes);
    const scales = !skill.fixedArea && shapes.some((s) => !s.line);
    if (shapes.length === 0 || (!scales && !all)) continue;
    const seen = defs.filter((d) => floorsOf.has(d.id));
    if (seen.length === 0) continue;
    rows.push({
      id,
      name: skill.name,
      mimic: false,
      users: seen.sort((a, b) => Number(b.boss) - Number(a.boss)).map((d) => d.name),
      boss: seen.some((d) => d.boss),
      floors: [...new Set(seen.flatMap((d) => [...floorsOf.get(d.id)!]))].sort((a, b) => a - b),
      shapes,
      windup: windupOf(skill, seen[0]!.attackSpeed),
      scales,
      cooldown: skill.cooldown,
      telegraph: skill.telegraph,
    });
  }
  // 怪物學的主角技能：解鎖樓層起都可能出現
  const firstMimic = Math.min(...data.balance.enemyMimic.unlocks.map((u) => u.minFloor));
  for (const skill of data.skills.all) {
    if (!skill.id.startsWith(MIMIC_PREFIX)) continue;
    const shapes: AreaShape[] = [];
    collect(skill.effects, 0, 1, 0, shapes);
    const scales = !skill.fixedArea && shapes.some((s) => !s.line);
    if (shapes.length === 0 || (!scales && !all)) continue;
    rows.push({
      id: skill.id,
      name: skill.name,
      mimic: true,
      users: ['學主角技能的怪物'],
      boss: false,
      floors: Array.from({ length: data.balance.endgame.lastFloor - firstMimic + 1 }, (_, i) => firstMimic + i),
      shapes,
      windup: windupOf(skill, 1),
      scales,
      cooldown: skill.cooldown,
      telegraph: skill.telegraph,
    });
  }
  return rows.sort((a, b) => Number(b.boss) - Number(a.boss) || Number(a.mimic) - Number(b.mimic) || largest(b) - largest(a));
}

export function largest(skill: AreaSkill): number {
  return Math.max(...skill.shapes.filter((s) => !s.line).map((s) => s.radius), 0);
}

/** 魔王改動前的倍率（設計者 2026-11-03 調整；只用來對照） */
const OLD_AREA = [1.5, 3] as const;

export function oldRadius(radius: number, floor: number, data: Pick<DataRegistry, 'balance'>): number {
  const { toFloor } = data.balance.difficulty.monsterBoost;
  const t = Math.min(1, Math.max(0, floor - 1) / Math.max(1, toFloor - 1));
  return radius * (OLD_AREA[0] + (OLD_AREA[1] - OLD_AREA[0]) * t);
}

/** 判定用的主角移速（Tile / 秒，沒有裝備加成） */
const RUN_SPEED = 4;
/** 判定用的站位：貼著施放者，離中心這麼遠 */
const MELEE_GAP = 1.5;
/** 比這更窄的扇形可以往旁邊閃，不判定跑不跑得掉 */
const DODGE_SIDEWAYS_DEG = 90;

export type AreaVerdict = 'ok' | 'noEscape' | 'blanket';

/**
 * 這個半徑合不合理：
 * blanket = 散落的招式把落點範圍鋪滿（平均每個位置被打中 1 次以上），躲不掉；
 * noEscape = 看到出招才跑，來不及跑出範圍（持續區域、窄扇形不判定）。
 */
export function judgeArea(shape: AreaShape, radius: number, windup: number): AreaVerdict {
  // 長條：往旁邊閃，走出半個寬度就好
  if (shape.line) return shape.line.width / 2 > RUN_SPEED * (windup + shape.delay) ? 'noEscape' : 'ok';
  if (shape.scatter > 0 && shape.repeat > 1) return shape.repeat * (radius / shape.scatter) ** 2 >= 1 ? 'blanket' : 'ok';
  if (shape.kind === 'zone' || shape.angleDeg < DODGE_SIDEWAYS_DEG) return 'ok';
  return radius > RUN_SPEED * (windup + shape.delay) + MELEE_GAP ? 'noEscape' : 'ok';
}

/** 這一層實際的半徑（和 SkillSystem.skillAreaScale 相同：整招看最大的範圍，放大到上限為止） */
export function currentRadius(skill: AreaSkill, shape: AreaShape, floor: number, data: Pick<DataRegistry, 'balance'>): number {
  if (!skill.scales || shape.line) return shape.radius;
  const { skillArea, bossSkillArea, bossSkillAreaCap } = scaleForFloor(floor, data.balance.difficulty);
  if (!skill.boss) return shape.radius * skillArea;
  return shape.radius * Math.max(1, Math.min(bossSkillArea, bossSkillAreaCap / largest(skill)));
}

/** 這一層的樓層倍率（還沒算上限） */
export function currentAreaScale(floor: number, boss: boolean, data: Pick<DataRegistry, 'balance'>): number {
  const scaling = scaleForFloor(floor, data.balance.difficulty);
  return boss ? scaling.bossSkillArea : scaling.skillArea;
}
