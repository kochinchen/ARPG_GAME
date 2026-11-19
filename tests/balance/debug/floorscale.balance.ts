import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import type { Persona } from '../sim/bot';
import { BUILDS } from '../sim/character';
import { loadSave } from '../sim/fromSave';
import { xpToNext } from '../../../src/game/progression/ExperienceSystem';
import { data, runFloor, xpTable } from '../sim/run';

/**
 * 除錯用：經驗下修、怪物強度改成等比成長的假設測試（OUT=輸出檔，一行一筆 JSON，用附加的）。
 * XPSCALE=0.5：怪物經驗的倍率（角色到這一層的等級跟著變低）。
 * HPR / DMGR=1.12：從 ANCHOR 層起，怪物生命 / 傷害改成每層乘上這個比例（ANCHOR 層以前照現況）；0 = 照現況。
 * GEAR=epic：改用「跟得上樓層的好裝備」角色（全紫裝、每個孔鑲黃核，物品等級 = 樓層，等級照經驗倍率推算）；
 *   沒指定時是快照角色（藍黃為主、沒有熔核），第 10 層以後撐不住，只適合看前期。
 * SAVE=存檔路徑：改用實際存檔的角色（BUILDS、GEAR、XPSCALE 不適用）。
 * RES_PER=0.02：一般怪從 RES_START 層（預設 10）起，每層對「隨機一種元素」多這麼多抗性，上限 RES_MAX；
 *   精英與首領抽兩種不同的元素（RES_ELITE=1 改成一種）；魔王不動（原本就有樓層減傷）。元素在火、冰、電之中抽。
 * AI 的假設測試：CD_SPEED=1.67 怪物的技能冷卻走得快這麼多倍（1.67 = 冷卻剩六成，出招更頻繁）；
 *   DODGE / DODGE_CD 閃避投射物的機率與間隔。
 * 2026-11-19 起，等比成長（balance.difficulty.geometric）、隨機元素抗性（elementResist）與經驗減半已經在遊戲裡：
 *   HPR / DMGR 是「改成另一組比例」、RES_PER 是「再多加」、XPSCALE 是「再乘」。
 * FLOORS、BUILDS、PERSONA、SEED、LABEL 可指定範圍與標籤。
 */
it('floorscale', () => {
  const floors = (process.env.FLOORS ?? '4,9,14,19,24,29,10,20,30').split(',').map(Number);
  const builds = (process.env.BUILDS ?? 'melee,ranged,magic').split(',');
  const xpScale = Number(process.env.XPSCALE ?? 1);
  const hpRatio = Number(process.env.HPR ?? 0);
  const dmgRatio = Number(process.env.DMGR ?? 0);
  const anchor = Number(process.env.ANCHOR ?? 1);
  const label = process.env.LABEL ?? 'now';
  const persona = (process.env.PERSONA ?? 'normal') as Persona;
  const seed = Number(process.env.SEED ?? 1);
  const difficulty = data.balance.difficulty;
  const gear = process.env.GEAR;
  const save = process.env.SAVE ? loadSave(process.env.SAVE, data) : undefined;
  const resPer = Number(process.env.RES_PER ?? 0);
  const resStart = Number(process.env.RES_START ?? 10);
  const resMax = Number(process.env.RES_MAX ?? 0.75);
  const resElite = Number(process.env.RES_ELITE ?? 2);
  const RES_STATS = ['fireResist', 'coldResist', 'lightningResist'] as const;
  const cdSpeed = Number(process.env.CD_SPEED ?? 1);
  // DODGE=0.8：怪物閃避投射物的機率（現況第 1 層 20%、第 30 層 45%）；DODGE_CD=0.75：兩次閃避的間隔秒數（現況 1.5）
  if (process.env.DODGE) {
    const dodge = data.balance.enemyTactics.dodge as { chance: [number, number]; cooldown: number };
    dodge.chance = [Number(process.env.DODGE), Number(process.env.DODGE)];
    if (process.env.DODGE_CD) dodge.cooldown = Number(process.env.DODGE_CD);
  }
  /** 照經驗倍率推算到這一層的等級（每層殺 85%） */
  const levelAt = (floor: number) => {
    let left = xpTable().slice(1, floor).reduce((s, v) => s + v, 0) * 0.85 * xpScale;
    let l = 1;
    while (l < data.balance.maxLevel && left >= xpToNext(l, data.balance)) left -= xpToNext(l++, data.balance);
    return l;
  };
  for (const b of save ? ['save'] : builds) {
    const build = save?.build ?? BUILDS.find((x) => x.id === b)!;
    for (const floor of floors) {
      const cur = scaleForFloor(floor, difficulty);
      const at = scaleForFloor(anchor, difficulty);
      const hpMult = hpRatio > 0 && floor > anchor ? (at.hp * hpRatio ** (floor - anchor)) / cur.hp : 1;
      const dmgMult = dmgRatio > 0 && floor > anchor ? (at.damage * dmgRatio ** (floor - anchor)) / cur.damage : 1;
      const resist = resPer > 0 && floor >= resStart ? Math.min(resMax, resPer * (floor - resStart + 1)) : 0;
      const r = runFloor({
        floor,
        build,
        persona,
        seed,
        xpScale,
        ...(gear === 'epic' ? { preset: { level: levelAt(floor), itemLevel: floor, rarity: 'epic' as const } } : {}),
        ...(save ? { save } : {}),
        tweak: (world) => {
          if (cdSpeed !== 1) {
            // 每個 Tick 之後把怪物的冷卻再多扣一點：等於冷卻時間除以 cdSpeed
            const update = world.update.bind(world);
            world.update = (dt: number) => {
              update(dt);
              for (const a of world.actors) {
                if (a.faction !== 'enemy' || a.cooldowns.size === 0) continue;
                for (const [skill, left] of a.cooldowns) if (left > 0) a.cooldowns.set(skill, left - dt * (cdSpeed - 1));
              }
            };
          }
          if (resist > 0) {
            for (const a of world.actors) {
              if (a.faction !== 'enemy' || a.device || a.isBoss || a.miniBoss) continue;
              // 每隻怪抽到的元素固定（由種子與編號決定），同一組設定重跑結果相同
              const h = (Math.imul(a.id + 1, 2654435761) ^ Math.imul(seed + 7, 40503)) >>> 0;
              const first = h % 3;
              const picks = (a.elite || a.name.startsWith('首領')) && resElite >= 2 ? [first, (first + 1 + ((h >>> 8) % 2)) % 3] : [first];
              for (const i of picks) a.stats.addModifier({ stat: RES_STATS[i]!, kind: 'flat', value: resist, source: 'whatIf' });
            }
          }
          if (hpMult === 1 && dmgMult === 1) return;
          for (const a of world.actors) {
            if (a.faction !== 'enemy' || a.device) continue;
            if (hpMult !== 1) {
              a.stats.addModifier({ stat: 'maxHp', kind: 'more', value: hpMult - 1, source: 'whatIf' });
              a.hp = a.maxHp;
            }
            if (dmgMult !== 1) a.stats.addModifier({ stat: 'damageBonus', kind: 'flat', value: (dmgMult - 1) * (1 + a.stats.get('damageBonus')), source: 'whatIf' });
          }
        },
      });
      const taken = Object.values(r.damageBy).reduce((s, v) => s + v, 0);
      // 傷害來源分成近戰怪 / 遠程怪（EnemyDef 有保持距離的算遠程）/ 其他（持續傷害、魔王等找不到名字的）
      const by = { melee: 0, ranged: 0, other: 0 };
      for (const [key, v] of Object.entries(r.damageBy)) {
        const def = data.enemies.all.find((e) => e.name === key.split('・')[0]);
        by[!def ? 'other' : def.keepDistance > 0 ? 'ranged' : 'melee'] += v;
      }
      const top = Object.entries(r.damageBy).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(2)}`);
      appendFileSync(process.env.OUT!, `${JSON.stringify({ label, gear: gear ?? 'snapshot', xpScale, hpMult: +hpMult.toFixed(3), dmgMult: +dmgMult.toFixed(3), resist: +resist.toFixed(3), persona, seed, floor, build: b, level: r.level, bossFloor: r.bossFloor, cleared: r.cleared, timedOut: r.timedOut, deaths: r.deaths, time: Math.round(r.time), kills: r.kills, potions: r.potions, minHpPct: +r.minHpPct.toFixed(2), taken: +taken.toFixed(2), killer: r.killer, stuck: r.stuck, by, top })}\n`);
    }
  }
});
