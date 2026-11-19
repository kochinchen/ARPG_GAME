import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createWorldWithMap, DT } from '../../game/helpers';
import type { Actor } from '../../../src/game/entities/Actor';
import { DamageEffect, SPELL_SPREAD } from '../../../src/game/skills/effects/DamageEffect';
import type { EffectContext } from '../../../src/game/skills/effects/IEffect';
import { combatCategory } from '../../../src/game/skills/skillCategory';
import { BUILDS, PRESET, setupCharacter } from '../sim/character';

/**
 * 除錯用：外系招式在 Combo 裡依等級轉換武器傷害 / 法術強度的各種版本，實際打木樁比較（OUT=輸出檔）。
 * 轉換只在這支腳本裡包住 DamageEffect 試算，遊戲本身沒有這個規則。
 * 木樁：防禦與抗性歸零、不會動；每組連段打 N 次取平均（每次打完等 6 秒讓持續傷害跑完）。
 * SEARCH=best：列出每個流派最強的純本系連段（當基準）；預設：各版本 × 代表連段。
 * VERSIONS=now,A：只跑指定版本；SPADD / PEN / WMULT：混合武器的假設（見 measure）。
 * RATIO=0.1,0.2,0.4,0.7,1：各等級的轉換比例；BUILDS、RANKS、N 可縮小範圍；CASES=a,b,c;d,e,f 加測指定連段（ONLY=1 只測這些）。
 */
const RATIO = (process.env.RATIO ?? '0.1,0.2,0.4,0.7,1').split(',').map(Number);
const N = Number(process.env.N ?? 40);

type Version = 'now' | 'A' | 'B' | 'C' | 'Ch' | 'D';
const VERSIONS: Version[] = (process.env.VERSIONS?.split(',') as Version[] | undefined) ?? ['now', 'A', 'B', 'C', 'Ch', 'D'];
const NATIVE = { sword: 'melee', axe: 'melee', bow: 'ranged', staff: 'magic' } as const;

let version: Version = 'now';
let player: Actor | null = null;
let native = 'melee';
let lookup: (id: string) => string | null = () => null;

/** 這一招的轉換比例（0 = 不轉換） */
function ratioFor(ctx: EffectContext): number {
  const combo = ctx.mods.combo;
  if (version === 'now' || !combo?.success || ctx.caster !== player) return 0;
  const foreign = (id: string) => {
    const c = lookup(id);
    return c !== null && c !== 'utility' && c !== native;
  };
  if (!foreign(ctx.skill.id)) return 0;
  const count = combo.skills.filter(foreign).length;
  const last = combo.step === 3;
  const base = RATIO[Math.min(Math.max(ctx.rank, 1), 5) - 1]!;
  switch (version) {
    case 'A': return count === 1 && last ? base : 0;
    case 'B': return count === 1 ? base : 0;
    case 'C': return count <= 2 ? base : 0;
    case 'Ch': return count <= 2 ? (last ? base : base / 2) : 0;
    case 'D': return base;
  }
}

const original = DamageEffect.prototype.apply;
DamageEffect.prototype.apply = function (def, ctx) {
  const ratio = def.scaling === 'spell' || def.scaling === 'weapon' ? ratioFor(ctx) : 0;
  if (ratio <= 0) return original.call(this, def, ctx);
  const stats = ctx.caster.stats;
  const get = stats.get.bind(stats);
  const weapon = (get('damageMin') + get('damageMax')) / 2;
  const sp = get('spellPower');
  const override = new Map<string, number>();
  if (def.scaling === 'spell' && weapon * ratio > sp) override.set('spellPower', weapon * ratio);
  if (def.scaling === 'weapon' && sp * ratio > weapon) {
    override.set('damageMin', sp * ratio * (1 - SPELL_SPREAD));
    override.set('damageMax', sp * ratio * (1 + SPELL_SPREAD));
  }
  if (override.size === 0) return original.call(this, def, ctx);
  stats.get = ((stat: Parameters<typeof get>[0]) => override.get(stat) ?? get(stat)) as typeof stats.get;
  try {
    original.call(this, def, ctx);
  } finally {
    stats.get = get;
  }
};

interface Case { label: string; steps: [string, string, string] }
const CASES: Record<string, Case[]> = {
  melee: [
    { label: '純近戰（碎甲）', steps: ['melee.armor_break', 'melee.heavy_slash', 'melee.heavy_slash'] },
    { label: '重砍→重砍→火球', steps: ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'] },
    { label: '突進斬→重砍→隕星', steps: ['melee.dash_slash', 'melee.heavy_slash', 'magic.meteor'] },
    { label: '火球→重砍→重砍', steps: ['magic.fireball', 'melee.heavy_slash', 'melee.heavy_slash'] },
    { label: '火球→冰球→重砍', steps: ['magic.fireball', 'magic.ice_orb', 'melee.heavy_slash'] },
    { label: '隕星→雷暴→快斬', steps: ['magic.meteor', 'magic.storm_core', 'melee.quick_slash'] },
    { label: '火球→火焰爆破→隕星', steps: ['magic.fireball', 'magic.flame_burst', 'magic.meteor'] },
  ],
  ranged: [
    { label: '純弓（穿透箭→散射→爆裂箭）', steps: ['ranged.piercing_shot', 'ranged.spread_shot', 'ranged.explosive_arrow'] },
    { label: '散射→散射→隕星', steps: ['ranged.spread_shot', 'ranged.spread_shot', 'magic.meteor'] },
    { label: '蓄力→蓄力→火球', steps: ['ranged.charge_shot', 'ranged.charge_shot', 'magic.fireball'] },
    { label: '連鎖閃電→散射→爆裂箭', steps: ['magic.chain_lightning', 'ranged.spread_shot', 'ranged.explosive_arrow'] },
    { label: '火球→冰球→蓄力射擊', steps: ['magic.fireball', 'magic.ice_orb', 'ranged.charge_shot'] },
    { label: '火球→火焰爆破→隕星', steps: ['magic.fireball', 'magic.flame_burst', 'magic.meteor'] },
  ],
  magic: [
    { label: '純法術（冰球→冰槍→冰霜新星）', steps: ['magic.ice_orb', 'magic.ice_lance', 'magic.frost_nova'] },
    { label: '純法術（火球→火焰爆破→隕星）', steps: ['magic.fireball', 'magic.flame_burst', 'magic.meteor'] },
    { label: '重砍→重砍→火球', steps: ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'] },
    { label: '火球→冰球→重砍', steps: ['magic.fireball', 'magic.ice_orb', 'melee.heavy_slash'] },
    { label: '火球→冰球→毀滅重擊', steps: ['magic.fireball', 'magic.ice_orb', 'melee.devastator'] },
    { label: '火球→重砍→重砍', steps: ['magic.fireball', 'melee.heavy_slash', 'melee.heavy_slash'] },
    { label: '破甲斬→重砍→重砍', steps: ['melee.armor_break', 'melee.heavy_slash', 'melee.heavy_slash'] },
  ],
};

/** 主角在左，木樁在右邊 3 格；三隻時另外兩隻緊貼在後 */
const ROWS = ['##################', '#................#', '#................#', '#S...............#', '#................#', '#................#', '##################'];
const DUMMY = 'enemy.skeleton';
const SPOTS: [number, number][] = [[4.5, 3.5], [5.3, 2.9], [5.3, 4.1]];

function measure(buildId: string, steps: readonly string[], foreignRank: number, targets: number, reps = N, settle = 6) {
  const build = BUILDS.find((b) => b.id === buildId)!;
  const { world, events, data } = createWorldWithMap(ROWS, SPOTS.slice(0, targets).map((at) => ({ enemyId: DUMMY, at })), { seed: 7 });
  (data.balance.weaponRules as Record<string, string[]>).staff = ['magic', 'utility', 'melee'];
  setupCharacter(world, data, 25, build, [], PRESET);
  const p = world.player;
  player = p;
  native = NATIVE[build.weapon as keyof typeof NATIVE];
  lookup = (id) => (data.skills.has(id) ? combatCategory(data.skills.get(id)) : null);
  for (const id of steps) p.skillRanks.set(id, lookup(id) === native ? 5 : foreignRank);
  p.stats.setBase('maxHp', 1e9);
  p.hp = 1e9;
  // 混合武器的假設（熔合法杖）：SPADD = 多帶的法術強度、PEN = 補回的法術傷害加成（劍斧弓內建 −0.2）、WMULT = 武器傷害倍率
  const spAdd = Number(process.env.SPADD ?? 0);
  const pen = Number(process.env.PEN ?? 0);
  const wMult = Number(process.env.WMULT ?? 1);
  if (spAdd !== 0 || pen !== 0 || wMult !== 1) {
    const raw = p.stats.get.bind(p.stats);
    p.stats.get = ((stat: Parameters<typeof raw>[0]) => {
      const v = raw(stat);
      if (stat === 'spellPower') return v + spAdd;
      if (stat === 'spellDamageBonus') return v + pen;
      if (stat === 'damageMin' || stat === 'damageMax') return v * wMult;
      return v;
    }) as typeof p.stats.get;
  }
  const dummies = world.actors.filter((a) => a.faction === 'enemy');
  for (const d of dummies) {
    (d as { ai: unknown }).ai = null;
    d.stats.setBase('maxHp', 1e12);
    d.hp = 1e12;
    for (const s of ['defense', 'fireResist', 'coldResist', 'lightningResist', 'poisonResist', 'physicalResist', 'stunResist', 'slowResist', 'knockbackResist'] as const) d.stats.setBase(s, 0);
    // DEF：木樁的防禦（第 25 層一般怪平均 44、第 30 層 63；元素抗性平均只有 1～4%，維持 0）
    d.stats.setBase('defense', Number(process.env.DEF ?? 0));
  }
  const home = { ...p.position };
  const spot = dummies.map((d) => ({ ...d.position }));
  let total = 0;
  const perStep = [0, 0, 0];
  events.on('ActorDamaged', (e) => {
    if (e.sourceId === p.id) total += e.amount;
  });
  events.on('SkillHit', (e) => {
    if (e.casterId === p.id && e.combo) perStep[e.combo.step - 1]! += e.amount;
  });
  const maxMana = p.stats.get('maxMana');
  let time = 0;
  let mana = 0;
  let done = 0;
  let rule = '';
  for (let i = 0; i < reps; i++) {
    // 還原位置與狀態（木樁被擊退、主角突進之後）
    p.position = { ...home };
    dummies.forEach((d, k) => {
      d.position = { ...spot[k]! };
      d.hp = 1e12;
    });
    p.cooldowns.clear();
    p.mana = maxMana;
    const r = world.combos.start(p, steps, dummies[0]!.id, dummies[0]!.position, false, 0);
    if (!r) break;
    rule = r.status === 'combo' ? r.rule.name : `不成立（${r.reason}）`;
    let t = 0;
    while ((world.combos.isRunning(p) || p.isCasting) && t < 20) {
      world.update(DT);
      t += DT;
    }
    time += t;
    mana += maxMana - p.mana;
    done++;
    // 等投射物、延遲效果、持續傷害結束
    for (let k = 0; k < settle / DT; k++) world.update(DT);
  }
  const n = Math.max(1, done);
  // 裝備的元素附加傷害（每一擊再打一次百分比）：所有版本都一樣乘上去，報表另外列出不含它的主要命中
  return { rule, total: total / n, perStep: perStep.map((v) => v / n), time: time / n, mana: mana / n, maxMana, weapon: (p.stats.get('damageMin') + p.stats.get('damageMax')) / 2, sp: p.stats.get('spellPower'), data };
}

it('crossdamage', () => {
  const lines: string[] = [];
  const builds = (process.env.BUILDS ?? 'melee,ranged,magic').split(',');
  const ranks = (process.env.RANKS ?? '5,3').split(',').map(Number);

  if (process.env.SEARCH === 'best') {
    // 每個流派最強的純本系連段（當作比較基準）
    for (const buildId of builds) {
      const build = BUILDS.find((b) => b.id === buildId)!;
      const probe = measure(buildId, [], 5, 1, 0);
      const own = probe.data.skills.all.filter((s) => s.tree?.category === build.category && s.kind !== 'passive').map((s) => s.id);
      const name = (id: string) => probe.data.skills.get(id).name;
      for (const targets of [1, 3]) {
        const rows: { steps: string[]; rule: string; total: number; time: number }[] = [];
        for (const a of own) for (const b of own) for (const c of own) {
          if (a === b && b === c) continue;
          const m = measure(buildId, [a, b, c], 5, targets, 2, 4);
          rows.push({ steps: [a, b, c], rule: m.rule, total: m.total, time: m.time });
        }
        rows.sort((x, y) => y.total - x.total);
        lines.push(`■ ${build.label}・木樁 ${targets} 隻：純本系連段前 8 名（每組總傷害）`);
        for (const r of rows.slice(0, 8)) lines.push(`${r.steps.map(name).join('→')}\t${r.rule}\t${Math.round(r.total)}\t${r.time.toFixed(2)} 秒\t${r.steps.join(',')}`);
        rows.sort((x, y) => y.total / y.time - x.total / x.time);
        lines.push('每秒傷害前 5 名');
        for (const r of rows.slice(0, 5)) lines.push(`${r.steps.map(name).join('→')}\t${r.rule}\t${Math.round(r.total / r.time)}／秒\t${r.time.toFixed(2)} 秒\t${r.steps.join(',')}`);
        lines.push('');
      }
    }
    writeFileSync(process.env.OUT!, lines.join('\n'));
    return;
  }

  if (process.env.SEARCH === 'pool') {
    // 指定技能池（POOL=id,id,…）的所有排列，在某個版本（VERSION）下的前幾名：找混合連段的上限
    const pool = process.env.POOL!.split(',');
    version = (process.env.VERSION ?? 'C') as Version;
    for (const buildId of builds) {
      const probe = measure(buildId, [], 5, 1, 0);
      const name = (id: string) => probe.data.skills.get(id).name;
      const foreignCount = (steps: string[]) => steps.filter((id) => { const c = combatCategory(probe.data.skills.get(id)); return c !== 'utility' && c !== NATIVE[BUILDS.find((b) => b.id === buildId)!.weapon as keyof typeof NATIVE]; }).length;
      for (const targets of [1, 3]) {
        const rows: { steps: string[]; rule: string; total: number; foreign: number }[] = [];
        for (const a of pool) for (const b of pool) for (const c of pool) {
          if (a === b && b === c) continue;
          const m = measure(buildId, [a, b, c], 5, targets, 3, 4);
          rows.push({ steps: [a, b, c], rule: m.rule, total: m.total, foreign: foreignCount([a, b, c]) });
        }
        rows.sort((x, y) => y.total - x.total);
        lines.push(`■ ${buildId}・版本 ${version}・木樁 ${targets} 隻・比例 ${RATIO.join('/')}：前 10 名`);
        for (const r of rows.slice(0, 10)) lines.push(`${r.steps.map(name).join('→')}\t${r.rule}\t外系 ${r.foreign} 招\t${Math.round(r.total)}\t${r.steps.join(',')}`);
        for (const k of [1, 2]) {
          const best = rows.find((r) => r.foreign === k && !r.rule.startsWith('不成立'));
          if (best) lines.push(`外系 ${k} 招最強：${best.steps.map(name).join('→')}\t${best.rule}\t${Math.round(best.total)}\t${best.steps.join(',')}`);
        }
        lines.push('');
      }
    }
    version = 'now';
    writeFileSync(process.env.OUT!, lines.join('\n'));
    return;
  }

  const extra = (process.env.CASES ?? '').split(';').filter(Boolean).map((s) => s.split(',') as [string, string, string]);
  const skillNames = new Map(measure('melee', [], 5, 1, 0).data.skills.all.map((s) => [s.id, s.name]));
  for (const buildId of builds) {
    const label = BUILDS.find((b) => b.id === buildId)!.label;
    const named = extra.map((steps) => ({ label: steps.map((id) => skillNames.get(id) ?? id).join('→'), steps }));
    const cases: Case[] = process.env.ONLY ? named : [...CASES[buildId]!, ...named];
    for (const rank of ranks) {
      for (const targets of [1, 3]) {
        lines.push(`■ ${label}・外系招式 ${rank} 級・木樁 ${targets} 隻・比例 ${RATIO.join('/')}`);
        lines.push(`連段\t規則\t${VERSIONS.join('\t')}\t連段秒數\t魔力（最大）\t各招主要命中（now）\t各招主要命中（D）`);
        for (const c of cases) {
          const row: number[] = [];
          let info: ReturnType<typeof measure> | null = null;
          let nowSteps = '';
          let dSteps = '';
          for (const v of VERSIONS) {
            version = v;
            const m = measure(buildId, c.steps, rank, targets);
            row.push(Math.round(m.total));
            info = m;
            if (v === 'now') nowSteps = m.perStep.map(Math.round).join(' / ');
            if (v === 'D') dSteps = m.perStep.map(Math.round).join(' / ');
          }
          lines.push(`${c.label}\t${info!.rule}\t${row.join('\t')}\t${info!.time.toFixed(2)}\t${Math.round(info!.mana)}（${Math.round(info!.maxMana)}）\t${nowSteps}\t${dSteps}`);
          if (c === cases[0] && targets === 1 && rank === ranks[0]) lines.push(`（武器平均 ${Math.round(info!.weapon)}、法術強度 ${Math.round(info!.sp)}）`);
        }
        lines.push('');
      }
    }
  }
  version = 'now';
  writeFileSync(process.env.OUT!, lines.join('\n'));
});
