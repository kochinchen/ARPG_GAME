import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { rankRange, type Element } from '../../../src/data/schema/common';
import { mitigationMultiplier } from '../../../src/game/combat/DamagePipeline';
import { DamageEffect } from '../../../src/game/skills/effects/DamageEffect';
import type { StatId } from '../../../src/data/schema/common';
import { Bot, type Persona } from '../sim/bot';
import { BUILDS, setupCharacter, type Preset } from '../sim/character';
import { applySave, loadSave } from '../sim/fromSave';
import { data, makeWorld, xpTable } from '../sim/run';

const DT = 1 / 60;

// LOG=40：記下打在牠身上的前 40 下（哪一招、傷害、有沒有暴擊、牠有沒有被標記）；裝備觸發的那幾下多記「基礎值」
// （= 觸發那一擊 × 說明上的比例），用來對照「說明寫 X%、實際打出多少」
let procBase = 0;
if (process.env.LOG) {
  const inner = DamageEffect.prototype.apply;
  DamageEffect.prototype.apply = function (def, ctx) {
    if (ctx.skill.id.startsWith('item.') && def.scaling === 'flat' && def.base) procBase = rankRange(def.base, ctx.rank)[0];
    return inner.call(this, def, ctx);
  };
}
// 假設測試 LANCE1=1：冰槍每次只有一支（單挑時等於「同一個目標一次只吃一支」）
if (process.env.LANCE1 === '1') {
  const lance = data.skills.get('magic.ice_lance').effects[0] as unknown as { count: number[] };
  lance.count = lance.count.map(() => 1);
}

/**
 * 除錯用：存檔角色單挑一隻怪（預設隱藏魔王萬骸之口），量打倒牠要幾秒、過程中受了多少傷（OUT=輸出檔，一行一筆 JSON，用附加的）。
 * SAVE=存檔路徑、F=樓層（怪物的倍率與減傷照這一層）、ENEMY=怪物 ID、P=機器人、SEEDS=跑幾個種子、T=秒數上限、LABEL。
 * ELEMENTS=fire,cold：隱藏魔王這次抽到的屬性。ELITE=1：精英版。
 * 沒給 SAVE 時用預設角色：B=melee|ranged|magic、LV=等級、R=稀有度（預設 epic，鑲滿黃核）、物品等級 = 樓層。
 * 假設測試：HPX=2 生命乘幾倍；RES=0.3 火冰電抗性再加多少；DMGX=1.5 傷害乘幾倍；PEN=0.5 無視主角這麼多比例的防禦（只算物理）；
 *   STATS=castSpeed:-0.5,critChance:-0.3 主角的屬性加減（看哪一項撐起輸出）；UNEQUIP=amulet 脫掉某個部位。
 *   LANCE1=1：冰槍每次一支。LOG=80：記下打在牠身上的前 80 下（裝備觸發的那幾下多記基礎值）。
 *   量純輸出：ENEMY=enemy.training_dummy HPX=5000 T=20（不會動、不會反擊的木樁，打滿 T 秒）。
 * 怪放在樓梯口旁邊；本層其他怪物先拿掉（KEEP=1 保留），量到的才是單挑。
 */
it('duel', () => {
  const save = process.env.SAVE ? loadSave(process.env.SAVE, data) : null;
  const floor = Number(process.env.F ?? save?.data.floor.current ?? 20);
  const build = save?.build ?? BUILDS.find((b) => b.id === (process.env.B ?? 'magic'))!;
  const preset: Preset = { level: Number(process.env.LV ?? 30), itemLevel: floor, rarity: (process.env.R ?? 'epic') as Preset['rarity'] };
  const statTweaks = (process.env.STATS ?? '').split(',').filter(Boolean).map((t) => t.split(':') as [StatId, string]);
  const enemyId = process.env.ENEMY ?? 'enemy.bone_dragon';
  const persona = (process.env.P ?? 'kiter') as Persona;
  const seeds = Number(process.env.SEEDS ?? 3);
  const maxTime = Number(process.env.T ?? 300);
  const label = process.env.LABEL ?? 'now';
  const hpX = Number(process.env.HPX ?? 1);
  const dmgX = Number(process.env.DMGX ?? 1);
  const extraResist = Number(process.env.RES ?? 0);
  const pen = Number(process.env.PEN ?? 0);
  const elements = (process.env.ELEMENTS ?? 'fire,cold').split(',') as Element[];
  for (let s = 0; s < seeds; s++) {
    const seed = 1000 + floor * 17 + s * 7919;
    const { world, commands, events } = save ? makeWorld(1, save.data.meta.runSeed) : makeWorld(floor, seed);
    if (save) applySave(world, data, save.data, floor, seed);
    else setupCharacter(world, data, floor, build, xpTable(), preset);
    const player = world.player;
    for (const [stat, value] of statTweaks) player.stats.addModifier({ stat, kind: 'flat', value: Number(value), source: 'whatIf' });
    // UNEQUIP=amulet,ring2：脫掉這些部位（看某一件裝備撐起多少輸出）
    for (const slot of (process.env.UNEQUIP ?? '').split(',').filter(Boolean)) world.equipment.unequip(slot as Parameters<typeof world.equipment.unequip>[0]);
    // 樓梯口附近找一塊放得下的空地
    let spot = vec2(player.position.x + 6, player.position.y);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const p = vec2(player.position.x + Math.cos(angle) * 6, player.position.y + Math.sin(angle) * 6);
      if (world.nav.isClearAt(p, 1.2) && world.nav.hasLineOfSight(player.position, p, 0.5)) {
        spot = p;
        break;
      }
    }
    // 本層其他怪物先拿掉（預設）：不然打久了牠們會被引過來，量到的就不是單挑。KEEP=1 保留
    if (process.env.KEEP !== '1') {
      for (let i = world.actors.length - 1; i >= 0; i--) if (world.actors[i]!.faction === 'enemy') world.actors.splice(i, 1);
    }
    const foe = world.spawnScaledEnemy(enemyId, floor, spot, data.enemies.get(enemyId).boss ? elements : null, process.env.ELITE === '1');
    if (hpX !== 1) {
      foe.stats.addModifier({ stat: 'maxHp', kind: 'more', value: hpX - 1, source: 'whatIf' });
      foe.hp = foe.maxHp;
    }
    if (dmgX !== 1) foe.stats.addModifier({ stat: 'damageBonus', kind: 'flat', value: (dmgX - 1) * (1 + foe.stats.get('damageBonus')), source: 'whatIf' });
    if (extraResist > 0) for (const stat of ['fireResist', 'coldResist', 'lightningResist'] as const) foe.stats.addModifier({ stat, kind: 'flat', value: extraResist, source: 'whatIf' });
    if (pen > 0) player.stats.addModifier({ stat: 'defense', kind: 'more', value: -pen, source: 'whatIf' });
    const foeHp = foe.maxHp;
    let taken = 0;
    let dealt = 0;
    let potions = 0;
    let deaths = 0;
    let minHp = 1;
    let lowMana = 0;
    const takenBy: Record<string, number> = {};
    const dealtBy: Record<string, number> = {};
    events.on('ActorDamaged', (e) => {
      if (e.targetId === player.id) {
        taken += e.amount / player.maxHp;
        const source = e.sourceId === null ? undefined : world.actors.find((a) => a.id === e.sourceId);
        const key = `${source?.cast?.skill.name ?? '持續傷害'}・${e.element}`;
        takenBy[key] = (takenBy[key] ?? 0) + e.amount / player.maxHp;
      } else if (e.targetId === foe.id) {
        dealt += e.amount;
        dealtBy[e.element] = (dealtBy[e.element] ?? 0) + e.amount;
      }
    });
    // 每一招打在牠身上的主要傷害（不含元素附加、持續傷害）：次數、平均、最大、暴擊次數
    const bySkill: Record<string, { hits: number; total: number; max: number; crits: number }> = {};
    const casts: Record<string, number> = {};
    const log: string[] = [];
    const logMax = Number(process.env.LOG ?? 0);
    events.on('SkillHit', (e) => {
      if (e.casterId !== player.id || e.targetId !== foe.id) return;
      // 裝備效果觸發的招式不在技能表裡：直接用 ID
      const name = data.skills.has(e.skillId) ? data.skills.get(e.skillId).name : e.skillId;
      if (log.length < logMax) {
        const proc = e.skillId.startsWith('item.');
        log.push(`${world.playTime.toFixed(2)}s ${name} ${e.amount}${e.isCrit ? ' 暴擊' : ''}${foe.hasStatus('marked') ? ' 標記中' : ''}${proc ? `（基礎值 ${procBase.toFixed(1)}，實際 ÷ 基礎 = ${(e.amount / procBase).toFixed(2)}）` : ''}`);
      }
      const k = (bySkill[name] ??= { hits: 0, total: 0, max: 0, crits: 0 });
      k.hits++;
      k.total += e.amount;
      k.max = Math.max(k.max, e.amount);
      if (e.isCrit) k.crits++;
    });
    events.on('SkillCast', (e) => {
      if (e.actorId !== player.id) return;
      const name = data.skills.has(e.skillId) ? data.skills.get(e.skillId).name : e.skillId;
      casts[name] = (casts[name] ?? 0) + 1;
    });
    events.on('PotionUsed', () => potions++);
    events.on('ActorDied', (e) => {
      if (e.actorId === player.id) deaths++;
    });
    const bot = new Bot(world, commands, build, persona, new Rng(seed).fork('bot'));
    const startedAt = world.playTime;
    let firstHit: number | null = null;
    for (let t = 0; t < maxTime * 60 && foe.alive && deaths === 0; t++) {
      bot.update(DT);
      world.update(DT);
      if (firstHit === null && dealt > 0) firstHit = world.playTime;
      minHp = Math.min(minHp, player.hp / player.maxHp);
      if (player.mana / player.maxMana < 0.15) lowMana++;
    }
    const time = world.playTime - startedAt;
    const fight = firstHit === null ? 0 : world.playTime - firstHit;
    const top = (o: Record<string, number>, n: number, digits: number) =>
      Object.entries(o)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => `${k} ${v.toFixed(digits)}`);
    appendFileSync(
      process.env.OUT!,
      `${JSON.stringify({ label, who: save ? 'save' : `${build.id}@${preset.rarity} Lv${world.progress.level}`, sp: Math.round(player.stats.get('spellPower')), weapon: Math.round((player.stats.get('damageMin') + player.stats.get('damageMax')) / 2), enemy: data.enemies.get(enemyId).name, floor, persona, seed, foeHp: Math.round(foeHp), killed: !foe.alive, deaths, time: +time.toFixed(1), fight: +fight.toFixed(1), dps: fight > 0 ? Math.round(dealt / fight) : 0, taken: +taken.toFixed(2), minHp: +minHp.toFixed(2), potions, lowManaSec: +(lowMana / 60).toFixed(1), dealtBy: top(dealtBy, 4, 0), takenBy: top(takenBy, 5, 2), casts, ...(logMax ? { foeLightning: +mitigationMultiplier(foe, 'lightning', 0, data.balance).toFixed(3), foePhysical: +mitigationMultiplier(foe, 'physical', 0, data.balance).toFixed(3), log } : {}), skills: Object.fromEntries(Object.entries(bySkill).map(([k, v]) => [k, `${v.hits} 下、共 ${Math.round(v.total)}、平均 ${Math.round(v.total / v.hits)}、最大 ${Math.round(v.max)}、暴擊 ${v.crits}`])) })}\n`,
    );
  }
});
