import { stat, inc, flat, strongStat, line, strong, unique, mods, on, cond, at, restore, buff, arm, hit, area, status, rain, RANGED, MAGIC, FINISHER, type Def } from './parts';

/**
 * 擴充的傳奇 / 神話（ring）：橘 9 件、紅 4 件（紅對應每 5 層的魔王：墮落神官、墮落騎士、深淵魔王、深淵統御者）。
 * 橘分散在遠程、法術、近戰與通用玩法；多半取材自遇過的怪物（骷髏弓手、寒霜孢子體、火囊爬行者、單眼浮體、奪魂寄生花、暗影獵豹、鉤爪蟲）。
 */

const legendary: Def[] = [
  {
    id: 'legendary.ring_bone_archer',
    name: '骸弓之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '後撤射擊',
    lore: '骷髏弓手被逼近時總會後退一步——然後射得更準。',
    lines: [
      stat('rangedDamageBonus', 0.12, 0.16),
      inc('moveSpeed', 0.05, 0.07),
      stat('dodgeChance', 0.03, 0.05),
      stat('critChance', 0.05, 0.07),
      strong('後跳射擊傷害 +25%', mods({ skills: ['ranged.backstep_shot'] }, { damage: 0.25 })),
      unique(
        '施放後跳射擊後，下一個遠程技能傷害 +35%、穿透 +1（4 秒內有效）',
        on('cast', [arm('bone_archer', RANGED, { damage: 0.35, pierce: 1 }, 4)], { when: { skills: ['ranged.backstep_shot'] } }),
      ),
    ],
  },
  {
    id: 'legendary.ring_frost_spore',
    name: '霜孢之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '冰槍分裂',
    lore: '戒面上的冰藍蕈傘一碰就碎，碎片落地之前就已經結了霜。',
    minItemLevel: 4,
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      inc('maxMana', 0.1, 0.14),
      stat('coldResist', 0.1, 0.14),
      stat('castSpeed', 0.05, 0.07),
      strong('冰槍傷害 +25%', mods({ skills: ['magic.ice_lance'] }, { damage: 0.25 })),
      unique(
        '冰槍命中時炸出 3 顆冰霜孢子：每顆法術強度 40% 寒冰傷害，並緩速 30%（1.5 秒；冷卻 0.5 秒）',
        on(
          'hit',
          [at('target', 'magic', [{ type: 'projectile', speed: 7, radius: 0.2, range: 3.5, count: 3, spreadDeg: 360, onHit: [hit('cold', 0.4, 'spell'), status('slow', 1.5, 0.3)] }])],
          { when: { skills: ['magic.ice_lance'] }, cooldown: 0.5 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.ring_fire_sac',
    name: '火囊之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '延遲爆炸',
    lore: '火囊爬行者的囊袋乾了以後仍然溫熱，戴上它的手指偶爾會冒煙。',
    minItemLevel: 5,
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      stat('fireDamagePct', 0.08, 0.12),
      flat('manaRegen', 0.8, 1.2),
      stat('critChance', 0.05, 0.07),
      strong('火焰爆破傷害 +25%', mods({ skills: ['magic.flame_burst'] }, { damage: 0.25 })),
      unique(
        '火焰爆破每命中 3 次，在目標處留下火囊：1 秒後爆炸，半徑 2 格法術強度 60% 火焰傷害',
        on('hit', [at('target', 'magic', [{ type: 'delayed', delay: 1, effects: [area(2, [hit('fire', 0.6, 'spell')])] }])], { when: { skills: ['magic.flame_burst'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.ring_eye_spark',
    name: '雷眼之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '電擊連發',
    lore: '漂浮的眼球被封進戒面，它仍然盯著你視線所及的每一個敵人。',
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      stat('lightningResist', 0.1, 0.14),
      stat('castSpeed', 0.05, 0.07),
      inc('maxMana', 0.1, 0.14),
      strong('電擊傷害 +25%、投射物速度 +30%', mods({ skills: ['magic.spark'] }, { damage: 0.25, projectileSpeed: 0.3 })),
      unique(
        '電擊每命中 3 次射出閃電眼光：從目標彈跳到附近 2 名敵人（每次法術強度 60% 閃電傷害）',
        on('hit', [at('target', 'magic', [{ type: 'chain', jumps: 2, radius: 4, effects: [hit('lightning', 0.6, 'spell')] }])], { when: { skills: ['magic.spark'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.ring_soul_bloom',
    name: '寄生之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '牽制 / 纏繞',
    lore: '寄生花的根鬚纏在戒圈上，一旦發芽就不肯放開獵物。',
    minItemLevel: 6,
    lines: [
      stat('rangedDamageBonus', 0.12, 0.16),
      stat('poisonDamagePct', 0.08, 0.12),
      stat('critChance', 0.05, 0.07),
      inc('attackSpeed', 0.05, 0.07),
      strong('對緩速的敵人，遠程傷害 +20%', mods(RANGED, { vsStatus: { statuses: ['slow'], damage: 0.2 } })),
      unique(
        '牽制射擊命中時伸出藤蔓纏繞目標：暈眩 1 秒，並造成武器 40% 毒素傷害（冷卻 2 秒）',
        on('hit', [at('target', 'ranged', [hit('poison', 0.4), status('stun', 1)])], { when: { skills: ['ranged.pinning_shot'] }, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.ring_shadow_panther',
    name: '暗豹之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '閃避 / 撲殺',
    lore: '暗影獵豹從不正面迎擊，牠等的是獵物失手的那一瞬間。',
    minItemLevel: 5,
    lines: [
      stat('critChance', 0.06, 0.08),
      stat('critDamageBonus', 0.2, 0.26),
      inc('moveSpeed', 0.05, 0.07),
      inc('attackSpeed', 0.05, 0.07),
      strongStat('dodgeChance', 0.04, 0.06),
      unique('閃避時「撲殺」3 秒：暴擊傷害 +40%', on('dodge', [buff('shadow_panther', '撲殺', 1, 3, [{ stat: 'critDamageBonus', value: 0.4 }])])),
    ],
  },
  {
    id: 'legendary.ring_hook_claw',
    name: '鉤爪之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '多段破甲',
    lore: '鉤爪蟲的前肢被打磨成戒圈，內側的倒鉤仍然勾得住鎧甲的縫隙。',
    lines: [
      stat('meleeDamageBonus', 0.12, 0.16),
      inc('attackSpeed', 0.06, 0.08),
      stat('critChance', 0.05, 0.07),
      inc('maxHp', 0.08, 0.12),
      strong('劍刃旋舞傷害 +25%', mods({ skills: ['melee.blade_dance'] }, { damage: 0.25 })),
      unique(
        '多段類近戰技能每命中 4 次，撕開目標防禦：防禦 -20%（4 秒）',
        on('hit', [at('target', 'melee', [status('armorBreak', 4, 0.2)])], { when: { tags: ['MultiHit'], categories: ['melee'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.ring_skyward',
    name: '天穹之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '挑空連段',
    lore: '戒面刻著一道向上的弧——第一個把敵人挑上天的劍士留下的記號。',
    minItemLevel: 7,
    lines: [
      stat('meleeDamageBonus', 0.12, 0.16),
      stat('critDamageBonus', 0.2, 0.26),
      inc('attackSpeed', 0.05, 0.07),
      stat('critChance', 0.05, 0.07),
      strong('對浮空的敵人傷害 +20%', mods({}, { vsStatus: { statuses: ['airborne'], damage: 0.2 } })),
      unique(
        '挑空斬命中後，下一個 Combo 第三招暴擊率 +30%、傷害 +20%（5 秒內有效）',
        on('hit', [arm('skyward', FINISHER, { crit: 0.3, damage: 0.2 }, 5)], { when: { skills: ['melee.launch_slash'] }, cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'legendary.ring_chain_storm',
    name: '雷鏈之戒',
    rarity: 'legendary',
    kind: 'ring',
    role: '連鎖閃電',
    lore: '一圈銀絲纏著一圈銅絲，閃電在兩者之間來回奔跑。',
    minItemLevel: 6,
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      stat('lightningDamagePct', 0.08, 0.12),
      inc('maxMana', 0.1, 0.14),
      flat('manaRegen', 0.8, 1.2),
      strong('連鎖閃電彈跳 +2 次', mods({ skills: ['magic.chain_lightning'] }, { chainCount: 2 })),
      unique(
        '連鎖閃電暴擊時回復 3% 魔力，並使下一個閃電技能傷害 +30%（5 秒內有效，冷卻 1 秒）',
        on('crit', [restore({ mp: 0.03 }), arm('chain_storm', { elements: ['Lightning'] }, { damage: 0.3 }, 5)], { when: { skills: ['magic.chain_lightning'] }, cooldown: 1 }),
      ),
    ],
  },
];

const mythic: Def[] = [
  // B2 墮落神官：血焰彈（三發）、旋轉光束、狂信
  {
    id: 'mythic.ring_fallen_priest',
    name: '血禱之戒',
    rarity: 'mythic',
    kind: 'ring',
    role: '血焰彈 / 旋轉光束',
    lore: '背棄信仰的神官把禱詞刻在戒圈內側，每一個字都用血寫成。',
    minItemLevel: 10,
    lines: [
      stat('spellDamageBonus', 0.18, 0.22),
      stat('castSpeed', 0.08, 0.12),
      inc('maxMana', 0.18, 0.22),
      stat('critChance', 0.06, 0.08),
      stat('manaCostReduction', 0.08, 0.12),
      unique('火球一次射出 3 發', mods({ skills: ['magic.fireball'] }, { projectileCount: 2 })),
      unique(
        '以法術完成 Combo 時放出旋轉光束：6 波、每波向四周 4 道，每道法術強度 40% 火焰傷害（冷卻 5 秒）',
        on(
          'comboComplete',
          [
            at('self', 'magic', [
              { type: 'delayed', delay: 0, repeat: 6, interval: 0.2, spinDeg: 15, effects: [{ type: 'projectile', speed: 9, radius: 0.2, range: 6, count: 4, spreadDeg: 360, onHit: [hit('fire', 0.4, 'spell')] }] },
            ]),
          ],
          { when: MAGIC, cooldown: 5 },
        ),
      ),
      unique(
        '施放火系技能時「狂信」+1 層（最多 5 層、6 秒）：每層法術傷害 +4%、施法速度 +2%',
        on('cast', [buff('fanatic', '狂信', 5, 6, [{ stat: 'spellDamageBonus', value: 0.04 }, { stat: 'castSpeed', value: 0.02 }])], { when: { elements: ['Fire'] } }),
      ),
    ],
  },
  // B4 墮落騎士：劍上依序附魔火焰、寒冰、雷霆
  {
    id: 'mythic.ring_fallen_knight',
    name: '墮騎之戒',
    rarity: 'mythic',
    kind: 'ring',
    role: 'Q / W / E 三元素附魔',
    lore: '騎士墮落時，劍上的三種光一一亮起，最後一道是雷。',
    minItemLevel: 20,
    lines: [
      stat('damageBonus', 0.16, 0.2),
      stat('critChance', 0.07, 0.09),
      inc('attackSpeed', 0.08, 0.12),
      inc('maxHp', 0.16, 0.2),
      line('Combo 第三段傷害 +15%', mods(FINISHER, { damage: 0.15 })),
      unique(
        'Q 的 Combo 完成後「烈焰附魔」10 秒：火焰附加傷害 +15%',
        on('comboComplete', [buff('fk_fire', '烈焰附魔', 1, 10, [{ stat: 'fireDamagePct', value: 0.15 }])], { when: { comboSlot: 0 } }),
      ),
      unique(
        'W 的 Combo 完成後「寒冰附魔」10 秒：寒冰附加傷害 +15%；附魔期間命中時 25% 機率緩速目標 30%（1.5 秒）',
        on('comboComplete', [buff('fk_ice', '寒冰附魔', 1, 10, [{ stat: 'coldDamagePct', value: 0.15 }])], { when: { comboSlot: 1 } }),
        on('hit', [at('target', 'melee', [status('slow', 1.5, 0.3)])], { chance: 0.25, requireBuff: { id: 'fk_ice', atLeast: 1 } }),
      ),
      unique(
        'E 的 Combo 完成後「雷霆附魔」10 秒：閃電附加傷害 +15%；附魔期間 Combo 第三招命中時，對目標周圍 2 格造成該擊 30% 閃電傷害（冷卻 1 秒）',
        on('comboComplete', [buff('fk_bolt', '雷霆附魔', 1, 10, [{ stat: 'lightningDamagePct', value: 0.15 }])], { when: { comboSlot: 2 } }),
        on('hit', [at('target', 'magic', [area(2, [hit('lightning')])], 0.3)], { when: FINISHER, requireBuff: { id: 'fk_bolt', atLeast: 1 }, cooldown: 1 }),
      ),
    ],
  },
  // B6 深淵魔王：多段重擊、天降火雨、深淵覺醒
  {
    id: 'mythic.ring_abyss_lord',
    name: '魔王之戒',
    rarity: 'mythic',
    kind: 'ring',
    role: '重擊火雨 / 擊殺疊層',
    lore: '深淵魔王的指環，戴上它的人會聽見翅膀在背後展開的聲音。',
    minItemLevel: 30,
    lines: [
      stat('damageBonus', 0.18, 0.22),
      stat('critChance', 0.07, 0.09),
      inc('maxHp', 0.18, 0.22),
      stat('fireDamagePct', 0.12, 0.16),
      stat('critDamageBonus', 0.25, 0.3),
      unique(
        '重擊類技能命中時降下火雨：目標周圍 6 次，每次造成該擊 25% 火焰傷害（冷卻 3 秒）',
        on('hit', [at('target', 'magic', [rain(6, 2.5, 1.4, 'fire', 1)], 0.25)], { when: { tags: ['Heavy'] }, cooldown: 3 }),
      ),
      unique('多段類技能傷害 +25%', mods({ tags: ['MultiHit'] }, { damage: 0.25 })),
      unique('擊殺時「魔王」+1 層（最多 10 層、8 秒）：每層所有傷害 +2%', on('kill', [buff('abyss_lord_ring', '魔王', 10, 8, [{ stat: 'damageBonus', value: 0.02 }])])),
    ],
  },
  // B7 深淵統御者：盾 → 劍 → 魔力暴走的三個階段
  {
    id: 'mythic.ring_abyss_sovereign',
    name: '統御之戒',
    rarity: 'mythic',
    kind: 'ring',
    role: '依生命轉換的三階段',
    lore: '盾碎了就用劍，劍斷了就用魔力——統御者從不承認失敗。',
    minItemLevel: 35,
    lines: [
      stat('damageBonus', 0.18, 0.22),
      inc('maxHp', 0.2, 0.24),
      inc('maxMana', 0.18, 0.22),
      stat('critChance', 0.07, 0.09),
      stat('damageReduction', 0.04, 0.06),
      unique('生命高於 70% 時（盾）：受到傷害 -12%、格擋率 +8%', cond({ hpAbove: 0.7 }, [{ stat: 'damageReduction', value: 0.12 }, { stat: 'blockChance', value: 0.08 }])),
      unique(
        '生命低於 70% 時（劍）：近戰傷害 +25%、攻擊速度 +15%',
        cond({ hpBelow: 0.7 }, [{ stat: 'meleeDamageBonus', value: 0.25 }, { stat: 'attackSpeed', modifier: 'increased', value: 0.15 }]),
      ),
      unique('生命低於 35% 時（魔力暴走）：法術傷害 +35%、魔力消耗 -30%', cond({ hpBelow: 0.35 }, [{ stat: 'spellDamageBonus', value: 0.35 }, { stat: 'manaCostReduction', value: 0.3 }])),
    ],
  },
];

export const ringItems: Def[] = [...legendary, ...mythic];
