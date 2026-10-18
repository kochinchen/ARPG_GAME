import { stat, inc, flat, strong, unique, mods, on, cond, at, arm, buff, hit, area, status, rain, MELEE, FINISHER, type Def } from './parts';

/**
 * 擴充的傳奇 / 神話（amulet）：橘 9 件、紅 4 件（紅對應每 5 層的魔王：墓穴守衛、墮落神官、深淵魔王、深淵統御者）。
 * 護身符偏向 Combo 角色與玩法；橘多半取材自遇過的怪物（食屍鬼、腦海浮體、毒沫噴吐者、卵囊母體、鑽地寄生蟲、骷髏法師、熔顎巨獸）。
 */

const legendary: Def[] = [
  {
    id: 'legendary.amulet_ghoul',
    name: '食屍護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '起手 / 群獵',
    lore: '食屍鬼成群撲來時從不猶豫——牠們只記得下一口。',
    lines: [
      inc('moveSpeed', 0.06, 0.08),
      inc('attackSpeed', 0.05, 0.07),
      inc('maxHp', 0.08, 0.12),
      stat('critChance', 0.04, 0.06),
      strong('起手技能傷害 +20%', mods({ roles: ['Starter'] }, { damage: 0.2 })),
      unique(
        '擊殺時「群獵」+1 層（最多 3 層、4 秒）：每層移動速度 +5%、攻擊速度 +4%',
        on('kill', [buff('ghoul', '群獵', 3, 4, [{ stat: 'moveSpeed', modifier: 'increased', value: 0.05 }, { stat: 'attackSpeed', modifier: 'increased', value: 0.04 }])]),
      ),
    ],
  },
  {
    id: 'legendary.amulet_brain',
    name: '腦海護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '佈局 / 暈眩',
    lore: '裸露的大腦被封在琥珀裡，仍在低聲重複同一句話：別動。',
    minItemLevel: 5,
    lines: [
      inc('maxMana', 0.14, 0.18),
      stat('stunResist', 0.1, 0.14),
      inc('maxHp', 0.08, 0.12),
      stat('castSpeed', 0.04, 0.06),
      strong('對暈眩的敵人傷害 +18%', mods({}, { vsStatus: { statuses: ['stun'], damage: 0.18 } })),
      unique('佈局技能命中時 20% 機率以心靈衝擊暈眩目標 1 秒（冷卻 2 秒）', on('hit', [at('target', 'magic', [status('stun', 1)])], { when: { roles: ['Setup'] }, chance: 0.2, cooldown: 2 })),
    ],
  },
  {
    id: 'legendary.amulet_venom',
    name: '毒沫護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '範圍 / 毒液地面',
    lore: '毒沫噴吐者的喉囊乾成了護符，搖一搖還聽得到液體在裡面晃。',
    minItemLevel: 6,
    lines: [
      stat('poisonResist', 0.12, 0.16),
      stat('poisonDamagePct', 0.08, 0.12),
      inc('maxHp', 0.08, 0.12),
      stat('critDamageBonus', 0.14, 0.18),
      strong('範圍類技能傷害 +18%', mods({ tags: ['AoE'] }, { damage: 0.18 })),
      unique(
        '範圍類技能命中時在目標腳下留下毒沫 3 秒（半徑 1.5 格）：每 0.5 秒造成該擊 10% 毒素傷害（冷卻 2 秒）',
        on('hit', [at('target', 'magic', [{ type: 'zone', radius: 1.5, duration: 3, interval: 0.5, effects: [hit('poison')] }], 0.1)], { when: { tags: ['AoE'] }, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.amulet_egg_sac',
    name: '卵囊護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '增幅 / 擊殺擴散',
    lore: '卵囊母體腹中最後一顆卵沒有孵化，它變硬、變亮，然後被串上了繩子。',
    minItemLevel: 6,
    lines: [
      inc('maxHp', 0.1, 0.14),
      stat('poisonDamagePct', 0.06, 0.1),
      inc('attackSpeed', 0.04, 0.06),
      stat('castSpeed', 0.04, 0.06),
      strong('增幅技能傷害 +18%', mods({ roles: ['Amplifier'] }, { damage: 0.18 })),
      unique(
        '擊殺時屍體爆出 4 顆卵囊碎片：每顆造成該擊 30% 毒素傷害',
        on('kill', [at('target', 'ranged', [{ type: 'projectile', speed: 8, radius: 0.2, range: 4, count: 4, spreadDeg: 360, onHit: [hit('poison')] }], 0.3)]),
      ),
    ],
  },
  {
    id: 'legendary.amulet_burrower',
    name: '鑽地護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '位移 / 突襲',
    lore: '鑽地寄生蟲的一節外殼，貼在胸口時能感覺到地底的震動。',
    minItemLevel: 4,
    lines: [
      inc('moveSpeed', 0.07, 0.09),
      stat('dodgeChance', 0.04, 0.06),
      inc('maxHp', 0.07, 0.09),
      stat('critChance', 0.04, 0.06),
      strong('突進斬與後跳射擊傷害 +20%', mods({ skills: ['melee.dash_slash', 'ranged.backstep_shot'] }, { damage: 0.2 })),
      unique(
        '位移技能命中時從地底竄出：目標周圍 1.5 格武器 60% 物理傷害，並挑起浮空 0.6 秒（冷卻 2 秒）',
        on('hit', [at('target', 'melee', [area(1.5, [hit('physical', 0.6), { type: 'status', status: 'airborne', duration: 0.6 }])])], { when: { tags: ['Advance', 'Retreat'] }, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.amulet_expedition',
    name: '遠征護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '由近而遠的 Combo',
    lore: '每一段旅程都從腳邊開始，在地平線結束。',
    minItemLevel: 5,
    lines: [
      inc('maxHp', 0.08, 0.12),
      inc('maxMana', 0.12, 0.16),
      inc('moveSpeed', 0.05, 0.07),
      stat('critDamageBonus', 0.16, 0.2),
      strong('三招皆不相同的 Combo 傷害 +12%', mods({ comboOnly: true, distinctSkills: true }, { damage: 0.12 })),
      unique('三招距離依序為近身 → 中距 → 遠距的 Combo，第三招傷害 +35%、暴擊率 +15%', mods({ ...FINISHER, rangePattern: ['Near', 'Mid', 'Far'] }, { damage: 0.35, crit: 0.15 })),
    ],
  },
  {
    id: 'legendary.amulet_bone_mage',
    name: '骸法護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '冰火交替',
    lore: '骷髏法師左手凝冰、右手燃火，死後兩隻手骨還緊緊扣著這枚護符。',
    minItemLevel: 4,
    lines: [
      inc('maxMana', 0.16, 0.2),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('castSpeed', 0.05, 0.07),
      flat('manaRegen', 0.6, 1),
      strong('火 / 冰系技能傷害 +15%', mods({ elements: ['Fire', 'Ice'] }, { damage: 0.15 })),
      unique(
        '施放火系技能後，下一個冰系技能傷害 +30%；施放冰系技能後，下一個火系技能傷害 +30%（5 秒內有效）',
        on('cast', [arm('bone_mage_ice', { elements: ['Ice'] }, { damage: 0.3 }, 5)], { when: { elements: ['Fire'] } }),
        on('cast', [arm('bone_mage_fire', { elements: ['Fire'] }, { damage: 0.3 }, 5)], { when: { elements: ['Ice'] } }),
      ),
    ],
  },
  {
    id: 'legendary.amulet_final_act',
    name: '終幕護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '處決 / 收尾',
    lore: '最後一幕不需要台詞。',
    minItemLevel: 3,
    lines: [
      stat('critDamageBonus', 0.18, 0.22),
      stat('critChance', 0.04, 0.06),
      inc('maxHp', 0.08, 0.12),
      stat('damageBonus', 0.06, 0.08),
      strong('收尾技能傷害 +15%', mods({ roles: ['Finisher'] }, { damage: 0.15 })),
      unique('處決類技能對生命低於 35% 的敵人傷害 +40%', mods({ tags: ['Execute'] }, { vsLowHp: { below: 0.35, damage: 0.4 } })),
    ],
  },
  {
    id: 'legendary.amulet_magma_jaw',
    name: '熔顎護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '近戰火焰吐息',
    lore: '熔顎巨獸的一顆牙，裡面的熔岩到現在還沒冷卻。',
    minItemLevel: 7,
    lines: [
      stat('meleeDamageBonus', 0.1, 0.14),
      stat('fireDamagePct', 0.08, 0.12),
      stat('fireResist', 0.12, 0.16),
      inc('maxHp', 0.08, 0.12),
      strong('近身近戰技能傷害 +15%', mods({ ranges: ['Near'], categories: ['melee'] }, { damage: 0.15 })),
      unique('近戰每命中 6 次噴出熔岩吐息：前方 90°、3 格內武器 70% 火焰傷害', on('hit', [at('self', 'melee', [area(3, [hit('fire', 0.7)], 90)])], { when: MELEE, every: 6 })),
    ],
  },
];

const mythic: Def[] = [
  // B1 墓穴守衛：喚醒亡者、巨錘重擊（160°）
  {
    id: 'mythic.amulet_crypt_warden',
    name: '墓守護符',
    rarity: 'mythic',
    kind: 'amulet',
    role: '亡者軍團 / 巨錘反擊',
    lore: '墓穴守衛把每一個倒在墓門前的亡者都記在這枚護符上。',
    minItemLevel: 10,
    lines: [
      inc('maxHp', 0.2, 0.24),
      inc('defense', 0.18, 0.22),
      stat('meleeDamageBonus', 0.16, 0.2),
      stat('stunResist', 0.16, 0.2),
      stat('damageReduction', 0.03, 0.05),
      unique('擊殺時「亡者」+1 層（最多 6 層、10 秒）：每層防禦 +4%', on('kill', [buff('crypt_dead', '亡者', 6, 10, [{ stat: 'defense', modifier: 'increased', value: 0.04 }])])),
      unique('重擊類技能每層亡者傷害 +5%', mods({ tags: ['Heavy'] }, { damage: 0.05 }, { scale: { by: 'buff', id: 'crypt_dead' } })),
      unique(
        '受到近身攻擊時 25% 機率巨錘反擊：前方 160°、3 格內武器 90% 物理傷害並擊退 1.5 格（冷卻 2 秒）',
        on('hurt', [at('self', 'melee', [area(3, [hit('physical', 0.9), { type: 'knockback', distance: 1.5 }], 160)])], { near: 2, chance: 0.25, cooldown: 2 }),
      ),
    ],
  },
  // B2 墮落神官：法術轟擊、狂信、血紅法術
  {
    id: 'mythic.amulet_fallen_priest',
    name: '神官護符',
    rarity: 'mythic',
    kind: 'amulet',
    role: '法術轟擊 / 狂信',
    lore: '神官把信仰換成了血，護符上的聖徽也跟著換了顏色。',
    minItemLevel: 10,
    lines: [
      stat('spellDamageBonus', 0.18, 0.22),
      inc('maxMana', 0.22, 0.26),
      stat('castSpeed', 0.08, 0.1),
      stat('critChance', 0.06, 0.08),
      stat('critDamageBonus', 0.2, 0.25),
      unique(
        '以法術作為 Combo 第三招命中時，在目標周圍連續落下 6 次爆炸：每次造成該擊 20% 火焰傷害（冷卻 3 秒）',
        on('hit', [at('target', 'magic', [rain(6, 2.2, 1.5, 'fire', 1, 'spell')], 0.2)], { when: { ...FINISHER, categories: ['magic'] }, cooldown: 3 }),
      ),
      unique('生命低於 50% 時陷入狂信：施法速度 +15%、魔力消耗 -20%', cond({ hpBelow: 0.5 }, [{ stat: 'castSpeed', value: 0.15 }, { stat: 'manaCostReduction', value: 0.2 }])),
      unique(
        '完成 Combo 後 5 秒內「血之祝禱」：暴擊率 +12%、暴擊傷害 +20%',
        on('comboComplete', [buff('blood_prayer', '血之祝禱', 1, 5, [{ stat: 'critChance', value: 0.12 }, { stat: 'critDamageBonus', value: 0.2 }])]),
      ),
    ],
  },
  // B6 深淵魔王：召喚分身、暗黑領域、深淵覺醒
  {
    id: 'mythic.amulet_abyss_lord',
    name: '魔王護符',
    rarity: 'mythic',
    kind: 'amulet',
    role: '分身重施 / 暗黑領域',
    lore: '護符裡封著魔王的一個分身，它總在你出手之後，再出手一次。',
    minItemLevel: 30,
    lines: [
      stat('damageBonus', 0.18, 0.22),
      inc('maxMana', 0.2, 0.24),
      stat('critChance', 0.07, 0.09),
      inc('maxHp', 0.18, 0.22),
      stat('manaCostReduction', 0.08, 0.1),
      unique('施放 Combo 第三招時 20% 機率由分身再施放一次', on('cast', [{ type: 'recast' }], { when: FINISHER, chance: 0.2 })),
      unique(
        'Combo 第三招命中時展開暗黑領域 4 秒（半徑 3 格）：每 0.5 秒造成該擊 8% 寒冰傷害並緩速 30%（冷卻 6 秒）',
        on('hit', [at('target', 'magic', [{ type: 'zone', radius: 3, duration: 4, interval: 0.5, effects: [hit('cold'), status('slow', 1, 0.3)] }], 0.08)], { when: FINISHER, cooldown: 6 }),
      ),
      unique('生命低於 50% 時深淵覺醒：所有傷害 +20%、移動速度 +10%', cond({ hpBelow: 0.5 }, [{ stat: 'damageBonus', value: 0.2 }, { stat: 'moveSpeed', modifier: 'increased', value: 0.1 }])),
    ],
  },
  // B7 深淵統御者：無限的空間欲望、五道劍氣、盾碎後狂暴
  {
    id: 'mythic.amulet_abyss_sovereign',
    name: '統御者護符',
    rarity: 'mythic',
    kind: 'amulet',
    role: '劍氣 / 範圍擴張',
    lore: '它對空間的渴望永無止境——連佩戴者的招式，也被它拉得越來越長。',
    minItemLevel: 35,
    lines: [
      stat('damageBonus', 0.18, 0.22),
      inc('maxHp', 0.22, 0.26),
      stat('critChance', 0.07, 0.09),
      inc('attackSpeed', 0.08, 0.12),
      stat('critDamageBonus', 0.25, 0.3),
      unique('所有技能範圍 +20%', mods({}, { aoeRadius: 0.2 })),
      unique(
        '以近戰技能作為 Combo 第三招命中時，往前方 180° 斬出 5 道劍氣（每道武器 60% 物理傷害、穿透 3 名敵人，冷卻 2 秒）',
        on('hit', [at('self', 'melee', [{ type: 'projectile', speed: 12, radius: 0.3, range: 8, count: 5, spreadDeg: 180, pierce: 3, onHit: [hit('physical', 0.6)] }])], {
          when: { ...FINISHER, categories: ['melee'] },
          cooldown: 2,
        }),
      ),
      unique(
        '生命低於 50% 時受到攻擊，進入狂暴 5 秒：受到傷害 -30%、免疫擊退（冷卻 30 秒）',
        on('hurt', [at('self', 'melee', [status('ironWill', 5, 0.3, { target: 'self' })])], { hpBelow: 0.5, cooldown: 30 }),
      ),
    ],
  },
];

export const amuletItems: Def[] = [...legendary, ...mythic];
