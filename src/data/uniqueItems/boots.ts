import { stat, inc, strong, unique, uniqueRoll, mods, on, cond, at, buff, arm, hit, area, status, RANGED, FINISHER, spiders, SPIDER_HP, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（靴子）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * - 橘（怪物靈感）：暗影獵豹、鑽地寄生蟲、角甲巨獸、震地獸、血鱗獵蜥、毒沫噴吐者、虛空孢子；另有橋接、打帶跑兩件
 * - 紅（魔王）：墮落神官（B2）、熔岩巨獸（B3）、蜘蛛女王（B5）、深淵統御者（B7）
 */

/** 向四周平均射出的投射物（自訂倍率與附加效果） */
const burst = (count: number, onHit: Effect[], speed = 9, range = 5): Effect => ({ type: 'projectile', speed, radius: 0.2, range, count, spreadDeg: 360, onHit });
/** 地面持續區域 */
const zone = (radius: number, duration: number, interval: number, effects: Effect[]): Effect => ({ type: 'zone', radius, duration, interval, effects });
const knockback = (distance: number): Effect => ({ type: 'knockback', distance });
/** 位移類技能 */
const MOVEMENT = ['Advance', 'Retreat', 'Roll', 'Reposition', 'Dash'] as const;

const legendary: Def[] = [
  {
    id: 'legendary.boots_shadow_panther',
    name: '影豹戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '潛行 / 突襲',
    lore: '暗影獵豹的爪墊縫在靴底，踩在石板上沒有一點聲音。',
    minItemLevel: 4,
    main: [2.15, 2.35],
    lines: [
      inc('moveSpeed', 0.14, 0.18),
      stat('critChance', 0.04, 0.06),
      stat('dodgeChance', 0.05, 0.07),
      strong('突進斬傷害 +30%、暴擊率 +10%', mods({ skills: ['melee.dash_slash'] }, { damage: 0.3, crit: 0.1 })),
      unique('周圍 5 格內沒有敵人時（潛伏）：暴擊率 +10%、移動速度 +10%', cond({ noEnemiesWithin: 5 }, [
        { stat: 'critChance', value: 0.1 },
        { stat: 'moveSpeed', modifier: 'increased', value: 0.1 },
      ])),
    ],
  },
  {
    id: 'legendary.boots_burrower',
    name: '鑽地戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '位移 / 地刺挑空',
    lore: '一節一節的靴筒像寄生蟲的身體，每一步都想往地底鑽。',
    minItemLevel: 6,
    main: [2.2, 2.4],
    lines: [
      inc('moveSpeed', 0.1, 0.14),
      stat('meleeDamageBonus', 0.06, 0.1),
      inc('maxHp', 0.08, 0.12),
      strong('突進斬 / 後跳射擊魔力消耗 -30%', mods({ tags: [...MOVEMENT] }, { mp: -0.3 })),
      unique(
        '施放位移技能時，腳下竄出地刺：周圍 2 格內敵人受到武器 60% 物理傷害並浮空 0.6 秒（冷卻 1 秒）',
        on('cast', [at('self', 'melee', [area(2, [hit('physical', 0.6), { type: 'status', status: 'airborne', duration: 0.6 }])])], { when: { tags: [...MOVEMENT] }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.boots_horned_beast',
    name: '角甲戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '衝撞 / 擊退',
    lore: '鞋頭包著角甲巨獸的角，低頭衝過去就對了。',
    minItemLevel: 5,
    main: [2.4, 2.6],
    lines: [
      inc('maxHp', 0.1, 0.14),
      inc('defense', 0.1, 0.14),
      stat('knockbackResist', 0.18, 0.22),
      strong('擊退類技能傷害 +15%、擊退 +40%', mods({ tags: ['Knockback'] }, { damage: 0.15, knockback: 0.4 })),
      unique(
        '突進斬命中時撞飛目標（擊退並暈眩 0.6 秒），下一個重擊類技能傷害 +25%（5 秒內）',
        on('hit', [at('target', 'melee', [knockback(2), status('stun', 0.6)]), arm('horned_beast', { tags: ['Heavy'] }, { damage: 0.25 }, 5)], { when: { skills: ['melee.dash_slash'] } }),
      ),
    ],
  },
  {
    id: 'legendary.boots_quake_beast',
    name: '震地戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '近身範圍 / 踐踏',
    lore: '震地獸的腳掌拓下的鐵靴，跺一下，地面就裂一道縫。',
    minItemLevel: 7,
    main: [2.4, 2.6],
    lines: [
      inc('maxHp', 0.1, 0.14),
      inc('defense', 0.08, 0.12),
      stat('stunResist', 0.13, 0.17),
      strong('範圍近戰技能傷害 +20%、範圍 +15%', mods({ tags: ['AoE'], categories: ['melee'] }, { damage: 0.2, aoeRadius: 0.15 })),
      unique(
        '受到近身攻擊時 20% 機率踐踏地面：周圍 2.5 格內敵人受到武器 70% 物理傷害並緩速 30%，持續 2 秒（冷卻 2 秒）',
        on('hurt', [at('self', 'melee', [area(2.5, [hit('physical', 0.7), status('slow', 2, 0.3)])])], { near: 2, chance: 0.2, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.boots_blood_lizard',
    name: '血鱗戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '快攻疊速',
    lore: '血紅的鱗片一片壓著一片，跑得越快，鱗片越燙。',
    minItemLevel: 3,
    main: [2.1, 2.3],
    lines: [
      inc('moveSpeed', 0.1, 0.14),
      inc('attackSpeed', 0.05, 0.07),
      stat('critChance', 0.03, 0.05),
      strong('快速技能暴擊率 +8%', mods({ tags: ['Fast'] }, { crit: 0.08 })),
      unique(
        '快速技能命中時「血鱗」+1 層（最多 5 層、4 秒）：每層移動速度 +4%、攻擊速度 +3%',
        on('hit', [buff('blood_lizard', '血鱗', 5, 4, [
          { stat: 'moveSpeed', modifier: 'increased', value: 0.04 },
          { stat: 'attackSpeed', modifier: 'increased', value: 0.03 },
        ])], { when: { tags: ['Fast'] } }),
      ),
    ],
  },
  {
    id: 'legendary.boots_venom_spitter',
    name: '毒沫戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '後撤 / 毒沼',
    lore: '靴底總是濕濕黏黏的，走過的地方草會枯掉。',
    minItemLevel: 8,
    main: [2.15, 2.35],
    lines: [
      stat('poisonDamagePct', 0.08, 0.12),
      inc('moveSpeed', 0.1, 0.14),
      stat('poisonResist', 0.18, 0.22),
      strong('對緩速的敵人，遠程傷害 +20%', mods(RANGED, { vsStatus: { statuses: ['slow'], damage: 0.2 } })),
      unique(
        '施放後跳射擊時，在原地留下毒沫 3 秒：每 0.5 秒造成武器 15% 毒素傷害並緩速 25%（冷卻 2 秒）',
        on('cast', [at('self', 'ranged', [zone(2, 3, 0.5, [hit('poison', 0.15), status('slow', 1, 0.25)])])], { when: { skills: ['ranged.backstep_shot'] }, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.boots_void_spore',
    name: '虛空孢靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '近身法術 / 脈衝',
    lore: '紫黑色的孢子在靴面上一明一滅，像是在呼吸。',
    minItemLevel: 9,
    main: [2.1, 2.3],
    lines: [
      stat('castSpeed', 0.06, 0.1),
      inc('maxMana', 0.1, 0.14),
      inc('moveSpeed', 0.08, 0.12),
      strong('近身法術（冰霜新星 / 絕對零度）傷害 +25%', mods({ ranges: ['Near'], categories: ['magic'] }, { damage: 0.25 })),
      unique(
        '完成 Combo 時，腳下釋放虛空脈衝：周圍 3 格內敵人受到 80% 法術強度物理傷害並被推開（冷卻 1 秒）',
        on('comboComplete', [at('self', 'magic', [area(3, [hit('physical', 0.8, 'spell'), knockback(1.5)])])], { cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.boots_skyleap',
    name: '凌雲戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '橋接 → 終結',
    lore: '穿上它的人總是在半空中換氣，然後落下最後一擊。',
    minItemLevel: 6,
    main: [2.2, 2.4],
    lines: [
      inc('moveSpeed', 0.1, 0.14),
      stat('dodgeChance', 0.04, 0.06),
      stat('critDamageBonus', 0.13, 0.17),
      strong('橋接技能（上挑斬 / 後跳射擊）傷害 +25%', mods({ roles: ['Bridge'] }, { damage: 0.25 })),
      unique(
        '橋接技能命中後，下一個終結技傷害 +30%（5 秒內）',
        on('hit', [arm('skyleap', { roles: ['Finisher'] }, { damage: 0.3 }, 5)], { when: { roles: ['Bridge'] } }),
      ),
    ],
  },
  {
    id: 'legendary.boots_skirmisher',
    name: '遊擊戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '遠距 Combo / 打帶跑',
    lore: '打完就跑，跑完再打——游擊隊員只信這一條。',
    minItemLevel: 2,
    main: [2.1, 2.3],
    lines: [
      inc('moveSpeed', 0.12, 0.16),
      stat('dodgeChance', 0.05, 0.07),
      stat('lightningResist', 0.13, 0.17),
      strong('Combo 第三招為遠距離技能時，傷害 +20%', mods({ ...FINISHER, ranges: ['Far'] }, { damage: 0.2 })),
      unique(
        '完成 Combo 後 3 秒內，移動速度 +25%、閃避 +8%',
        on('comboComplete', [buff('skirmisher', '遊擊', 1, 3, [
          { stat: 'moveSpeed', modifier: 'increased', value: 0.25 },
          { stat: 'dodgeChance', value: 0.08 },
        ])]),
      ),
    ],
  },
];

const mythic: Def[] = [
  // B2 墮落神官：血焰彈、法術轟擊、旋轉光束、狂信
  {
    id: 'mythic.boots_fallen_priest',
    name: '墮神官之靴',
    rarity: 'mythic',
    kind: 'boots',
    role: '狂信施法 / 血焰轟擊',
    lore: '神官背棄信仰那天穿著的鞋，鞋底的聖紋被血燒成了另一種文字。',
    minItemLevel: 10,
    main: [3, 3.2],
    lines: [
      inc('moveSpeed', 0.18, 0.22),
      stat('castSpeed', 0.1, 0.14),
      stat('spellDamageBonus', 0.18, 0.22),
      inc('maxMana', 0.18, 0.22),
      unique(
        '施放法術時「狂信」+1 層（最多 6 層、5 秒）：每層施法速度 +4%',
        on('cast', [buff('fallen_priest', '狂信', 6, 5, [{ stat: 'castSpeed', value: 0.04 }])], { when: { categories: ['magic'] } }),
      ),
      unique(
        '狂信滿 6 層時，法術命中會在目標周圍連續落下 6 次爆炸（每次 40% 法術強度火焰傷害，冷卻 3 秒）',
        on('hit', [at('target', 'magic', [{ type: 'delayed', delay: 0.3, repeat: 6, interval: 0.15, scatter: 1.8, effects: [area(1.2, [hit('fire', 0.4, 'spell')])] }])], {
          when: { categories: ['magic'] },
          requireBuff: { id: 'fallen_priest', atLeast: 6 },
          cooldown: 3,
        }),
      ),
      unique(
        '閃避時向四周射出 4 道血焰光束（各造成 60% 法術強度火焰傷害，冷卻 2 秒）',
        on('dodge', [at('self', 'magic', [burst(4, [hit('fire', 0.6, 'spell')], 10, 6)])], { cooldown: 2 }),
      ),
    ],
  },
  // B3 熔岩巨獸：岩漿蔓延、地面震擊
  {
    id: 'mythic.boots_lava_behemoth',
    name: '熔岩巨足',
    rarity: 'mythic',
    kind: 'boots',
    role: '岩漿蔓延 / 站樁',
    lore: '熔岩巨獸的腳印至今還在地底燃燒，這雙靴子就是從腳印裡挖出來的。',
    minItemLevel: 15,
    main: [3.4, 3.6],
    lines: [
      inc('maxHp', 0.18, 0.22),
      stat('fireResist', 0.18, 0.22),
      inc('defense', 0.18, 0.22),
      stat('fireDamagePct', 0.1, 0.14),
      unique(
        '每次完成 Combo，在腳下留下岩漿 5 秒：每 0.5 秒造成武器 25% 火焰傷害（冷卻 1 秒）',
        on('comboComplete', [at('self', 'melee', [zone(2.2, 5, 0.5, [hit('fire', 0.25)])])], { cooldown: 1 }),
      ),
      unique(
        '近身 3 格內每有一名敵人，火焰附加傷害 +4%（最多 +20%）',
        cond({ enemiesWithin: { radius: 3, perEnemy: true, max: 5 } }, [{ stat: 'fireDamagePct', value: 0.04 }]),
      ),
      unique(
        '受到近身攻擊時 25% 機率震擊地面：周圍 2.5 格內敵人受到武器 80% 物理傷害並暈眩 1 秒（冷卻 3 秒）',
        on('hurt', [at('self', 'melee', [area(2.5, [hit('physical', 0.8), status('stun', 1)])])], { near: 2, chance: 0.25, cooldown: 3 }),
      ),
    ],
  },
  // B5 蜘蛛女王：蛛網、毒液、蜘蛛群
  {
    id: 'mythic.boots_spider_queen',
    name: '蛛后絲靴',
    rarity: 'mythic',
    kind: 'boots',
    role: '閃避結網 / 毒液 Combo',
    lore: '用蜘蛛女王的絲織成的長靴，輕得像沒穿，卻能黏住任何追上來的東西。',
    minItemLevel: 25,
    main: [3.1, 3.3],
    lines: [
      inc('moveSpeed', 0.18, 0.22),
      stat('dodgeChance', 0.09, 0.11),
      stat('poisonDamagePct', 0.13, 0.17),
      stat('poisonResist', 0.22, 0.28),
      unique(
        '閃避時吐出蛛網：周圍 3 格內敵人緩速 50%，持續 2.5 秒（冷卻 2 秒）',
        on('dodge', [at('self', 'ranged', [area(3, [status('slow', 2.5, 0.5)])])], { cooldown: 2 }),
      ),
      unique('對緩速的敵人，暴擊率 +15%', mods({}, { vsStatus: { statuses: ['slow'], crit: 0.15 } })),
      uniqueRoll(
        '每次完成 Combo，放出 3 隻毒蛛：追咬附近的敵人，每口武器 70% 毒素傷害並緩速 30%（冷卻 1 秒）；毒蛛生命為主角最大生命的 {roll}，存活 6 秒（全身最多 10 隻）',
        SPIDER_HP,
        on('comboComplete', [at('self', 'ranged', [spiders(3, [hit('poison', 0.7), status('slow', 2, 0.3)])])], { cooldown: 1 }),
      ),
    ],
  },
  // B7 深淵統御者：盾牌 → 狂暴近戰 → 魔力暴走 三階段
  {
    id: 'mythic.boots_abyss_sovereign',
    name: '統御者戰靴',
    rarity: 'mythic',
    kind: 'boots',
    role: '三階段變身',
    lore: '四足魔物的蹄甲熔鑄成的戰靴；傷得越重，它記起的憤怒越多。',
    minItemLevel: 35,
    main: [3.7, 3.9],
    lines: [
      inc('maxHp', 0.23, 0.27),
      inc('moveSpeed', 0.18, 0.22),
      stat('damageReduction', 0.04, 0.06),
      stat('fireResist', 0.18, 0.22),
      unique('生命高於 60% 時（盾之相）：受到傷害 -12%', cond({ hpAbove: 0.6 }, [{ stat: 'damageReduction', value: 0.12 }])),
      unique(
        '生命低於 60% 時（狂暴之相）：近戰傷害 +25%、攻擊速度 +15%',
        cond({ hpBelow: 0.6 }, [
          { stat: 'meleeDamageBonus', value: 0.25 },
          { stat: 'attackSpeed', modifier: 'increased', value: 0.15 },
        ]),
      ),
      unique(
        '生命低於 30% 時（魔力暴走）：法術傷害 +30%、施法速度 +20%',
        cond({ hpBelow: 0.3 }, [
          { stat: 'spellDamageBonus', value: 0.3 },
          { stat: 'castSpeed', value: 0.2 },
        ]),
      ),
    ],
  },
];

export const bootsItems: Def[] = [...legendary, ...mythic];
