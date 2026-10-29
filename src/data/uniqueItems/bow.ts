import { stat, inc, strong, unique, uniqueRoll, mods, on, at, buff, arm, hit, area, status, RANGED, FINISHER, spiders, SPIDER_HP, type Def, type Effect, type DamageElement } from './parts';

/**
 * 擴充的傳奇 / 神話（弓）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * 橘：骸骨長弓（骷髏弓手）、骨刺獵弓（骨刺獵獸）、酸蝕長弓（酸液甲蟲）、暗豹獵弓（暗影獵豹）、
 * 獨眼雷弓（單眼浮體）、霜孢長弓（寒霜孢子體）、火囊爆弓（火囊爬行者）、先機長弓、纏絆長弓。
 * 紅：血祭神弓（B2 墮落神官）、墮騎魔弓（B4 墮落騎士）、蛛后毒弓（B5 蜘蛛女王）、魔王炎弓（B6 深淵魔王）。
 */

/** 指定倍率的投射物（施放時觸發的效果沒有「該擊傷害」，用固定倍率） */
const shots = (count: number, spreadDeg: number, element: DamageElement, multiplier: number, extra: Effect[] = [], speed = 9, range = 6): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.2,
  range,
  count,
  spreadDeg,
  onHit: [hit(element, multiplier), ...extra],
});

export const bowItems: Def[] = [
  // ═══════════════ 橘 · 傳奇 ═══════════════
  {
    id: 'legendary.bow_bone_archer',
    name: '骸骨長弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '後跳 / 風箏',
    lore: '骷髏弓手的遺弓，一被貼近，握弓的手就會自己往後退。',
    minItemLevel: 2,
    main: [2.3, 2.5],
    lines: [
      stat('rangedDamageBonus', 0.14, 0.18),
      inc('moveSpeed', 0.06, 0.08),
      stat('dodgeChance', 0.04, 0.06),
      strong('後跳射擊傷害 +30%', mods({ skills: ['ranged.backstep_shot'] }, { damage: 0.3 })),
      unique(
        '受到 2 格內敵人攻擊時，下一次後跳射擊傷害 +60%、多射出 2 支箭（冷卻 4 秒）',
        on('hurt', [arm('bone_archer', { skills: ['ranged.backstep_shot'] }, { damage: 0.6, projectileCount: 2 }, 6)], { near: 2, cooldown: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_spine_hound',
    name: '骨刺獵弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '散射 / 骨刺',
    lore: '用骨刺獵獸的脊骨削成，箭一入肉，骨刺就從傷口裡長出來。',
    minItemLevel: 3,
    main: [2.4, 2.6],
    lines: [
      stat('rangedDamageBonus', 0.13, 0.17),
      stat('critChance', 0.05, 0.07),
      inc('attackSpeed', 0.06, 0.08),
      strong('散射多射出 2 支箭', mods({ skills: ['ranged.spread_shot'] }, { projectileCount: 2 })),
      unique(
        '散射命中時 25% 機率，從目標身上向四周射出 4 根骨刺，各造成該擊 40% 傷害',
        on('hit', [at('target', 'ranged', [shots(4, 360, 'physical', 1, [], 8, 2.5)], 0.4)], { when: { skills: ['ranged.spread_shot'] }, chance: 0.25, cooldown: 0.2 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_acid_beetle',
    name: '酸蝕長弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '破甲 / 毒素',
    lore: '弓臂包著酸液甲蟲的殼，箭頭泡過牠的酸，射穿的不是肉而是甲。',
    minItemLevel: 5,
    main: [2.3, 2.5],
    lines: [
      stat('rangedDamageBonus', 0.12, 0.16),
      stat('poisonDamagePct', 0.12, 0.16),
      inc('attackSpeed', 0.06, 0.08),
      strong('對破甲的敵人，遠程傷害 +25%', mods(RANGED, { vsStatus: { statuses: ['armorBreak'], damage: 0.25 } })),
      unique(
        '遠程命中時 20% 機率噴濺酸液：目標周圍 1.5 格敵人受到該擊 30% 毒素傷害，防禦 -20%（4 秒）',
        on('hit', [at('target', 'ranged', [area(1.5, [hit('poison'), status('armorBreak', 4, 0.2)])], 0.3)], { when: RANGED, chance: 0.2, cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_shadow_panther',
    name: '暗豹獵弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '快射 / 擊殺連鎖',
    lore: '暗影獵豹從不撲空；這把弓也一樣，獵物倒下前，下一支箭已經瞄準了別人。',
    minItemLevel: 7,
    main: [2.4, 2.6],
    lines: [
      stat('critChance', 0.06, 0.08),
      inc('moveSpeed', 0.07, 0.09),
      stat('rangedDamageBonus', 0.12, 0.16),
      strong('快速射擊傷害 +30%、攻擊速度 +15%', mods({ skills: ['ranged.quick_shot'] }, { damage: 0.3, attackSpeed: 0.15 })),
      unique(
        '遠程擊殺時進入「潛獵」3 秒：移動速度 +15%，下一個遠程技能必定暴擊',
        on('kill', [buff('panther_stalk', '潛獵', 1, 3, [{ stat: 'moveSpeed', modifier: 'increased', value: 0.15 }]), arm('panther_crit', RANGED, { crit: 1 }, 3)], { when: RANGED }),
      ),
    ],
  },
  {
    id: 'legendary.bow_eye_floater',
    name: '獨眼雷弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '快速連射 / 閃電彈跳',
    lore: '弓梢嵌著單眼浮體的眼珠，它眨一下，就有一道雷光替你補上一箭。',
    minItemLevel: 9,
    main: [2.5, 2.7],
    lines: [
      stat('lightningDamagePct', 0.12, 0.16),
      inc('attackSpeed', 0.08, 0.1),
      stat('critChance', 0.05, 0.07),
      strong('連射傷害 +25%、箭速 +30%', mods({ skills: ['ranged.rapid_fire'] }, { damage: 0.25, projectileSpeed: 0.3 })),
      unique(
        '快速類遠程技能每命中 4 次，射出一道眼光：造成該擊 50% 閃電傷害，並彈跳 2 次',
        on('hit', [at('target', 'ranged', [{ type: 'chain', jumps: 2, radius: 4, effects: [hit('lightning')] }], 0.5)], { when: { tags: ['Fast'], categories: ['ranged'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_frost_spore',
    name: '霜孢長弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '蓄力 / 寒冰緩速',
    lore: '弓身上長著冰藍色的蕈傘，每一次拉滿弦，孢子就簌簌地落下。',
    minItemLevel: 11,
    main: [2.6, 2.8],
    lines: [
      stat('coldDamagePct', 0.12, 0.16),
      stat('rangedDamageBonus', 0.12, 0.16),
      stat('coldResist', 0.12, 0.16),
      strong('蓄力射擊傷害 +30%、擊退 +30%', mods({ skills: ['ranged.charge_shot'] }, { damage: 0.3, knockback: 0.3 })),
      unique(
        '蓄力射擊命中時，向四周噴出 3 顆冰霜孢子：各造成武器 50% 寒冰傷害，緩速 30%（2 秒）',
        on('hit', [at('target', 'ranged', [shots(3, 360, 'cold', 0.5, [status('slow', 2, 0.3)], 7, 4)])], { when: { skills: ['ranged.charge_shot'] }, cooldown: 0.3 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_fire_sac',
    name: '火囊爆弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '爆裂箭 / 二次爆炸',
    lore: '箭袋縫在火囊爬行者的囊袋上，每支箭都沾著一點會晚一拍才炸開的火。',
    minItemLevel: 13,
    main: [2.6, 2.8],
    lines: [
      stat('fireDamagePct', 0.13, 0.17),
      stat('rangedDamageBonus', 0.12, 0.16),
      stat('critDamageBonus', 0.16, 0.2),
      strong('爆裂箭傷害 +20%、範圍 +30%', mods({ skills: ['ranged.explosive_arrow'] }, { damage: 0.2, aoeRadius: 0.3 })),
      unique(
        '爆裂箭命中後 0.6 秒，原地再爆炸一次：周圍 2 格受到武器 60% 火焰傷害',
        on('hit', [at('target', 'ranged', [{ type: 'delayed', delay: 0.6, effects: [area(2, [hit('fire', 0.6)])] }])], { when: { skills: ['ranged.explosive_arrow'] }, cooldown: 0.4 }),
      ),
    ],
  },
  {
    id: 'legendary.bow_first_strike',
    name: '先機長弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '起手 / 標記',
    lore: '第一支箭不求殺敵，只求讓之後的每一支箭都找得到路。',
    minItemLevel: 6,
    main: [2.3, 2.5],
    lines: [
      stat('rangedDamageBonus', 0.14, 0.18),
      stat('critChance', 0.05, 0.07),
      stat('critDamageBonus', 0.16, 0.2),
      strong('遠程起手技傷害 +25%', mods({ roles: ['Starter'], categories: ['ranged'] }, { damage: 0.25 })),
      unique(
        '遠程起手技命中時，標記目標：受到的傷害 +12%（4 秒）',
        on('hit', [at('target', 'ranged', [{ type: 'status', status: 'marked', duration: 4, magnitude: 0.12 }])], { when: { roles: ['Starter'], categories: ['ranged'] } }),
      ),
    ],
  },
  {
    id: 'legendary.bow_binding',
    name: '纏絆長弓',
    rarity: 'legendary',
    kind: 'bow',
    role: '牽制 / 群體緩速',
    lore: '弓弦是用荊棘藤擰成的，射出去的箭會拖著藤蔓一起走。',
    minItemLevel: 4,
    main: [2.3, 2.5],
    lines: [
      stat('rangedDamageBonus', 0.13, 0.17),
      inc('attackSpeed', 0.06, 0.08),
      stat('slowResist', 0.1, 0.14),
      strong('牽制射擊傷害 +30%', mods({ skills: ['ranged.pinning_shot'] }, { damage: 0.3 })),
      unique(
        '牽制射擊命中時，藤蔓纏住目標周圍 2 格的敵人：緩速 50%（2 秒）；對緩速的敵人，遠程傷害 +15%',
        on('hit', [at('target', 'ranged', [area(2, [status('slow', 2, 0.5)])])], { when: { skills: ['ranged.pinning_shot'] }, cooldown: 0.3 }),
        mods(RANGED, { vsStatus: { statuses: ['slow'], damage: 0.15 } }),
      ),
    ],
  },

  // ═══════════════ 紅 · 神話 ═══════════════
  {
    id: 'mythic.bow_fallen_priest',
    name: '血祭神弓',
    rarity: 'mythic',
    kind: 'bow',
    role: '血焰彈幕 / 狂信層數',
    lore: '墮落神官用信徒的血為它開光；它射出的不是箭，是一句接一句的禱詞。',
    minItemLevel: 10,
    main: [3.2, 3.4],
    lines: [
      stat('rangedDamageBonus', 0.22, 0.26),
      stat('fireDamagePct', 0.13, 0.17),
      inc('attackSpeed', 0.08, 0.12),
      stat('critChance', 0.07, 0.09),
      unique(
        '每施放 3 次遠程技能，額外射出 3 發血焰彈（扇形 30°，各造成武器 50% 火焰傷害）',
        on('cast', [at('self', 'ranged', [shots(3, 30, 'fire', 0.5, [], 10, 8)])], { when: RANGED, every: 3 }),
      ),
      unique(
        '以遠程技能結尾的 Combo 完成時，放出旋轉光束：3 波、每波 6 道，各造成武器 40% 火焰傷害',
        on('comboComplete', [at('self', 'ranged', [{ type: 'delayed', delay: 0, repeat: 3, interval: 0.2, spinDeg: 20, effects: [shots(6, 360, 'fire', 0.4, [], 9, 5)] }])], { when: RANGED }),
      ),
      unique(
        '遠程擊殺時「狂信」+1 層（最多 5 層、6 秒）：每層攻擊速度 +4%、遠程傷害 +3%',
        on('kill', [buff('priest_zeal', '狂信', 5, 6, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.04 }, { stat: 'rangedDamageBonus', value: 0.03 }])], { when: RANGED }),
      ),
    ],
  },
  {
    id: 'mythic.bow_fallen_knight',
    name: '墮騎魔弓',
    rarity: 'mythic',
    kind: 'bow',
    role: '三元素連段 / 架式',
    lore: '墮落騎士折斷的劍被熔成弓臂；拉弓時，火焰、寒冰與雷霆依序爬上弓弦。',
    minItemLevel: 20,
    main: [3.5, 3.7],
    lines: [
      stat('rangedDamageBonus', 0.24, 0.28),
      stat('critDamageBonus', 0.24, 0.3),
      inc('attackSpeed', 0.1, 0.14),
      inc('defense', 0.13, 0.17),
      unique(
        'Combo 第一 / 二 / 三招的遠程命中，分別追加該擊 25% 的火焰 / 寒冰 / 閃電傷害（寒冰另緩速 20%，1.5 秒）',
        on('hit', [at('target', 'ranged', [area(1, [hit('fire')])], 0.25)], { when: { step: 1, categories: ['ranged'] }, cooldown: 0.15 }),
        on('hit', [at('target', 'ranged', [area(1, [hit('cold'), status('slow', 1.5, 0.2)])], 0.25)], { when: { step: 2, categories: ['ranged'] }, cooldown: 0.15 }),
        on('hit', [at('target', 'ranged', [area(1, [hit('lightning')])], 0.25)], { when: { step: 3, categories: ['ranged'] }, cooldown: 0.15 }),
      ),
      unique(
        '受到攻擊時擺出架式（冷卻 6 秒）：下一次受到的傷害 -40%，下一個遠程技能傷害 +50%',
        on('hurt', [at('self', 'ranged', [status('guard', 4, 0.4, { target: 'self' })]), arm('knight_stance', RANGED, { damage: 0.5 }, 4)], { cooldown: 6 }),
      ),
      unique('三招技能都不同的遠程 Combo：第三招傷害 +35%、暴擊率 +15%', mods({ ...FINISHER, distinctSkills: true, categories: ['ranged'] }, { damage: 0.35, crit: 0.15 })),
    ],
  },
  {
    id: 'mythic.bow_spider_queen',
    name: '蛛后毒弓',
    rarity: 'mythic',
    kind: 'bow',
    role: '毒液 / 蛛網 / 群蛛',
    lore: '蜘蛛女王的弓用自己的蛛絲做弦，每射出一箭，箭桿上都爬著還沒孵化的卵。',
    minItemLevel: 25,
    main: [3.55, 3.75],
    lines: [
      stat('rangedDamageBonus', 0.24, 0.28),
      stat('poisonDamagePct', 0.16, 0.2),
      inc('attackSpeed', 0.1, 0.14),
      stat('poisonResist', 0.22, 0.28),
      unique(
        '遠程命中時 15% 機率噴射毒液：目標周圍 2 格受到該擊 40% 毒素傷害，防禦 -20%（4 秒）',
        on('hit', [at('target', 'ranged', [area(2, [hit('poison'), status('armorBreak', 4, 0.2)])], 0.4)], { when: RANGED, chance: 0.15, cooldown: 0.5 }),
      ),
      unique(
        '多段遠程技能命中時，蛛網纏住目標：緩速 40%（2 秒）；對緩速的敵人，遠程暴擊率 +12%',
        on('hit', [at('target', 'ranged', [status('slow', 2, 0.4)])], { when: { tags: ['MultiHit'], categories: ['ranged'] } }),
        mods(RANGED, { vsStatus: { statuses: ['slow'], crit: 0.12 } }),
      ),
      uniqueRoll(
        '遠程擊殺時孵出 4 隻毒蛛：追咬附近的敵人，每口武器 45% 毒素傷害；毒蛛生命為主角最大生命的 {roll}，存活 6 秒（全身最多 10 隻）',
        SPIDER_HP,
        on('kill', [at('target', 'ranged', [spiders(4, [hit('poison', 0.45)])])], { when: RANGED }),
      ),
    ],
  },
  {
    id: 'mythic.bow_abyss_lord',
    name: '魔王炎弓',
    rarity: 'mythic',
    kind: 'bow',
    role: '火雨 / 分身 / 暗黑領域',
    lore: '深淵魔王的翼骨彎成的長弓；它射向天空的箭，會帶著整片火雨落回來。',
    minItemLevel: 30,
    main: [3.7, 3.9],
    lines: [
      stat('rangedDamageBonus', 0.26, 0.3),
      stat('fireDamagePct', 0.16, 0.2),
      stat('critChance', 0.08, 0.1),
      inc('maxHp', 0.13, 0.17),
      unique(
        '箭雨命中時（冷卻 2 秒），在目標周圍再降下 8 次火雨，各造成武器 45% 火焰傷害',
        on('hit', [at('target', 'ranged', [{ type: 'delayed', delay: 0.3, repeat: 8, interval: 0.15, scatter: 2.4, effects: [area(1.2, [hit('fire', 0.45)])] }])], { when: { skills: ['ranged.rain_of_arrows'] }, cooldown: 2 }),
      ),
      unique('施放遠程技能時 12% 機率，深淵分身以相同目標再施放一次（冷卻 1 秒）', on('cast', [{ type: 'recast' }], { when: RANGED, chance: 0.12, cooldown: 1 })),
      unique(
        '生命低於 40% 時受到攻擊，展開暗黑領域（冷卻 15 秒）：周圍 3 格、6 秒，每 0.5 秒造成武器 20% 寒冰傷害並緩速 30%；領域存在期間受到傷害 -10%',
        on('hurt', [at('self', 'ranged', [{ type: 'zone', radius: 3, duration: 6, interval: 0.5, effects: [hit('cold', 0.2), status('slow', 1, 0.3)] }]), buff('abyss_domain', '暗黑領域', 1, 6, [{ stat: 'damageReduction', value: 0.1 }])], { hpBelow: 0.4, cooldown: 15 }),
      ),
    ],
  },
];
