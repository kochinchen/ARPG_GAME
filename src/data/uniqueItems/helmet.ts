import { stat, inc, strong, unique, mods, on, cond, at, buff, arm, hit, area, status, rain, MELEE, MAGIC, FINISHER, type Def } from './parts';

/**
 * 擴充的傳奇 / 神話（頭盔）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）
 * - 橘（怪物靈感）：骨咒法冠（骷髏法師）、獨眼頭盔（單眼浮體）、心靈頭冠（腦海浮體）、影豹頭盔（暗影獵豹）、
 *   弓骸頭巾（骷髏弓手）、鐵骸頭盔（重甲骷髏）、霜蕈頭盔（寒霜孢子體）；其他：指揮官頭盔（Combo 第 2 → 3 段）、餘燼頭盔（火系擊殺留火）
 * - 紅：墓守頭盔（B1 墓穴守衛）、墮神之冠（B2 墮落神官）、墮落騎士盔（B4 墮落騎士）、深淵魔冠（B6 深淵魔王）
 */

const legendary: Def[] = [
  {
    id: 'legendary.helmet_bone_mage',
    name: '骨咒法冠',
    rarity: 'legendary',
    kind: 'helmet',
    role: '冰火交替施法',
    lore: '骷髏法師的頭骨裡還燒著半團火、凍著半團冰，誰也不肯讓誰。',
    minItemLevel: 2,
    main: [2.2, 2.4],
    lines: [
      stat('spellDamageBonus', 0.08, 0.12),
      inc('maxMana', 0.1, 0.14),
      stat('coldResist', 0.13, 0.17),
      strong('火系與冰系技能施法速度 +12%', mods({ elements: ['Fire', 'Ice'] }, { castSpeed: 0.12 })),
      unique(
        '火系技能命中後，下一個冰系技能傷害 +35%；冰系技能命中後，下一個火系技能傷害 +35%（各冷卻 1 秒）',
        on('hit', [arm('bone_mage_ice', { elements: ['Ice'] }, { damage: 0.35 }, 5)], { when: { elements: ['Fire'] }, cooldown: 1 }),
        on('hit', [arm('bone_mage_fire', { elements: ['Fire'] }, { damage: 0.35 }, 5)], { when: { elements: ['Ice'] }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_cyclops',
    name: '獨眼頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '電擊連射',
    lore: '面甲中央只有一道縫，縫後那隻眼睛會自己尋找下一個目標。',
    minItemLevel: 7,
    main: [2.2, 2.4],
    lines: [
      stat('lightningDamagePct', 0.08, 0.12),
      stat('castSpeed', 0.06, 0.1),
      stat('lightningResist', 0.18, 0.22),
      strong('電擊傷害 +25%、投射物速度 +30%', mods({ skills: ['magic.spark'] }, { damage: 0.25, projectileSpeed: 0.3 })),
      unique(
        '電擊每命中 4 次，從目標射出眼光：連鎖閃電彈跳 2 次（每次該擊 50% 傷害）',
        on('hit', [at('target', 'magic', [{ type: 'chain', jumps: 2, radius: 4, effects: [hit('lightning', 1, 'spell')] }], 0.5)], { when: { skills: ['magic.spark'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_mind',
    name: '心靈頭冠',
    rarity: 'legendary',
    kind: 'helmet',
    role: '法術控場',
    lore: '腦海浮體的神經纏成的頭冠，戴久了會聽見敵人在想什麼——然後讓他們停下來。',
    minItemLevel: 8,
    main: [2.3, 2.5],
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      inc('maxMana', 0.12, 0.16),
      stat('stunResist', 0.1, 0.14),
      strong('對暈眩或冰凍的敵人傷害 +20%', mods({}, { vsStatus: { statuses: ['stun', 'freeze'], damage: 0.2 } })),
      unique(
        '魔法技能命中時 12% 機率發出心靈衝擊：目標周圍 1.5 格的敵人暈眩 1 秒（冷卻 3 秒）',
        on('hit', [at('target', 'magic', [area(1.5, [status('stun', 1)])])], { when: MAGIC, chance: 0.12, cooldown: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_shadow_panther',
    name: '影豹頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '突進暴擊',
    lore: '暗影獵豹的頭骨製成，撲出去的那一瞬間，視野會變得異常清晰。',
    minItemLevel: 5,
    main: [2.3, 2.5],
    lines: [
      stat('critChance', 0.04, 0.06),
      inc('moveSpeed', 0.07, 0.09),
      stat('critDamageBonus', 0.13, 0.17),
      strong('突進類技能（Advance）傷害 +25%', mods({ tags: ['Advance'] }, { damage: 0.25 })),
      unique(
        '施放突進斬後，下一個近戰技能暴擊率 +25%（4 秒內）',
        on('cast', [arm('shadow_panther', MELEE, { crit: 0.25 }, 4)], { when: { skills: ['melee.dash_slash'] } }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_bone_archer',
    name: '弓骸頭巾',
    rarity: 'legendary',
    kind: 'helmet',
    role: '後撤射擊',
    lore: '骷髏弓手從不讓人靠近，這條頭巾記得每一次後退的步伐。',
    minItemLevel: 3,
    main: [2.2, 2.4],
    lines: [
      stat('rangedDamageBonus', 0.1, 0.14),
      stat('dodgeChance', 0.03, 0.05),
      inc('moveSpeed', 0.07, 0.09),
      strong('後退類技能（Retreat）傷害 +30%', mods({ tags: ['Retreat'] }, { damage: 0.3 })),
      unique(
        '後退類技能命中時「退射」+1 層（最多 3 層、5 秒）：每層移動速度 +5%、遠程傷害 +6%',
        on(
          'hit',
          [buff('bone_archer', '退射', 3, 5, [{ stat: 'moveSpeed', modifier: 'increased', value: 0.05 }, { stat: 'rangedDamageBonus', value: 0.06 }])],
          { when: { tags: ['Retreat'] }, cooldown: 0.3 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.helmet_iron_skull',
    name: '鐵骸頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '重擊防守',
    lore: '重甲骷髏的頭盔，即使主人散成一地白骨，它依然擋在最前面。',
    minItemLevel: 3,
    main: [2.6, 2.8],
    lines: [
      inc('defense', 0.13, 0.17),
      inc('maxHp', 0.08, 0.12),
      stat('knockbackResist', 0.1, 0.14),
      strong('重擊類技能攻擊速度 +15%', mods({ tags: ['Heavy'], categories: ['melee'] }, { attackSpeed: 0.15 })),
      unique(
        '施放近戰重擊類技能時獲得格擋：下一次受到的傷害 -25%（冷卻 3 秒）',
        on('cast', [at('self', 'melee', [status('guard', 4, 0.25, { target: 'self' })])], { when: { tags: ['Heavy'], categories: ['melee'] }, cooldown: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_frost_spore',
    name: '霜蕈頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '冰系擴散',
    lore: '冰藍的菌傘長在盔頂，主人每施一次寒冰，它就噴出一陣孢子。',
    minItemLevel: 7,
    main: [2.2, 2.4],
    lines: [
      stat('coldDamagePct', 0.07, 0.09),
      inc('maxMana', 0.1, 0.14),
      stat('coldResist', 0.18, 0.22),
      strong('冰系技能冰凍機率 +10%', mods({ elements: ['Ice'] }, { freezeChance: 0.1 })),
      unique(
        '冰系技能命中時 20% 機率，從目標噴出 3 顆冰霜孢子（每顆該擊 40% 寒冰傷害、緩速 30% 1.5 秒）（冷卻 1 秒）',
        on(
          'hit',
          [
            at(
              'target',
              'magic',
              [{ type: 'projectile', speed: 7, radius: 0.2, range: 3.5, count: 3, spreadDeg: 360, onHit: [hit('cold', 1, 'spell'), status('slow', 1.5, 0.3)] }],
              0.4,
            ),
          ],
          { when: { elements: ['Ice'] }, chance: 0.2, cooldown: 1 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.helmet_vanguard',
    name: '指揮官頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: 'Combo 終結',
    lore: '頭盔上的羽飾一揮，士兵就知道下一擊該落在哪裡。',
    minItemLevel: 4,
    main: [2.4, 2.6],
    lines: [
      inc('maxHp', 0.08, 0.12),
      stat('critChance', 0.03, 0.05),
      stat('damageReduction', 0.03, 0.05),
      strong('Combo 第 3 段（終結）傷害 +18%', mods(FINISHER, { damage: 0.18 })),
      unique(
        'Combo 第 2 段命中時，下一個 Combo 第 3 段傷害 +30%、暴擊率 +10%（3 秒內，冷卻 1 秒）',
        on('hit', [arm('vanguard', FINISHER, { damage: 0.3, crit: 0.1 }, 3)], { when: { step: 2, comboOnly: true }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.helmet_ember',
    name: '餘燼頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '火系清場',
    lore: '盔縫裡的炭火從未熄滅，倒下的敵人會替它添柴。',
    minItemLevel: 6,
    main: [2.2, 2.4],
    lines: [
      stat('fireDamagePct', 0.07, 0.09),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('fireResist', 0.13, 0.17),
      strong('火牆範圍 +25%、傷害 +20%', mods({ skills: ['magic.firewall'] }, { aoeRadius: 0.25, damage: 0.2 })),
      unique(
        '火系技能擊殺時，在敵人倒下處留下 3 秒火焰（半徑 1.2 格，每 0.5 秒造成法術強度 25% 火焰傷害）（冷卻 0.5 秒）',
        on('kill', [at('target', 'magic', [{ type: 'zone', radius: 1.2, duration: 3, interval: 0.5, effects: [hit('fire', 0.25, 'spell')] }])], {
          when: { elements: ['Fire'] },
          cooldown: 0.5,
        }),
      ),
    ],
  },
];

const mythic: Def[] = [
  {
    id: 'mythic.helmet_crypt_guardian',
    name: '墓守頭盔',
    rarity: 'mythic',
    kind: 'helmet',
    role: '重錘震盪 / 不死軍團',
    lore: '墓穴守衛的鐵盔，裡面沒有頭顱，只有一團不肯熄滅的餘燼。',
    minItemLevel: 10,
    main: [3.3, 3.5],
    lines: [
      inc('maxHp', 0.18, 0.22),
      inc('defense', 0.2, 0.24),
      stat('damageReduction', 0.04, 0.06),
      stat('coldResist', 0.18, 0.22),
      unique(
        '重擊類技能命中時引發墓穴震盪：目標周圍 2.5 格敵人受到該擊 30% 傷害並暈眩 0.8 秒（冷卻 2 秒）',
        on('hit', [at('target', 'melee', [area(2.5, [hit('physical'), status('stun', 0.8)])], 0.3)], { when: { tags: ['Heavy'] }, cooldown: 2 }),
      ),
      unique(
        '擊殺時「亡者軍團」+1 層（最多 6 層、10 秒）：每層受到傷害 -1.5%、近戰傷害 +3%',
        on('kill', [buff('crypt_legion', '亡者軍團', 6, 10, [{ stat: 'damageReduction', value: 0.015 }, { stat: 'meleeDamageBonus', value: 0.03 }])]),
      ),
      unique(
        '受到近身攻擊時 20% 機率舉起塔盾：下一次受到的傷害 -40%（冷卻 3 秒）',
        on('hurt', [at('self', 'melee', [status('guard', 5, 0.4, { target: 'self' })])], { near: 2, chance: 0.2, cooldown: 3 }),
      ),
    ],
  },
  {
    id: 'mythic.helmet_fallen_priest',
    name: '墮神之冠',
    rarity: 'mythic',
    kind: 'helmet',
    role: '血焰轟擊',
    lore: '墮落神官的冠冕，金飾被血焰燻成暗紅，祈禱文全被改寫成詛咒。',
    minItemLevel: 10,
    main: [3.0, 3.2],
    lines: [
      stat('spellDamageBonus', 0.12, 0.16),
      stat('castSpeed', 0.08, 0.12),
      inc('maxMana', 0.18, 0.22),
      stat('fireResist', 0.18, 0.22),
      unique('火球一次射出 3 發（投射物 +2），每發傷害 -25%', mods({ skills: ['magic.fireball'] }, { projectileCount: 2, damage: -0.25 })),
      unique(
        '火系技能命中時 12% 機率，目標周圍連續落下 3 次血焰爆炸（每次該擊 30% 傷害）（冷卻 2 秒）',
        on('hit', [at('target', 'magic', [rain(3, 1.5, 1, 'fire', 1, 'spell')], 0.3)], { when: { elements: ['Fire'] }, chance: 0.12, cooldown: 2 }),
      ),
      unique(
        '以魔法技能結尾的 Combo 完成時，向四周射出 6 道血焰光束（每道法術強度 50% 火焰傷害）',
        on('comboComplete', [at('self', 'magic', [{ type: 'projectile', speed: 9, radius: 0.22, range: 6, count: 6, spreadDeg: 360, pierce: 2, onHit: [hit('fire', 0.5, 'spell')] }])], {
          when: MAGIC,
        }),
      ),
    ],
  },
  {
    id: 'mythic.helmet_fallen_knight',
    name: '墮落騎士盔',
    rarity: 'mythic',
    kind: 'helmet',
    role: '架式反擊 / 魔劍混合',
    lore: '面甲後只剩一道紫色的光，劍與咒在它眼中沒有分別。',
    minItemLevel: 20,
    main: [3.2, 3.4],
    lines: [
      inc('maxHp', 0.16, 0.2),
      stat('meleeDamageBonus', 0.12, 0.16),
      inc('defense', 0.18, 0.22),
      stat('lightningResist', 0.18, 0.22),
      unique(
        'Combo 中每有一種元素，近戰技能傷害 +12%（最多 3 種）',
        mods({ categories: ['melee'], comboOnly: true }, { damage: 0.12 }, { scale: { by: 'elements' } }),
      ),
      unique(
        '受到近身攻擊時 25% 機率擺出架式：下一次受到的傷害 -50%，並對下一次近戰攻擊者反擊（武器 120% 傷害）（冷卻 4 秒）',
        on(
          'hurt',
          [at('self', 'melee', [status('guard', 4, 0.5, { target: 'self' }), { type: 'status', status: 'counter', target: 'self', duration: 4, magnitude: 1.2 }])],
          { near: 2, chance: 0.25, cooldown: 4 },
        ),
      ),
      unique(
        '施放突進類技能（Advance）時「黑騎」+1 層（最多 3 層、6 秒）：每層近戰傷害 +8%',
        on('cast', [buff('fallen_knight_helm', '黑騎', 3, 6, [{ stat: 'meleeDamageBonus', value: 0.08 }])], { when: { tags: ['Advance'] } }),
      ),
    ],
  },
  {
    id: 'mythic.helmet_abyss_lord',
    name: '深淵魔冠',
    rarity: 'mythic',
    kind: 'helmet',
    role: '火雨 / 暗黑領域',
    lore: '深淵魔王的雙角化成的王冠，戴上的人會被敵人的恐懼餵得越來越強。',
    minItemLevel: 30,
    main: [3.5, 3.7],
    lines: [
      inc('maxHp', 0.16, 0.2),
      stat('fireDamagePct', 0.1, 0.14),
      stat('critChance', 0.05, 0.07),
      stat('fireResist', 0.22, 0.28),
      unique(
        '多段技能命中時 15% 機率天降火雨：目標周圍落下 4 次火焰（每次該擊 35% 傷害）（冷卻 2 秒）',
        on('hit', [at('target', 'magic', [rain(4, 1.5, 1, 'fire', 1)], 0.35)], { when: { tags: ['MultiHit'] }, chance: 0.15, cooldown: 2 }),
      ),
      unique(
        '暗黑領域：近身 3 格內每有一名敵人，所有傷害 +4%（最多 +20%）',
        cond({ enemiesWithin: { radius: 3, perEnemy: true, max: 5 } }, [{ stat: 'damageBonus', value: 0.04 }]),
      ),
      unique(
        '深淵覺醒：生命低於 40% 時，攻擊速度 +15%、施法速度 +15%',
        cond({ hpBelow: 0.4 }, [
          { stat: 'attackSpeed', modifier: 'increased', value: 0.15 },
          { stat: 'castSpeed', value: 0.15 },
        ]),
      ),
    ],
  },
];

export const helmetItems: Def[] = [...legendary, ...mythic];
