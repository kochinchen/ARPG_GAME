import { stat, inc, flat, strongStat, strong, unique, mods, on, at, buff, arm, hit, area, status, ring, rain, MELEE, FINISHER, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（sword）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * 橘：每件強化一個劍技或一種玩法（快斬、雙重斬、突進斬、劍刃旋舞、幻影連斬、挑空斬、處決斬、Starter、劍與法術交替），
 *     其中 7 件取材自地城怪物（骷髏戰士、食屍鬼、暗影獵豹、骨刺獵獸、鉤爪蟲、寒霜孢子體、單眼浮體）。
 * 紅：墓穴守衛（B1）、墮落神官（B2）、墮落騎士（B4）、深淵魔王（B6）。
 */

/** 自己身上的狀態（parts.status 只開放常用的幾種） */
const selfStatus = (s: 'counter' | 'guard', duration: number, magnitude: number): Effect => ({ type: 'status', status: s, target: 'self', duration, magnitude });

// ═══════════════════════════ 橘 · 傳奇 ═══════════════════════════

const legendary: Def[] = [
  {
    id: 'legendary.sword_rusted_bone',
    name: '鏽骨之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '快斬連擊',
    lore: '從骷髏戰士手裡奪來的鏽劍，它記得每一次在亂軍中揮出的第三刀。',
    main: [2.2, 2.4],
    lines: [
      inc('attackSpeed', 0.12, 0.16),
      stat('meleeDamageBonus', 0.1, 0.14),
      inc('maxHp', 0.07, 0.09),
      strong('快斬傷害 +30%', mods({ skills: ['melee.quick_slash'] }, { damage: 0.3 })),
      unique(
        '快斬每第 3 次命中，追加一次斬擊：前方敵人受到該擊 80% 傷害',
        on('hit', [at('target', 'melee', [area(1.3, [hit('physical')])], 0.8)], { when: { skills: ['melee.quick_slash'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.sword_ghoul_hunger',
    name: '噬屍之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '雙重斬 / 收尾',
    lore: '食屍鬼從不挑最強的獵物，只挑最虛弱的那一個。',
    minItemLevel: 2,
    main: [2.3, 2.5],
    lines: [
      inc('attackSpeed', 0.08, 0.12),
      stat('critChance', 0.05, 0.07),
      inc('moveSpeed', 0.06, 0.08),
      strong('雙重斬傷害 +30%', mods({ skills: ['melee.double_slash'] }, { damage: 0.3 })),
      unique('雙重斬對生命低於 50% 的敵人，傷害再 +35%', mods({ skills: ['melee.double_slash'] }, { vsLowHp: { below: 0.5, damage: 0.35 } })),
    ],
  },
  {
    id: 'legendary.sword_shadow_panther',
    name: '影豹之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '突進 / 暴擊',
    lore: '暗影獵豹撲殺之前不會發出聲音，被它咬住的獵物也來不及發出聲音。',
    minItemLevel: 4,
    main: [2.25, 2.45],
    lines: [
      inc('moveSpeed', 0.08, 0.12),
      stat('critChance', 0.06, 0.08),
      stat('dodgeChance', 0.04, 0.06),
      strongStat('critDamageBonus', 0.22, 0.28),
      unique(
        '突進類技能命中時，對目標施加弱點（受到的暴擊傷害 +30%，4 秒）',
        on('hit', [at('target', 'melee', [status('weakPoint', 4, 0.3)])], { when: { tags: ['Advance'] } }),
      ),
    ],
  },
  {
    id: 'legendary.sword_bone_spike',
    name: '骨刺之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '劍刃旋舞 / 骨刺',
    lore: '劍脊上長出一排骨刺，像骨刺獵獸的背一樣，轉一圈就全部射出去。',
    minItemLevel: 3,
    main: [2.3, 2.5],
    lines: [
      stat('meleeDamageBonus', 0.12, 0.16),
      flat('thorns', 8, 12),
      inc('defense', 0.08, 0.12),
      strong('劍刃旋舞傷害 +30%', mods({ skills: ['melee.blade_dance'] }, { damage: 0.3 })),
      unique(
        '劍刃旋舞每第 3 次命中，向四周射出 6 根骨刺（各造成該擊 40% 傷害）',
        on('hit', [at('self', 'melee', [ring(6, 'physical', 9, 4.5)], 0.4)], { when: { skills: ['melee.blade_dance'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.sword_hookclaw',
    name: '鉤爪之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '幻影連斬 / 破甲',
    lore: '刃口內彎成鉤，像鉤爪蟲一樣每一下都帶走一片甲殼。',
    minItemLevel: 6,
    main: [2.4, 2.6],
    lines: [
      inc('attackSpeed', 0.1, 0.14),
      stat('meleeDamageBonus', 0.1, 0.14),
      stat('critDamageBonus', 0.13, 0.17),
      strong('幻影連斬傷害 +25%', mods({ skills: ['melee.phantom_blades'] }, { damage: 0.25 })),
      unique(
        '幻影連斬每第 4 次命中，使目標破甲（防禦 -20%，4 秒）',
        on('hit', [at('target', 'melee', [status('armorBreak', 4, 0.2)])], { when: { skills: ['melee.phantom_blades'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.sword_frost_spore',
    name: '霜孢之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '挑空斬 / 冰霜孢子',
    lore: '劍身上長滿了冰藍色的菌絲，把敵人挑起來時，孢子會跟著一起飛出去。',
    minItemLevel: 3,
    main: [2.25, 2.45],
    lines: [
      stat('coldDamagePct', 0.12, 0.16),
      inc('attackSpeed', 0.07, 0.09),
      stat('coldResist', 0.13, 0.17),
      strong('對浮空的敵人，近戰傷害 +25%', mods(MELEE, { vsStatus: { statuses: ['airborne'], damage: 0.25 } })),
      unique(
        '挑空斬命中時，向前方噴出 3 顆冰霜孢子（各造成該擊 50% 寒冰傷害並緩速 30%，冷卻 0.5 秒）',
        on(
          'hit',
          [at('self', 'melee', [{ type: 'projectile', speed: 9, radius: 0.22, range: 6, count: 3, spreadDeg: 40, onHit: [hit('cold'), status('slow', 2, 0.3)] }], 0.5)],
          { when: { skills: ['melee.launch_slash'] }, cooldown: 0.5 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.sword_lightning_eye',
    name: '雷眼之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: 'Starter / 閃電',
    lore: '護手上嵌著單眼浮體的眼珠，出手的第一劍，它會先替你看準目標。',
    minItemLevel: 5,
    main: [2.3, 2.5],
    lines: [
      stat('lightningDamagePct', 0.12, 0.16),
      stat('critChance', 0.05, 0.07),
      inc('attackSpeed', 0.07, 0.09),
      strong('Starter 技能傷害 +25%', mods({ roles: ['Starter'] }, { damage: 0.25 })),
      unique(
        'Combo 第一招為近戰技能時，命中射出一道閃電眼光（穿透 2 名敵人，造成該擊 70% 閃電傷害，冷卻 1 秒）',
        on('hit', [at('self', 'melee', [{ type: 'projectile', speed: 16, radius: 0.2, range: 8, pierce: 2, onHit: [hit('lightning')] }], 0.7)], {
          when: { step: 1, categories: ['melee'] },
          cooldown: 1,
        }),
      ),
    ],
  },
  {
    id: 'legendary.sword_verdict',
    name: '斷罪之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '處決 / 連殺',
    lore: '每砍下一顆罪人的頭，劍上的判決書就多寫一行。',
    minItemLevel: 7,
    main: [2.6, 2.8],
    lines: [
      stat('meleeDamageBonus', 0.13, 0.17),
      stat('critChance', 0.05, 0.07),
      inc('maxHp', 0.08, 0.12),
      strong('處決斬傷害 +30%', mods({ skills: ['melee.execution_slash'] }, { damage: 0.3 })),
      unique(
        '處決斬擊殺時「斷罪」+1 層（最多 3 層、8 秒）：每層處決斬傷害 +15%',
        on('kill', [buff('sword_verdict', '斷罪', 3, 8)], { when: { skills: ['melee.execution_slash'] } }),
        mods({ skills: ['melee.execution_slash'] }, { damage: 0.15 }, { scale: { by: 'buff', id: 'sword_verdict' } }),
      ),
    ],
  },
  {
    id: 'legendary.sword_spellweave',
    name: '咒紋之刃',
    rarity: 'legendary',
    kind: 'sword',
    role: '劍與法術交替',
    lore: '劍身刻滿了法師才看得懂的咒文，揮劍等於唸出前半句。',
    minItemLevel: 5,
    main: [2.1, 2.3],
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      stat('meleeDamageBonus', 0.08, 0.12),
      stat('castSpeed', 0.07, 0.09),
      strong('近戰技能命中後，下一個法術傷害 +25%', on('hit', [arm('sword_spellweave', { categories: ['magic'] }, { damage: 0.25 }, 5)], { when: MELEE })),
      unique(
        '法術命中後，下一個近戰技能傷害 +30%、暴擊率 +10%',
        on('hit', [arm('sword_spellweave_blade', MELEE, { damage: 0.3, crit: 0.1 }, 5)], { when: { categories: ['magic'] } }),
      ),
    ],
  },
];

// ═══════════════════════════ 紅 · 神話 ═══════════════════════════

const mythic: Def[] = [
  {
    // B1 墓穴守衛：衝鋒撞擊、塔盾、喚醒亡者
    id: 'mythic.sword_crypt_warden',
    name: '墓守巨劍',
    rarity: 'mythic',
    kind: 'sword',
    role: '衝鋒 / 亡者軍團',
    lore: '墓穴守衛封印古墓時用的巨劍，劍鋒一指，沉睡的亡者就會站起來列隊。',
    minItemLevel: 10,
    main: [3.5, 3.7],
    lines: [
      stat('meleeDamageBonus', 0.22, 0.28),
      inc('maxHp', 0.18, 0.22),
      inc('defense', 0.18, 0.22),
      stat('knockbackResist', 0.18, 0.22),
      unique(
        '突進斬命中時撞擊目標：暈眩 0.8 秒並擊退 1.5 格（冷卻 2 秒）',
        on('hit', [at('target', 'melee', [status('stun', 0.8), { type: 'knockback', distance: 1.5 }])], { when: { skills: ['melee.dash_slash'] }, cooldown: 2 }),
      ),
      unique('受到近身攻擊時 20% 機率舉起塔盾：下一次受到的傷害 -40%（冷卻 3 秒）', on('hurt', [at('self', 'melee', [selfStatus('guard', 5, 0.4)])], { near: 2, chance: 0.2, cooldown: 3 })),
      unique(
        '近戰擊殺時「亡者」+1 層（最多 6 層、8 秒）：每層近戰傷害 +4%、防禦 +3%',
        on('kill', [buff('crypt_warden', '亡者', 6, 8, [{ stat: 'meleeDamageBonus', value: 0.04 }, { stat: 'defense', modifier: 'increased', value: 0.03 }])], { when: MELEE }),
      ),
    ],
  },
  {
    // B2 墮落神官：血焰彈、旋轉光束、狂信
    id: 'mythic.sword_fallen_rite',
    name: '墮聖之劍',
    rarity: 'mythic',
    kind: 'sword',
    role: '劍與血焰法術',
    lore: '神官背棄信仰那天，把祭壇上的聖劍浸進了自己的血。',
    minItemLevel: 10,
    main: [3.2, 3.4],
    lines: [
      stat('meleeDamageBonus', 0.18, 0.22),
      stat('fireDamagePct', 0.13, 0.17),
      stat('spellDamageBonus', 0.13, 0.17),
      stat('castSpeed', 0.08, 0.12),
      unique(
        '近戰命中時 20% 機率射出三發血焰彈（各造成武器 50% 火焰傷害，冷卻 1 秒）',
        on('hit', [at('self', 'melee', [{ type: 'projectile', speed: 11, radius: 0.22, range: 7, count: 3, spreadDeg: 30, onHit: [hit('fire', 0.5)] }])], { when: MELEE, chance: 0.2, cooldown: 1 }),
      ),
      unique(
        '完成 Combo 時，向四周射出旋轉光束：3 波、每波 4 道（各造成武器 40% 火焰傷害，冷卻 3 秒）',
        on(
          'comboComplete',
          [
            at('self', 'magic', [
              { type: 'delayed', delay: 0.1, repeat: 3, interval: 0.25, spinDeg: 30, effects: [{ type: 'projectile', speed: 9, radius: 0.2, range: 5, count: 4, spreadDeg: 360, onHit: [hit('fire', 0.4)] }] },
            ]),
          ],
          { cooldown: 3 },
        ),
      ),
      unique(
        '每次完成 Combo，「狂信」+1 層（最多 5 層、8 秒）：每層攻擊速度 +4%、施法速度 +4%',
        on('comboComplete', [
          buff('fallen_rite', '狂信', 5, 8, [
            { stat: 'attackSpeed', modifier: 'increased', value: 0.04 },
            { stat: 'castSpeed', value: 0.04 },
          ]),
        ]),
      ),
    ],
  },
  {
    // B4 墮落騎士：架式反擊、連段斬擊、火 → 冰 → 雷的附魔
    id: 'mythic.sword_fallen_knight',
    name: '墮騎之劍',
    rarity: 'mythic',
    kind: 'sword',
    role: '架式反擊 / 三元素連段',
    lore: '騎士被黑暗吞噬之後，劍上的附魔一層一層亮起：先是火，然後是冰，最後是雷。',
    minItemLevel: 20,
    main: [3.7, 3.9],
    lines: [
      stat('meleeDamageBonus', 0.26, 0.3),
      inc('attackSpeed', 0.1, 0.14),
      inc('defense', 0.18, 0.22),
      stat('critChance', 0.07, 0.09),
      unique(
        '受到近身攻擊時 25% 機率擺出架式：下一次受到的傷害 -30%，並以武器 150% 傷害反擊下一次近戰攻擊（冷卻 4 秒）',
        on('hurt', [at('self', 'melee', [selfStatus('guard', 5, 0.3), selfStatus('counter', 5, 1.5)])], { near: 2, chance: 0.25, cooldown: 4 }),
      ),
      unique(
        'Combo 中的近戰命中依序附魔：第一招追加 30% 火焰傷害、第二招追加 30% 寒冰傷害並緩速 30%、第三招引發連鎖閃電（彈跳 2 次，各 30%）',
        on('hit', [at('target', 'melee', [hit('fire')], 0.3)], { when: { step: 1, categories: ['melee'] }, cooldown: 0.2 }),
        on('hit', [at('target', 'melee', [hit('cold'), status('slow', 2, 0.3)], 0.3)], { when: { step: 2, categories: ['melee'] }, cooldown: 0.2 }),
        on('hit', [at('target', 'melee', [{ type: 'chain', jumps: 2, radius: 4, effects: [hit('lightning')] }], 0.3)], { when: { step: 3, categories: ['melee'] }, cooldown: 0.2 }),
      ),
      unique('Combo 第三招為近戰技能時，傷害 +25%', mods({ ...FINISHER, categories: ['melee'] }, { damage: 0.25 })),
    ],
  },
  {
    // B6 深淵魔王：多段重擊、天降火雨、分身、暗黑領域、深淵覺醒
    id: 'mythic.sword_abyss_lord',
    name: '深淵魔劍',
    rarity: 'mythic',
    kind: 'sword',
    role: '火雨 / 暗黑領域',
    lore: '魔王把它插進深淵的地心，拔出來的時候，劍上沾滿了燒不完的火。',
    minItemLevel: 30,
    main: [3.8, 4],
    lines: [
      stat('meleeDamageBonus', 0.28, 0.32),
      stat('fireDamagePct', 0.16, 0.2),
      stat('critDamageBonus', 0.26, 0.32),
      inc('maxHp', 0.16, 0.2),
      unique(
        '重擊類技能命中時 20% 機率，在目標周圍降下火雨（6 次、武器 45% 火焰傷害，冷卻 1.5 秒）',
        on('hit', [at('target', 'melee', [rain(6, 1.8, 1.1, 'fire', 0.45)])], { when: { tags: ['Heavy'] }, chance: 0.2, cooldown: 1.5 }),
      ),
      unique(
        '完成 Combo 時展開暗黑領域 4 秒：每 0.5 秒對周圍 2.5 格的敵人造成武器 25% 寒冰傷害並緩速 30%（冷卻 6 秒）',
        on('comboComplete', [at('self', 'melee', [{ type: 'zone', radius: 2.5, duration: 4, interval: 0.5, effects: [hit('cold', 0.25), status('slow', 1, 0.3)] }])], { cooldown: 6 }),
      ),
      unique(
        '近戰命中時 12% 機率，深淵分身從目標身後再斬一次（該擊 60% 傷害，冷卻 0.8 秒）',
        on('hit', [at('target', 'melee', [area(1.2, [hit('physical')])], 0.6)], { when: MELEE, chance: 0.12, cooldown: 0.8 }),
      ),
    ],
  },
];

export const swordItems: Def[] = [...legendary, ...mythic];
