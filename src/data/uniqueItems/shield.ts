import { stat, inc, flat, strong, unique, mods, on, cond, at, buff, hit, area, status, MELEE, FINISHER, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（shield，只能搭配劍、斧）：橘 9 件、紅 3 件（紅對應每 5 層的魔王：墓穴守衛、熔岩巨獸、墮落騎士）。
 * 橘多半取材自遇過的怪物（酸液甲蟲、骨刺獵獸、角甲巨獸、震地獸、虛空孢子、單眼浮體、重甲骷髏、血鱗獵蜥）；效果以格擋觸發為主。
 */

/** 骨刺：向四周射出的骨刺（每根武器 50% 物理傷害） */
const boneSpikes: Effect = { type: 'projectile', speed: 9, radius: 0.2, range: 4, count: 6, spreadDeg: 360, onHit: [hit('physical', 0.5)] };
const counter = (duration: number, magnitude: number): Effect => ({ type: 'status', status: 'counter', target: 'self', duration, magnitude });

const legendary: Def[] = [
  {
    id: 'legendary.shield_acid_carapace',
    name: '酸蝕甲盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '格擋破甲',
    lore: '酸液甲蟲的背殼磨成的盾，被它擋下的刀刃會一點一點被蝕穿。',
    minItemLevel: 5,
    main: [2.4, 2.6],
    lines: [
      stat('poisonResist', 0.13, 0.17),
      stat('blockChance', 0.05, 0.07),
      inc('defense', 0.12, 0.16),
      strong('對破甲的敵人，近戰傷害 +20%', mods(MELEE, { vsStatus: { statuses: ['armorBreak'], damage: 0.2 } })),
      unique(
        '格擋時對攻擊者噴灑酸液：武器 50% 毒素傷害，並使其防禦 -25%（4 秒，冷卻 1.5 秒）',
        on('block', [at('target', 'melee', [hit('poison', 0.5), status('armorBreak', 4, 0.25)])], { cooldown: 1.5 }),
      ),
    ],
  },
  {
    id: 'legendary.shield_bone_spike',
    name: '骨刺之盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '荊棘 / 骨刺反擊',
    lore: '盾面上的骨刺還連著獵獸的脊椎，越是撲上來的東西，傷得越深。',
    main: [2.4, 2.6],
    lines: [
      flat('thorns', 9, 13),
      stat('blockChance', 0.05, 0.07),
      inc('maxHp', 0.08, 0.12),
      strong('生命高於 50% 時，荊棘傷害 +50%', cond({ hpAbove: 0.5 }, [{ stat: 'thorns', modifier: 'increased', value: 0.5 }])),
      unique('格擋時向四周射出 6 根骨刺（每根武器 50% 物理傷害，冷卻 1.5 秒）', on('block', [at('self', 'melee', [boneSpikes])], { cooldown: 1.5 })),
    ],
  },
  {
    id: 'legendary.shield_horn_ram',
    name: '角甲衝盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '突進衝撞',
    lore: '角甲巨獸低頭衝鋒時，最先撞上的永遠是這塊厚殼。',
    minItemLevel: 4,
    main: [2.5, 2.7],
    lines: [
      inc('defense', 0.13, 0.17),
      stat('blockChance', 0.05, 0.07),
      stat('knockbackResist', 0.13, 0.17),
      strong('突進斬傷害 +25%', mods({ skills: ['melee.dash_slash'] }, { damage: 0.25 })),
      unique(
        '突進斬命中時撞擊目標周圍 1.8 格：武器 60% 物理傷害、擊退 1.5 格並暈眩 0.5 秒；之後 3 秒內格擋率 +15%（冷卻 1 秒）',
        on(
          'hit',
          [
            at('target', 'melee', [area(1.8, [hit('physical', 0.6), { type: 'knockback', distance: 1.5 }, status('stun', 0.5)])]),
            buff('horn_ram', '衝角', 1, 3, [{ stat: 'blockChance', value: 0.15 }]),
          ],
          { when: { skills: ['melee.dash_slash'] }, cooldown: 1 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.shield_quake',
    name: '震地之盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '格擋震波 / 範圍',
    lore: '背負岩塊的巨獸倒下後，岩塊被鑿成了盾——它仍然記得怎麼讓大地顫抖。',
    minItemLevel: 6,
    main: [2.5, 2.7],
    lines: [
      inc('maxHp', 0.1, 0.14),
      stat('blockChance', 0.05, 0.07),
      stat('stunResist', 0.13, 0.17),
      strong('震地斬與裂地擊範圍 +25%', mods({ skills: ['melee.quake_slash', 'melee.earth_break'] }, { aoeRadius: 0.25 })),
      unique(
        '格擋時 30% 機率踐踏地面：周圍 2.8 格武器 70% 物理傷害並暈眩 0.8 秒（冷卻 2 秒）',
        on('block', [at('self', 'melee', [area(2.8, [hit('physical', 0.7), status('stun', 0.8)])])], { chance: 0.3, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.shield_void_spore',
    name: '虛空孢盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '格擋蓄能 / 脈衝',
    lore: '盾心嵌著一顆仍在呼吸的虛空孢子，每挨一下，它就脹大一分。',
    minItemLevel: 8,
    main: [2.4, 2.6],
    lines: [
      stat('blockChance', 0.06, 0.08),
      inc('defense', 0.12, 0.16),
      stat('damageReduction', 0.03, 0.05),
      strong('近身 2.5 格內有敵人時，受到傷害 -6%', cond({ enemiesWithin: { radius: 2.5 } }, [{ stat: 'damageReduction', value: 0.06 }])),
      unique(
        '每格擋 4 次釋放虛空脈衝：周圍 3 格武器 120% 物理傷害並擊退 2 格',
        on('block', [at('self', 'melee', [area(3, [hit('physical', 1.2), { type: 'knockback', distance: 2 }])])], { every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.shield_eye_storm',
    name: '單眼雷盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '快攻放電',
    lore: '盾心那顆眼球從未闔上，誰在它面前揮刀，它就朝誰射出雷光。',
    minItemLevel: 7,
    main: [2.4, 2.6],
    lines: [
      stat('lightningResist', 0.13, 0.17),
      stat('blockChance', 0.05, 0.07),
      inc('attackSpeed', 0.06, 0.08),
      strong('格擋後 3 秒內攻擊速度 +12%', on('block', [buff('eye_storm', '雷眼', 1, 3, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.12 }])])),
      unique(
        '快速類近戰技能每命中 4 次，雷眼射出閃電：目標周圍 1.5 格武器 70% 閃電傷害',
        on('hit', [at('target', 'melee', [area(1.5, [hit('lightning', 0.7)])])], { when: { categories: ['melee'], tags: ['Fast'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.shield_riposte',
    name: '回擊之盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '格擋反擊',
    lore: '老劍士只教一件事：先擋，再還。',
    minItemLevel: 4,
    main: [2.5, 2.7],
    lines: [
      inc('defense', 0.13, 0.17),
      stat('blockChance', 0.06, 0.08),
      stat('meleeDamageBonus', 0.1, 0.14),
      strong('生命低於 50% 時，防禦 +20%', cond({ hpBelow: 0.5 }, [{ stat: 'defense', modifier: 'increased', value: 0.2 }])),
      unique(
        '格擋時進入反擊架式：4 秒內下一次受到近戰攻擊時，以武器 150% 傷害反擊（冷卻 3 秒）',
        on('block', [at('self', 'melee', [counter(4, 1.5)])], { cooldown: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.shield_bone_bulwark',
    name: '骸甲塔盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '格擋蓄力 / 重擊',
    lore: '重甲骷髏從不閃躲——它把每一次挨打都存起來，留給下一記重擊。',
    minItemLevel: 6,
    main: [2.6, 2.8],
    lines: [
      inc('defense', 0.14, 0.18),
      inc('maxHp', 0.08, 0.12),
      stat('blockChance', 0.05, 0.07),
      strong('重砍傷害 +25%', mods({ skills: ['melee.heavy_slash'] }, { damage: 0.25 })),
      unique(
        '格擋時「骸甲」+1 層（最多 3 層、6 秒）：下一個重擊類近戰技能每層傷害 +15%，施放後清除',
        on('block', [buff('bone_bulwark', '骸甲', 3, 6)]),
        mods({ tags: ['Heavy'], categories: ['melee'] }, { damage: 0.15 }, { scale: { by: 'buff', id: 'bone_bulwark' }, consumeBuff: 'bone_bulwark' }),
      ),
    ],
  },
  {
    id: 'legendary.shield_blood_scale',
    name: '血鱗尾盾',
    rarity: 'legendary',
    kind: 'shield',
    role: '被包圍 / 橫掃',
    lore: '血紅鱗片一片疊著一片，敵人越多，它甩得越狠。',
    minItemLevel: 3,
    main: [2.4, 2.6],
    lines: [
      inc('maxHp', 0.09, 0.13),
      stat('blockChance', 0.05, 0.07),
      inc('attackSpeed', 0.05, 0.07),
      strong('近身 3 格內每有一名敵人，防禦 +4%（最多 +20%）', cond({ enemiesWithin: { radius: 3, perEnemy: true, max: 5 } }, [{ stat: 'defense', modifier: 'increased', value: 0.04 }])),
      unique(
        '格擋時甩尾橫掃：周圍 2.4 格武器 50% 物理傷害並擊退 1.2 格（冷卻 1 秒）',
        on('block', [at('self', 'melee', [area(2.4, [hit('physical', 0.5), { type: 'knockback', distance: 1.2 }])])], { cooldown: 1 }),
      ),
    ],
  },
];

const mythic: Def[] = [
  // B1 墓穴守衛：塔盾、衝鋒撞擊、墓穴震盪
  {
    id: 'mythic.shield_crypt_warden',
    name: '墓守巨盾',
    rarity: 'mythic',
    kind: 'shield',
    role: '格擋疊層 / 墓穴震盪',
    lore: '墓穴守衛倒下時仍舉著這面塔盾，盾後的墓門至今沒有被打開過。',
    minItemLevel: 10,
    main: [3.5, 3.7],
    lines: [
      stat('blockChance', 0.08, 0.1),
      inc('defense', 0.2, 0.24),
      inc('maxHp', 0.18, 0.22),
      stat('stunResist', 0.18, 0.22),
      unique('格擋時「墓守」+1 層（最多 5 層、8 秒）：每層防禦 +4%', on('block', [buff('crypt_warden', '墓守', 5, 8, [{ stat: 'defense', modifier: 'increased', value: 0.04 }])])),
      unique(
        '墓守滿 5 層時，重擊類近戰技能命中引發墓穴震盪：目標周圍 3.5 格武器 120% 物理傷害並暈眩 0.8 秒，並清除墓守',
        on('hit', [at('target', 'melee', [area(3.5, [hit('physical', 1.2), status('stun', 0.8)])])], {
          when: { tags: ['Heavy'], categories: ['melee'] },
          requireBuff: { id: 'crypt_warden', atLeast: 5 },
          consumeBuff: 'crypt_warden',
        }),
      ),
      unique(
        '受到近身攻擊時 20% 機率舉盾衝撞：對攻擊者造成武器 100% 物理傷害、擊退 1.5 格並暈眩 0.6 秒（冷卻 3 秒）',
        on('hurt', [at('target', 'melee', [hit('physical', 1), { type: 'knockback', distance: 1.5 }, status('stun', 0.6)])], { near: 2, chance: 0.2, cooldown: 3 }),
      ),
    ],
  },
  // B3 熔岩巨獸：岩漿地面、地面震擊、越打越熱
  {
    id: 'mythic.shield_lava_core',
    name: '熔核之盾',
    rarity: 'mythic',
    kind: 'shield',
    role: '岩漿地面 / 震擊',
    lore: '從熔岩巨獸胸口鑿下的岩殼，裂縫裡的岩漿從未冷卻。',
    minItemLevel: 15,
    main: [3.5, 3.7],
    lines: [
      stat('fireResist', 0.18, 0.22),
      stat('blockChance', 0.07, 0.09),
      inc('defense', 0.2, 0.24),
      inc('maxHp', 0.16, 0.2),
      unique(
        '格擋時在攻擊者腳下噴出岩漿：留下 4 秒岩漿地面（半徑 1.8 格），每 0.5 秒造成武器 20% 火焰傷害（冷卻 3 秒）',
        on('block', [at('target', 'melee', [{ type: 'zone', radius: 1.8, duration: 4, interval: 0.5, effects: [hit('fire', 0.2)] }])], { cooldown: 3 }),
      ),
      unique(
        '重擊類近戰技能命中時 25% 機率震擊地面：周圍 3 格武器 80% 物理傷害並暈眩 0.6 秒（冷卻 1.5 秒）',
        on('hit', [at('self', 'melee', [area(3, [hit('physical', 0.8), status('stun', 0.6)])])], { when: { tags: ['Heavy'], categories: ['melee'] }, chance: 0.25, cooldown: 1.5 }),
      ),
      unique('近戰命中時「熔心」+1 層（最多 10 層、5 秒）：每層火焰附加傷害 +2%', on('hit', [buff('lava_core', '熔心', 10, 5, [{ stat: 'fireDamagePct', value: 0.02 }])], { when: MELEE })),
    ],
  },
  // B4 墮落騎士：架式反擊、依序附魔火焰 / 寒冰 / 雷霆、連段斬擊
  {
    id: 'mythic.shield_fallen_knight',
    name: '墮騎士之盾',
    rarity: 'mythic',
    kind: 'shield',
    role: '架式反擊 / 三元素附魔',
    lore: '黑暗吞噬騎士的那一夜，他的盾先學會了怎麼反擊。',
    minItemLevel: 20,
    main: [3.6, 3.8],
    lines: [
      stat('blockChance', 0.08, 0.1),
      inc('defense', 0.2, 0.24),
      stat('meleeDamageBonus', 0.16, 0.2),
      stat('damageReduction', 0.04, 0.06),
      unique(
        '格擋時擺出架式（3 秒）：下一次受到的傷害 -50%，並以武器 200% 傷害反擊下一次近戰攻擊（冷卻 5 秒）',
        on('block', [at('self', 'melee', [status('guard', 3, 0.5, { target: 'self' }), counter(3, 2)])], { cooldown: 5 }),
      ),
      unique(
        '隨著受傷依序附魔：生命低於 75% 時火焰附加傷害 +12%，低於 50% 時再加寒冰附加傷害 +12%，低於 25% 時再加閃電附加傷害 +12%',
        cond({ hpBelow: 0.75 }, [{ stat: 'fireDamagePct', value: 0.12 }]),
        cond({ hpBelow: 0.5 }, [{ stat: 'coldDamagePct', value: 0.12 }]),
        cond({ hpBelow: 0.25 }, [{ stat: 'lightningDamagePct', value: 0.12 }]),
      ),
      unique(
        '以近戰技能作為 Combo 第三招時傷害 +30%；完成後 4 秒內格擋率 +12%',
        mods({ ...FINISHER, categories: ['melee'] }, { damage: 0.3 }),
        on('comboComplete', [buff('fallen_knight_stance', '騎士架式', 1, 4, [{ stat: 'blockChance', value: 0.12 }])], { when: { categories: ['melee'] } }),
      ),
    ],
  },
];

export const shieldItems: Def[] = [...legendary, ...mythic];
