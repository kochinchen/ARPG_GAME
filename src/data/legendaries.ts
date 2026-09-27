import type { z } from 'zod';
import type { EffectDefSchema } from './schema/effects';
import type { ItemActionSchema, ItemMechanicSchema, LegendaryDefSchema, ModsInputSchema, SkillFilterSchema } from './schema/legendary';

type Def = z.input<typeof LegendaryDefSchema>;
type Line = Def['lines'][number];
type Mechanic = z.input<typeof ItemMechanicSchema>;
type Action = z.input<typeof ItemActionSchema>;
type Filter = z.input<typeof SkillFilterSchema>;
type Mods = z.input<typeof ModsInputSchema>;
type Effect = z.input<typeof EffectDefSchema>;
type StatId = Extract<Line, { type: 'stat' }>['stat'];

/**
 * 傳奇（橘）30 件、神話（紅）20 件：每種裝備（劍、斧、弓、杖、頭盔、盔甲、手套、鞋子、戒指、護身符）
 * 橘 3 件、紅 2 件。設計原則：
 * - 橘讓玩家說「這招變得好好用」：強化一個技能或一種玩法
 * - 紅讓玩家說「我想為了這件裝重新配 Q / W / E」：改變整個 Build 或 Combo 邏輯
 *
 * 屬性與效果都使用現有的系統（技能、Combo 標籤、狀態）。硬直（Stagger）與 Momentum 屬於 M10，
 * 目前以擊退、暈眩與裝備自己的「層數」代替，M10 完成後再換成正式的硬直。
 * 數值為 T1（1～9 層）的範圍；固定屬性隨階級成長，效果的數值固定。
 */

// ─────────────────────────── 寫法輔助 ───────────────────────────

const stat = (s: StatId, min: number, max: number, o: { modifier?: 'flat' | 'increased'; strong?: boolean; growth?: number } = {}): Line => ({
  type: 'stat',
  stat: s,
  value: [min, max],
  ...o,
});
/** 「提高 X%」類（生命、魔力、防禦、攻速、移速） */
const inc = (s: StatId, min: number, max: number, strong = false): Line => stat(s, min, max, { modifier: 'increased', strong });
/** 固定值類（荊棘、魔力回復）成長較快 */
const flat = (s: StatId, min: number, max: number): Line => stat(s, min, max, { growth: 0.5 });
const strongStat = (s: StatId, min: number, max: number): Line => stat(s, min, max, { strong: true });

/** 一般效果行（例如「火系技能傷害 +25%」） */
const line = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, mechanics });
/** 強屬性（◆） */
const strong = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, strong: true, mechanics });
/** 傳奇 / 神話效果（✦） */
const unique = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, unique: true, mechanics });

const mods = (when: Filter, m: Mods, extra: Partial<Extract<Mechanic, { type: 'mods' }>> = {}): Mechanic => ({ type: 'mods', when, mods: m, ...extra });
const on = (event: Extract<Mechanic, { type: 'trigger' }>['on'], actions: Action[], extra: Partial<Extract<Mechanic, { type: 'trigger' }>> = {}): Mechanic => ({
  type: 'trigger',
  on: event,
  actions,
  ...extra,
});
const cond = (extra: Partial<Extract<Mechanic, { type: 'conditional' }>>, stats: { stat: StatId; modifier?: 'flat' | 'increased'; value: number }[]): Mechanic => ({
  type: 'conditional',
  ...extra,
  stats,
});

// 動作
const at = (where: 'target' | 'self', category: 'melee' | 'ranged' | 'magic', effects: Effect[], hitFraction?: number): Action => ({
  type: 'effects',
  at: where,
  category,
  effects,
  ...(hitFraction ? { hitFraction } : {}),
});
const restore = (r: { hp?: number; mp?: number; hpOfDamage?: number }): Action => ({ type: 'restore', ...r });
const buff = (id: string, label: string, max: number, duration: number, stats: { stat: StatId; modifier?: 'flat' | 'increased'; value: number }[] = [], add = 1): Action => ({
  type: 'buff',
  id,
  label,
  max,
  duration,
  stats,
  add,
});
const arm = (id: string, when: Filter, m: Mods, duration = 5): Action => ({ type: 'arm', id, when, mods: m, duration });
const clear = (id: string): Action => ({ type: 'clearBuff', id });

/** 近戰 C 路線「刃術」 */
const BLADE_ART = ['melee.dash_slash', 'melee.quake_slash', 'melee.launch_slash', 'melee.execution_slash'];

// 效果
type DamageElement = 'physical' | 'fire' | 'cold' | 'lightning' | 'poison';
const hit = (element: DamageElement, multiplier = 1, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({ type: 'damage', element, scaling, multiplier });
const area = (radius: number, effects: Effect[], angleDeg?: number): Effect => ({ type: 'area', radius, effects, ...(angleDeg ? { angleDeg } : {}) });
const status = (s: 'slow' | 'freeze' | 'stun' | 'armorBreak' | 'weakPoint' | 'guard' | 'ironWill', duration: number, magnitude = 0, extra: { chance?: number; target?: 'self' | 'target' } = {}): Effect => ({
  type: 'status',
  status: s,
  duration,
  magnitude,
  ...extra,
});
const ring = (count: number, element: DamageElement, speed = 8, range = 4.5, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.2,
  range,
  count,
  spreadDeg: 360,
  onHit: [hit(element, 1, scaling)],
});
const fan = (count: number, spreadDeg: number, element: DamageElement, speed = 11, range = 7): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.18,
  range,
  count,
  spreadDeg,
  onHit: [hit(element)],
});
const rain = (repeat: number, scatter: number, radius: number, element: DamageElement, multiplier: number, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({
  type: 'delayed',
  delay: 0.3,
  repeat,
  interval: 0.15,
  scatter,
  effects: [area(radius, [hit(element, multiplier, scaling)])],
});

const MELEE: Filter = { categories: ['melee'] };
const RANGED: Filter = { categories: ['ranged'] };
const MAGIC: Filter = { categories: ['magic'] };
const FINISHER: Filter = { step: 3, comboOnly: true };

// ═══════════════════════════ 橘 · 傳奇 ═══════════════════════════

const legendary: Def[] = [
  // ── 劍 ──
  {
    id: 'legendary.cold_moon',
    name: '寒月',
    rarity: 'legendary',
    kind: 'sword',
    role: '高速近戰 / 寒冰混合',
    lore: '月光凝成的薄刃，每揮出第五劍，空氣都會結霜。',
    main: [2.35, 2.55],
    lines: [
      inc('attackSpeed', 0.14, 0.18),
      stat('critChance', 0.07, 0.09),
      stat('coldDamagePct', 0.16, 0.2),
      strong('多段技能傷害 +22%', mods({ tags: ['MultiHit'] }, { damage: 0.22 })),
      unique(
        '每第 5 次近戰命中，釋放小型冰霜新星（寒冰傷害、緩速，20% 機率凍結）',
        on('hit', [at('self', 'melee', [area(2.6, [hit('cold', 0.7), status('slow', 1.5, 0.35), status('freeze', 0.8, 0, { chance: 0.2 })])])], { when: MELEE, every: 5 }),
      ),
    ],
  },
  {
    id: 'legendary.oathkeeper',
    name: '王者之誓',
    rarity: 'legendary',
    kind: 'sword',
    role: '防守反擊',
    lore: '守誓的騎士只在被攻擊之後才拔劍——而那一劍從不落空。',
    main: [2.5, 2.7],
    lines: [
      inc('maxHp', 0.1, 0.14),
      inc('defense', 0.13, 0.17),
      stat('meleeDamageBonus', 0.1, 0.14),
      strong('刃術技能傷害 +35%', mods({ skills: BLADE_ART }, { damage: 0.35 })),
      unique(
        '受到近身攻擊時 25% 機率：下一次刃術技能傷害 +50%、暴擊率 +20%（冷卻 2 秒）',
        on('hurt', [arm('oathkeeper', { skills: BLADE_ART }, { damage: 0.5, crit: 0.2 }, 6)], { near: 2, chance: 0.25, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.crimson_moon',
    name: '緋月',
    rarity: 'legendary',
    kind: 'sword',
    role: '快攻吸血',
    lore: '刃紋裡流動著不屬於持有者的血。',
    minItemLevel: 4,
    main: [2.25, 2.45],
    lines: [
      inc('attackSpeed', 0.1, 0.14),
      stat('lifeSteal', 0.025, 0.035),
      stat('critDamageBonus', 0.18, 0.24),
      strong('快速技能傷害 +20%', mods({ tags: ['Fast'] }, { damage: 0.2 })),
      unique('近戰暴擊時，回復造成傷害 15% 的生命', on('crit', [restore({ hpOfDamage: 0.15 })], { when: MELEE })),
    ],
  },

  // ── 斧 ──
  {
    id: 'legendary.mountain_splitter',
    name: '裂山',
    rarity: 'legendary',
    kind: 'axe',
    role: '重砍流 / 震波',
    lore: '傳說一名樵夫用它劈開了擋路的山。',
    main: [2.6, 2.8],
    lines: [
      stat('meleeDamageBonus', 0.18, 0.22),
      inc('attackSpeed', 0.08, 0.12),
      inc('maxHp', 0.08, 0.12),
      strong('重擊類技能傷害 +25%、擊退 +30%（M10 後改為硬直）', mods({ tags: ['Heavy'] }, { damage: 0.25, knockback: 0.3 })),
      unique(
        '重擊類技能命中時，產生一道短距離震波，造成該擊 35% 傷害',
        on('hit', [at('target', 'melee', [area(2, [hit('physical')])], 0.35)], { when: { tags: ['Heavy'] }, cooldown: 0.3 }),
      ),
    ],
  },
  {
    id: 'legendary.butcher',
    name: '屠夫之頸',
    rarity: 'legendary',
    kind: 'axe',
    role: '收割 / 連殺',
    lore: '刀口上沒有一道缺口，因為它從不需要砍第二次。',
    minItemLevel: 5,
    main: [2.7, 2.9],
    lines: [
      stat('critChance', 0.05, 0.07),
      stat('meleeDamageBonus', 0.13, 0.17),
      stat('lifeSteal', 0.025, 0.035),
      strong('對生命低於 30% 的敵人，近戰傷害 +35%', mods(MELEE, { vsLowHp: { below: 0.3, damage: 0.35 } })),
      unique(
        '近戰擊殺時「屠戮」+1 層（最多 5 層、6 秒）：每層攻擊速度 +8%',
        on('kill', [buff('butcher', '屠戮', 5, 6, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.08 }])], { when: MELEE }),
      ),
    ],
  },
  {
    id: 'legendary.thunder_axe',
    name: '雷霆戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '衝擊 / 閃電混合',
    lore: '斧刃上刻著風暴之神的名字，每一擊都在等待雷鳴。',
    main: [2.4, 2.6],
    lines: [
      stat('lightningDamagePct', 0.13, 0.17),
      inc('attackSpeed', 0.07, 0.09),
      stat('critChance', 0.04, 0.06),
      strong('衝擊類技能傷害 +25%', mods({ tags: ['Impact'] }, { damage: 0.25 })),
      unique(
        '近戰命中時 20% 機率引發連鎖閃電（彈跳 3 次，每次該擊 40% 傷害）',
        on('hit', [at('target', 'melee', [{ type: 'chain', jumps: 3, radius: 4, effects: [hit('lightning')] }], 0.4)], { when: MELEE, chance: 0.2, cooldown: 0.5 }),
      ),
    ],
  },

  // ── 弓 ──
  {
    id: 'legendary.wind_chaser',
    name: '追風者',
    rarity: 'legendary',
    kind: 'bow',
    role: '投射物 / 穿透',
    lore: '弓弦用風暴裡捕來的一縷風製成。',
    main: [2.4, 2.6],
    lines: [
      stat('rangedDamageBonus', 0.16, 0.2),
      stat('critChance', 0.06, 0.08),
      inc('attackSpeed', 0.07, 0.09),
      strong('穿透箭傷害 +30%、箭速 +25%', mods({ skills: ['ranged.piercing_shot'] }, { damage: 0.3, projectileSpeed: 0.25 })),
      unique(
        '投射物命中時，分裂成左右兩支箭，各造成該擊 45% 傷害',
        on('hit', [at('target', 'ranged', [fan(2, 50, 'physical')], 0.45)], { when: { tags: ['Projectile'], categories: ['ranged'] }, cooldown: 0.12 }),
      ),
    ],
  },
  {
    id: 'legendary.storm_eye',
    name: '風暴之眼',
    rarity: 'legendary',
    kind: 'bow',
    role: '連射 / 落雷',
    lore: '瞄準的時候，天空會跟著一起瞄準。',
    minItemLevel: 5,
    main: [2.6, 2.8],
    lines: [
      stat('rangedDamageBonus', 0.13, 0.17),
      stat('lightningDamagePct', 0.1, 0.14),
      inc('attackSpeed', 0.08, 0.12),
      strong('多段遠程技能傷害 +22%', mods({ tags: ['MultiHit'], categories: ['ranged'] }, { damage: 0.22 })),
      unique(
        '遠程暴擊時，落雷打擊目標（該擊 60% 閃電傷害，冷卻 1 秒）',
        on('crit', [at('target', 'ranged', [area(1.3, [hit('lightning')])], 0.6)], { when: RANGED, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.shadow_hunter',
    name: '獵影者',
    rarity: 'legendary',
    kind: 'bow',
    role: '標記 / 狙殺',
    lore: '被它盯上的影子，不會再看到下一個黎明。',
    minItemLevel: 8,
    main: [2.3, 2.5],
    lines: [
      stat('critChance', 0.05, 0.07),
      stat('critDamageBonus', 0.22, 0.28),
      stat('rangedDamageBonus', 0.1, 0.14),
      strong('狙殺傷害 +30%', mods({ skills: ['ranged.execution_shot'] }, { damage: 0.3 })),
      unique('對弱點標記的敵人，遠程暴擊率 +20%', mods(RANGED, { vsStatus: { statuses: ['weakPoint'], crit: 0.2 } })),
    ],
  },

  // ── 杖 ──
  {
    id: 'legendary.star_burner',
    name: '焚星',
    rarity: 'legendary',
    kind: 'staff',
    role: '火焰法術',
    lore: '杖頭的晶石裡封著一顆墜落的星。',
    main: [2.5, 2.7],
    lines: [
      line('火系技能傷害 +25%', mods({ elements: ['Fire'] }, { damage: 0.25 })),
      inc('maxMana', 0.18, 0.22),
      stat('castSpeed', 0.1, 0.14),
      strong('火球傷害 +30%', mods({ skills: ['magic.fireball'] }, { damage: 0.3 })),
      unique(
        '火球命中後分裂成 3 顆小火球，各造成原傷害 35%',
        on('hit', [at('target', 'magic', [ring(3, 'fire', 8, 4, 'spell')], 0.35)], { when: { skills: ['magic.fireball'] }, cooldown: 0.1 }),
      ),
    ],
  },
  {
    id: 'legendary.permafrost',
    name: '永凍之心',
    rarity: 'legendary',
    kind: 'staff',
    role: '冰系控制',
    lore: '握著它的手永遠不會溫暖。',
    minItemLevel: 4,
    main: [2.4, 2.6],
    lines: [
      line('冰系技能傷害 +22%', mods({ elements: ['Ice'] }, { damage: 0.22 })),
      inc('maxMana', 0.13, 0.17),
      stat('coldResist', 0.13, 0.17),
      strong('冰系技能凍結機率 +15%', mods({ elements: ['Ice'] }, { freezeChance: 0.15 })),
      unique('對凍結的敵人，法術傷害 +30%', mods(MAGIC, { vsStatus: { statuses: ['freeze'], damage: 0.3 } })),
    ],
  },
  {
    id: 'legendary.thunder_scepter',
    name: '雷鳴權杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '閃電連鎖',
    lore: '權杖頂端的雷光從未熄滅過。',
    minItemLevel: 6,
    main: [2.7, 2.9],
    lines: [
      line('閃電技能傷害 +22%', mods({ elements: ['Lightning'] }, { damage: 0.22 })),
      stat('castSpeed', 0.08, 0.12),
      stat('manaCostReduction', 0.07, 0.09),
      strong('閃電技能彈跳 +2', mods({ elements: ['Lightning'] }, { chainCount: 2 })),
      unique('閃電技能暴擊時回復 5% 魔力（冷卻 2 秒）', on('crit', [restore({ mp: 0.05 })], { when: { elements: ['Lightning'] }, cooldown: 2 })),
    ],
  },

  // ── 頭盔 ──
  {
    id: 'legendary.seer_crown',
    name: '先知之冠',
    rarity: 'legendary',
    kind: 'helmet',
    role: '法術續航',
    lore: '戴上它的人能看見下一個咒語的形狀。',
    main: [2.3, 2.5],
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      inc('maxMana', 0.13, 0.17),
      flat('manaRegen', 1.2, 1.8),
      strongStat('castSpeed', 0.1, 0.14),
      unique('以法術結尾的 Combo 完成時，回復 8% 魔力', on('comboComplete', [restore({ mp: 0.08 })], { when: { categories: ['magic'] } })),
    ],
  },
  {
    id: 'legendary.berserker_helm',
    name: '狂戰士頭盔',
    rarity: 'legendary',
    kind: 'helmet',
    role: '低血狂暴',
    lore: '頭盔內側刻滿了戰死者的名字，還留著一個空位。',
    minItemLevel: 3,
    main: [2.5, 2.7],
    lines: [
      stat('meleeDamageBonus', 0.1, 0.14),
      inc('maxHp', 0.08, 0.12),
      inc('attackSpeed', 0.05, 0.07),
      strong('生命低於 50% 時，所有傷害 +20%', cond({ hpBelow: 0.5 }, [{ stat: 'damageBonus', value: 0.2 }])),
      unique('近戰擊殺時回復 5% 生命', on('kill', [restore({ hp: 0.05 })], { when: MELEE })),
    ],
  },
  {
    id: 'legendary.hawkeye',
    name: '鷹眼頭巾',
    rarity: 'legendary',
    kind: 'helmet',
    role: '遠距狙擊',
    lore: '在一里外就能看清獵物眨眼。',
    minItemLevel: 5,
    main: [2.2, 2.4],
    lines: [
      stat('rangedDamageBonus', 0.1, 0.14),
      stat('critChance', 0.04, 0.06),
      stat('dodgeChance', 0.03, 0.05),
      strong('遠距技能傷害 +18%', mods({ ranges: ['Far'] }, { damage: 0.18 })),
      unique('身邊 3 格內沒有敵人時，暴擊率 +10%', cond({ noEnemiesWithin: 3 }, [{ stat: 'critChance', value: 0.1 }])),
    ],
  },

  // ── 盔甲 ──
  {
    id: 'legendary.obsidian_bulwark',
    name: '黑曜壁壘',
    rarity: 'legendary',
    kind: 'armor',
    role: '近戰生存',
    lore: '火山玻璃打磨的胸甲，越靠近敵人越堅硬。',
    main: [2.75, 2.95],
    lines: [
      inc('maxHp', 0.18, 0.22),
      stat('damageReduction', 0.04, 0.06),
      stat('hpRegenPct', 0.004, 0.006),
      strong('近身 2.5 格內有敵人時，受到傷害 -8%', cond({ enemiesWithin: { radius: 2.5 } }, [{ stat: 'damageReduction', value: 0.08 }])),
      unique(
        '近戰命中累積「黑曜」（最多 5 層、4 秒）；滿 5 層時防禦 +20%（M10 後改為 Momentum）',
        on('hit', [buff('obsidian', '黑曜', 5, 4)], { when: MELEE }),
        cond({ buff: { id: 'obsidian', atLeast: 5 } }, [{ stat: 'defense', modifier: 'increased', value: 0.2 }]),
      ),
    ],
  },
  {
    id: 'legendary.thorn_mail',
    name: '荊棘聖甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '反傷',
    lore: '聖騎士的鎖子甲，每一環都鍛成了倒鉤。',
    minItemLevel: 3,
    main: [2.4, 2.6],
    lines: [
      flat('thorns', 10, 14),
      inc('maxHp', 0.1, 0.14),
      inc('defense', 0.1, 0.14),
      strongStat('damageReduction', 0.05, 0.07),
      unique(
        '受到近身攻擊時 30% 機率反震：周圍敵人受到武器 60% 傷害並被擊退（冷卻 1 秒）',
        on('hurt', [at('self', 'melee', [area(2.2, [hit('physical', 0.6), { type: 'knockback', distance: 1 }])])], { near: 2, chance: 0.3, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.starlight_robe',
    name: '星辰法袍',
    rarity: 'legendary',
    kind: 'armor',
    role: '法師防護',
    lore: '織入星光的長袍，會替主人擋下第一擊。',
    minItemLevel: 4,
    main: [2.1, 2.3],
    lines: [
      inc('maxMana', 0.18, 0.22),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('castSpeed', 0.06, 0.1),
      strongStat('manaCostReduction', 0.1, 0.14),
      unique(
        '受到傷害時，若魔力高於 50%，獲得格擋：下一次受到的傷害 -30%（冷卻 4 秒）',
        on('hurt', [at('self', 'magic', [status('guard', 5, 0.3, { target: 'self' })])], { mpAbove: 0.5, cooldown: 4 }),
      ),
    ],
  },

  // ── 手套 ──
  {
    id: 'legendary.smasher_grip',
    name: '碎擊者之握',
    rarity: 'legendary',
    kind: 'gloves',
    role: '衝擊 / 重擊',
    lore: '戴上它的拳頭會自己握緊。',
    main: [2.15, 2.35],
    lines: [
      inc('attackSpeed', 0.08, 0.12),
      stat('meleeDamageBonus', 0.13, 0.17),
      stat('critDamageBonus', 0.13, 0.17),
      strong('衝擊類技能傷害 +25%', mods({ tags: ['Impact'] }, { damage: 0.25 })),
      unique(
        '擊退敵人後，下一個重擊類技能傷害 +20%',
        on('hit', [arm('smasher', { tags: ['Heavy'] }, { damage: 0.2 }, 6)], { when: { tags: ['Knockback'] } }),
      ),
    ],
  },
  {
    id: 'legendary.repeater_gloves',
    name: '連弩手套',
    rarity: 'legendary',
    kind: 'gloves',
    role: '快速技能',
    lore: '手指的每一個關節都裝了機簧。',
    minItemLevel: 3,
    main: [2.2, 2.4],
    lines: [
      inc('attackSpeed', 0.1, 0.14),
      stat('rangedDamageBonus', 0.08, 0.12),
      stat('critChance', 0.03, 0.05),
      strong('快速技能傷害 +20%', mods({ tags: ['Fast'] }, { damage: 0.2 })),
      unique(
        '快速技能每第 4 次命中，追加一支造成該擊 100% 傷害的箭',
        on('hit', [at('self', 'ranged', [fan(1, 0, 'physical', 13)], 1)], { when: { tags: ['Fast'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.elemental_touch',
    name: '元素之觸',
    rarity: 'legendary',
    kind: 'gloves',
    role: '元素附加',
    lore: '指尖輪流燃燒、結凍、放電。',
    minItemLevel: 6,
    main: [2.1, 2.3],
    lines: [
      stat('fireDamagePct', 0.07, 0.09),
      stat('coldDamagePct', 0.07, 0.09),
      stat('lightningDamagePct', 0.07, 0.09),
      strongStat('castSpeed', 0.08, 0.12),
      unique(
        '法術命中時 15% 機率暴露弱點：目標受到的暴擊傷害 +25%，持續 4 秒',
        on('hit', [at('target', 'magic', [status('weakPoint', 4, 0.25)])], { when: MAGIC, chance: 0.15, cooldown: 0.5 }),
      ),
    ],
  },

  // ── 鞋子 ──
  {
    id: 'legendary.wind_trace',
    name: '風痕戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '機動',
    lore: '走過的地方，草會晚一秒才倒下。',
    main: [2.1, 2.3],
    lines: [
      inc('moveSpeed', 0.16, 0.2),
      stat('dodgeChance', 0.07, 0.09),
      inc('attackSpeed', 0.05, 0.07),
      strong('位移技能後，下一招傷害 +20%', on('cast', [arm('windtrace_next', {}, { damage: 0.2 }, 4)], { when: { tags: ['Retreat', 'Roll', 'Reposition', 'Advance'] } })),
      unique(
        '後跳射擊 / 突進斬後 2 秒內，投射物速度 +35%、傷害 +10%',
        on('cast', [buff('windtrace', '風痕', 1, 2)], { when: { skills: ['ranged.backstep_shot', 'melee.dash_slash'] } }),
        mods({ tags: ['Projectile'] }, { projectileSpeed: 0.35, damage: 0.1 }, { requireBuff: { id: 'windtrace', atLeast: 1 } }),
      ),
    ],
  },
  {
    id: 'legendary.charger_boots',
    name: '衝鋒戰靴',
    rarity: 'legendary',
    kind: 'boots',
    role: '突進',
    lore: '鐵靴的鞋底磨得發亮，只朝一個方向。',
    minItemLevel: 3,
    main: [2.4, 2.6],
    lines: [
      inc('moveSpeed', 0.1, 0.14),
      inc('maxHp', 0.08, 0.12),
      stat('meleeDamageBonus', 0.06, 0.1),
      strong('突進類技能傷害 +30%', mods({ tags: ['Advance'] }, { damage: 0.3 })),
      unique(
        '突進類技能命中後 3 秒內，攻擊速度 +20%',
        on('hit', [buff('charger', '衝鋒', 1, 3, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.2 }])], { when: { tags: ['Advance'] } }),
      ),
    ],
  },
  {
    id: 'legendary.ice_walker',
    name: '冰行者',
    rarity: 'legendary',
    kind: 'boots',
    role: '閃避 / 冰霜',
    lore: '穿著它走過湖面，會留下一串冰做的腳印。',
    minItemLevel: 5,
    main: [2.2, 2.4],
    lines: [
      inc('moveSpeed', 0.1, 0.14),
      stat('coldResist', 0.18, 0.22),
      stat('coldDamagePct', 0.06, 0.1),
      strongStat('dodgeChance', 0.07, 0.09),
      unique(
        '閃避攻擊時，腳下爆發冰霜：周圍敵人受到武器 50% 寒冰傷害並緩速（冷卻 1.5 秒）',
        on('dodge', [at('self', 'magic', [area(2.5, [hit('cold', 0.5), status('slow', 2, 0.4)])])], { cooldown: 1.5 }),
      ),
    ],
  },

  // ── 戒指 ──
  {
    id: 'legendary.hunter_mark',
    name: '獵殺印記',
    rarity: 'legendary',
    kind: 'ring',
    role: '標記 / 處決',
    lore: '印記亮起的時候，獵物已經死了，只是還不知道。',
    lines: [
      stat('critChance', 0.07, 0.09),
      stat('critDamageBonus', 0.22, 0.28),
      stat('rangedDamageBonus', 0.13, 0.17),
      line('狙殺傷害 +20%', mods({ skills: ['ranged.execution_shot'] }, { damage: 0.2 })),
      strong('對弱點標記的敵人傷害 +10%', mods({}, { vsStatus: { statuses: ['weakPoint'], damage: 0.1 } })),
      unique('對弱點標記的敵人使用狙殺時，暴擊率 +25%', mods({ skills: ['ranged.execution_shot'] }, { vsStatus: { statuses: ['weakPoint'], crit: 0.25 } })),
    ],
  },
  {
    id: 'legendary.blood_pact',
    name: '鮮血契環',
    rarity: 'legendary',
    kind: 'ring',
    role: '吸血',
    lore: '簽下契約的那一滴血，至今還在戒面上流動。',
    lines: [
      inc('maxHp', 0.13, 0.17),
      stat('lifeSteal', 0.035, 0.045),
      stat('meleeDamageBonus', 0.13, 0.17),
      inc('attackSpeed', 0.07, 0.09),
      strong('近戰吸血效率提高：近戰命中額外回復傷害 1.5% 的生命', on('hit', [restore({ hpOfDamage: 0.015 })], { when: MELEE })),
      unique('生命低於 40% 時，生命吸取 +3%', cond({ hpBelow: 0.4 }, [{ stat: 'lifeSteal', value: 0.03 }])),
    ],
  },
  {
    id: 'legendary.arcane_band',
    name: '秘法指環',
    rarity: 'legendary',
    kind: 'ring',
    role: '魔力循環',
    lore: '戒圈內側的符文會隨著咒語一起發光。',
    minItemLevel: 3,
    lines: [
      stat('spellDamageBonus', 0.1, 0.14),
      inc('maxMana', 0.1, 0.14),
      flat('manaRegen', 0.8, 1.2),
      stat('castSpeed', 0.05, 0.07),
      strongStat('manaCostReduction', 0.08, 0.12),
      unique('法術擊殺時回復 4% 魔力', on('kill', [restore({ mp: 0.04 })], { when: MAGIC })),
    ],
  },

  // ── 護身符 ──
  {
    id: 'legendary.elemental_core',
    name: '元素核心',
    rarity: 'legendary',
    kind: 'amulet',
    role: '跨元素法術',
    lore: '三種元素在核心裡互相追逐，永不停歇。',
    lines: [
      inc('maxMana', 0.18, 0.22),
      line('火 / 冰 / 雷系技能傷害 +12%', mods({ elements: ['Fire', 'Ice', 'Lightning'] }, { damage: 0.12 })),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('castSpeed', 0.05, 0.07),
      strongStat('critDamageBonus', 0.18, 0.22),
      unique('Combo 同時包含兩種以上不同元素時，第三招傷害 +25%', mods({ ...FINISHER, minElements: 2 }, { damage: 0.25 })),
    ],
  },
  {
    id: 'legendary.war_god_amulet',
    name: '戰神護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '近身連段',
    lore: '戰神只祝福那些敢站在刀鋒前的人。',
    minItemLevel: 3,
    lines: [
      inc('maxHp', 0.1, 0.14),
      stat('meleeDamageBonus', 0.1, 0.14),
      inc('attackSpeed', 0.05, 0.07),
      stat('lifeSteal', 0.015, 0.025),
      strong('三招皆為近身的 Combo 傷害 +15%', mods({ comboOnly: true, allRange: 'Near' }, { damage: 0.15 })),
      unique(
        '以近身技能結尾的 Combo 完成後 4 秒內，受到傷害 -10%',
        on('comboComplete', [buff('wargod', '戰神', 1, 4, [{ stat: 'damageReduction', value: 0.1 }])], { when: { ranges: ['Near'] } }),
      ),
    ],
  },
  {
    id: 'legendary.traveler_charm',
    name: '旅者護符',
    rarity: 'legendary',
    kind: 'amulet',
    role: '橋接 / 續航',
    lore: '走過每一條地下通道的旅人，最後都把它留給了下一個人。',
    lines: [
      inc('moveSpeed', 0.07, 0.09),
      stat('dodgeChance', 0.04, 0.06),
      inc('maxHp', 0.07, 0.09),
      stat('potionEffect', 0.18, 0.22),
      strong('橋接技能傷害 +20%', mods({ roles: ['Bridge'] }, { damage: 0.2 })),
      unique('擊殺時回復 3% 生命與魔力', on('kill', [restore({ hp: 0.03, mp: 0.03 })])),
    ],
  },
];

// ═══════════════════════════ 紅 · 神話 ═══════════════════════════

const mythic: Def[] = [
  // ── 劍 ──
  {
    id: 'mythic.world_rift',
    name: '世界裂痕',
    rarity: 'mythic',
    kind: 'sword',
    role: '純近戰 Combo 核心',
    lore: '揮下的那一刻，大地想起了自己曾經裂開過。',
    minItemLevel: 10,
    main: [3.6, 3.8],
    lines: [
      stat('meleeDamageBonus', 0.28, 0.32),
      inc('attackSpeed', 0.12, 0.16),
      stat('lifeSteal', 0.045, 0.055),
      stat('critDamageBonus', 0.22, 0.28),
      unique('重擊類技能命中時產生震波，造成該擊 50% 傷害', on('hit', [at('target', 'melee', [area(2.2, [hit('physical')])], 0.5)], { when: { tags: ['Heavy'] }, cooldown: 0.3 })),
      unique(
        '震波有 35% 機率造成破甲（防禦 -25%，4 秒；M10 後改為累積硬直）',
        on('hit', [at('target', 'melee', [area(2.2, [status('armorBreak', 4, 0.25)])])], { when: { tags: ['Heavy'] }, chance: 0.35, cooldown: 0.3 }),
      ),
      unique(
        '三招皆為近身且技能都不同的 Combo：第三招再次釋放一道 50% 威力的大範圍震波',
        on('hit', [at('target', 'melee', [area(3.2, [hit('physical')])], 0.5)], { when: { ...FINISHER, allRange: 'Near', distinctSkills: true }, cooldown: 0.8 }),
      ),
    ],
  },
  {
    id: 'mythic.eternity',
    name: '永恆之刃',
    rarity: 'mythic',
    kind: 'sword',
    role: '暴擊累積',
    lore: '每一次命中要害，劍身就更亮一分；據說它從未完全暗下來過。',
    minItemLevel: 12,
    main: [3.3, 3.5],
    lines: [
      stat('critChance', 0.09, 0.11),
      stat('critDamageBonus', 0.32, 0.38),
      inc('attackSpeed', 0.1, 0.14),
      stat('meleeDamageBonus', 0.18, 0.22),
      unique(
        '近戰暴擊時累積「永恆」（最多 10 層、5 秒）：每層暴擊傷害 +4%',
        on('crit', [buff('eternity', '永恆', 10, 5, [{ stat: 'critDamageBonus', value: 0.04 }])], { when: MELEE }),
      ),
      unique(
        '滿 10 層時，下一個終結技傷害 +60%，並消耗所有層數',
        mods({ roles: ['Finisher'] }, { damage: 0.6 }, { requireBuff: { id: 'eternity', atLeast: 10 }, consumeBuff: 'eternity' }),
      ),
      unique('暴擊時 10% 機率回復 3% 生命', on('crit', [restore({ hp: 0.03 })], { chance: 0.1 })),
    ],
  },

  // ── 斧 ──
  {
    id: 'mythic.beast_god_fang',
    name: '獸神之齒',
    rarity: 'mythic',
    kind: 'axe',
    role: '狂暴重擊 / 層數',
    lore: '從遠古獸神的顎骨上拔下的牙，至今還渴望撕咬。',
    minItemLevel: 10,
    main: [3.8, 4],
    lines: [
      stat('meleeDamageBonus', 0.28, 0.34),
      stat('lifeSteal', 0.055, 0.065),
      inc('moveSpeed', 0.1, 0.14),
      inc('attackSpeed', 0.07, 0.09),
      unique(
        '近戰命中獲得 2 層「獸性」（最多 7 層、5 秒；M10 後改為 Momentum）：每層攻擊速度 +3%',
        on('hit', [buff('beast', '獸性', 7, 5, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.03 }], 2)], { when: MELEE }),
      ),
      unique('重擊類技能每層獸性傷害 +5%', mods({ tags: ['Heavy'] }, { damage: 0.05 }, { scale: { by: 'buff', id: 'beast' } })),
      unique(
        '獸性滿 7 層時，重擊類技能追加一次 60% 傷害的回響',
        on('hit', [at('target', 'melee', [area(1.6, [hit('physical')])], 0.6)], { when: { tags: ['Heavy'] }, requireBuff: { id: 'beast', atLeast: 7 }, cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'mythic.doomsday',
    name: '末日審判',
    rarity: 'mythic',
    kind: 'axe',
    role: '處決 / 連鎖爆炸',
    lore: '審判不需要證詞，只需要一把足夠重的斧頭。',
    minItemLevel: 14,
    main: [3.4, 3.6],
    lines: [
      stat('meleeDamageBonus', 0.22, 0.28),
      stat('fireDamagePct', 0.13, 0.17),
      stat('critChance', 0.07, 0.09),
      inc('maxHp', 0.13, 0.17),
      unique('對生命低於 30% 的敵人，近戰傷害 +40%', mods(MELEE, { vsLowHp: { below: 0.3, damage: 0.4 } })),
      unique('近戰擊殺時，敵人爆炸：周圍受到武器 80% 火焰傷害', on('kill', [at('target', 'melee', [area(2.5, [hit('fire', 0.8)])])], { when: MELEE })),
      unique(
        '擊殺時「審判」+1 層（最多 5 層、6 秒）：每層所有傷害 +5%',
        on('kill', [buff('judgement', '審判', 5, 6, [{ stat: 'damageBonus', value: 0.05 }])]),
      ),
    ],
  },

  // ── 弓 ──
  {
    id: 'mythic.sky_rending_string',
    name: '天穹裂弦',
    rarity: 'mythic',
    kind: 'bow',
    role: '全投射物 Build',
    lore: '拉滿弓弦的時候，天空會出現一道細細的裂縫。',
    minItemLevel: 10,
    main: [3.45, 3.65],
    lines: [
      stat('rangedDamageBonus', 0.26, 0.3),
      stat('critChance', 0.09, 0.11),
      inc('attackSpeed', 0.08, 0.12),
      line('所有投射物穿透 +1', mods({ tags: ['Projectile'] }, { pierce: 1 })),
      unique('所有投射物速度 +30%、傷害 +10%', mods({ tags: ['Projectile'] }, { projectileSpeed: 0.3, damage: 0.1 })),
      unique('Combo 第三招若為投射物，額外發射一發', mods({ ...FINISHER, tags: ['Projectile'] }, { projectileCount: 1 })),
      unique(
        '投射物每命中 3 次，下一發投射物必定暴擊',
        on('hit', [arm('sky_crit', { tags: ['Projectile'] }, { crit: 1 }, 8)], { when: { tags: ['Projectile'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'mythic.starfall_volley',
    name: '群星箭雨',
    rarity: 'mythic',
    kind: 'bow',
    role: '範圍連射',
    lore: '射向天空的每一支箭，都會帶著一顆星落回地面。',
    minItemLevel: 12,
    main: [3.2, 3.4],
    lines: [
      stat('rangedDamageBonus', 0.2, 0.24),
      inc('attackSpeed', 0.1, 0.14),
      stat('lightningDamagePct', 0.08, 0.12),
      stat('critDamageBonus', 0.18, 0.22),
      unique('箭雨傷害 +40%、範圍 +30%', mods({ skills: ['ranged.rain_of_arrows'] }, { damage: 0.4, aoeRadius: 0.3 })),
      unique(
        '多段技能命中時 10% 機率，在目標周圍降下小型箭雨（5 次、武器 40% 傷害）',
        on('hit', [at('target', 'ranged', [rain(5, 1.6, 1.1, 'physical', 0.4)])], { when: { tags: ['MultiHit'] }, chance: 0.1, cooldown: 1 }),
      ),
      unique(
        '以範圍技能結尾的 Combo 完成後 4 秒內，攻擊速度 +20%',
        on('comboComplete', [buff('starfall', '星落', 1, 4, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.2 }])], { when: { tags: ['AoE'] } }),
      ),
    ],
  },

  // ── 杖 ──
  {
    id: 'mythic.void_scepter',
    name: '虛空權杖',
    rarity: 'mythic',
    kind: 'staff',
    role: '全元素 Combo 法師',
    lore: '三種元素在虛空裡相遇，誕生了第四種——毀滅。',
    minItemLevel: 10,
    main: [3.55, 3.75],
    lines: [
      stat('spellDamageBonus', 0.26, 0.3),
      inc('maxMana', 0.28, 0.32),
      stat('castSpeed', 0.16, 0.2),
      stat('manaCostReduction', 0.13, 0.17),
      unique('Combo 中每出現一種不同元素，第三招傷害 +12%', mods(FINISHER, { damage: 0.12 }, { scale: { by: 'elements' } })),
      unique('三種不同元素組成的 Combo，第三招範圍 +40%', mods({ ...FINISHER, minElements: 3 }, { aoeRadius: 0.4 })),
      unique('三元素 Combo 完成時，回復 15% 魔力', on('comboComplete', [restore({ mp: 0.15 })], { when: { minElements: 3 } })),
    ],
  },
  {
    id: 'mythic.frozen_throne',
    name: '冰封王座',
    rarity: 'mythic',
    kind: 'staff',
    role: '凍結碎裂',
    lore: '冰封之王的權杖，觸碰到的一切都會變成王座的一部分。',
    minItemLevel: 14,
    main: [3.3, 3.5],
    lines: [
      stat('spellDamageBonus', 0.2, 0.24),
      stat('coldDamagePct', 0.13, 0.17),
      inc('maxMana', 0.18, 0.22),
      stat('coldResist', 0.22, 0.28),
      unique('冰系技能凍結機率 +20%', mods({ elements: ['Ice'] }, { freezeChance: 0.2 })),
      unique('對凍結的敵人，所有傷害 +35%', mods({}, { vsStatus: { statuses: ['freeze'], damage: 0.35 } })),
      unique(
        '擊殺凍結的敵人時碎裂，周圍受到 100% 法術強度的寒冰傷害並凍結 0.8 秒',
        on('kill', [at('target', 'magic', [area(2.5, [hit('cold', 1, 'spell'), status('freeze', 0.8)])])], { targetStatus: 'freeze' }),
      ),
    ],
  },

  // ── 頭盔 ──
  {
    id: 'mythic.crown_of_ages',
    name: '歲月王冠',
    rarity: 'mythic',
    kind: 'helmet',
    role: '絕境生存',
    lore: '歷代國王都戴著它死去，但沒有一個死得太早。',
    minItemLevel: 10,
    main: [3.2, 3.4],
    lines: [
      inc('maxHp', 0.18, 0.22),
      stat('damageReduction', 0.05, 0.07),
      stat('fireResist', 0.13, 0.17),
      stat('coldResist', 0.13, 0.17),
      unique('生命低於 35% 時，受到傷害 -15%', cond({ hpBelow: 0.35 }, [{ stat: 'damageReduction', value: 0.15 }])),
      unique('生命低於 30% 時回復 25% 生命（冷卻 20 秒）', on('hurt', [restore({ hp: 0.25 })], { hpBelow: 0.3, cooldown: 20 })),
      unique(
        '每次完成 Combo，「王權」+1 層（最多 5 層、6 秒）：每層受到傷害 -2%',
        on('comboComplete', [buff('crown', '王權', 5, 6, [{ stat: 'damageReduction', value: 0.02 }])]),
      ),
    ],
  },
  {
    id: 'mythic.storm_crown',
    name: '風暴之冠',
    rarity: 'mythic',
    kind: 'helmet',
    role: '閃電風暴',
    lore: '戴上它的人，頭頂永遠籠罩著一片烏雲。',
    minItemLevel: 12,
    main: [3.1, 3.3],
    lines: [
      stat('lightningDamagePct', 0.13, 0.17),
      stat('castSpeed', 0.1, 0.14),
      inc('maxMana', 0.18, 0.22),
      stat('lightningResist', 0.22, 0.28),
      unique('閃電技能彈跳 +2', mods({ elements: ['Lightning'] }, { chainCount: 2 })),
      unique(
        '閃電技能命中時 15% 機率，落雷打擊目標（該擊 50% 傷害）',
        on('hit', [at('target', 'magic', [area(1.2, [hit('lightning')])], 0.5)], { when: { elements: ['Lightning'] }, chance: 0.15, cooldown: 0.5 }),
      ),
      unique(
        '閃電技能擊殺時「雷暴」+1 層（最多 5 層、6 秒）：每層施法速度 +5%',
        on('kill', [buff('storm', '雷暴', 5, 6, [{ stat: 'castSpeed', value: 0.05 }])], { when: { elements: ['Lightning'] } }),
      ),
    ],
  },

  // ── 盔甲 ──
  {
    id: 'mythic.abyss_carapace',
    name: '深淵甲殼',
    rarity: 'mythic',
    kind: 'armor',
    role: '硬坦 / 防守轉輸出',
    lore: '深淵巨獸蛻下的殼，挨的打越多，反擊越重。',
    minItemLevel: 10,
    main: [3.7, 3.9],
    lines: [
      inc('maxHp', 0.38, 0.42),
      stat('damageReduction', 0.07, 0.09),
      inc('defense', 0.23, 0.27),
      stat('hpRegenPct', 0.005, 0.007),
      unique(
        '近身 2.5 格內每有一名敵人，受到傷害 -2%（最多 -10%）',
        cond({ enemiesWithin: { radius: 2.5, perEnemy: true, max: 5 } }, [{ stat: 'damageReduction', value: 0.02 }]),
      ),
      unique(
        '受到近身攻擊時獲得 1 層「甲殼」（最多 5 層、8 秒）：每層防禦 +4%',
        on('hurt', [buff('shell', '甲殼', 5, 8, [{ stat: 'defense', modifier: 'increased', value: 0.04 }])], { near: 2 }),
      ),
      unique(
        '滿 5 層時，下一個重擊類技能消耗全部甲殼，傷害 +40%',
        mods({ tags: ['Heavy'] }, { damage: 0.4 }, { requireBuff: { id: 'shell', atLeast: 5 }, consumeBuff: 'shell' }),
      ),
    ],
  },
  {
    id: 'mythic.undying',
    name: '不朽者',
    rarity: 'mythic',
    kind: 'armor',
    role: '不死續航',
    lore: '穿著它的戰士倒下過七次，站起來了八次。',
    minItemLevel: 14,
    main: [3.3, 3.5],
    lines: [
      inc('maxHp', 0.28, 0.32),
      stat('lifeSteal', 0.035, 0.045),
      stat('hpRegenPct', 0.007, 0.009),
      flat('thorns', 18, 22),
      unique(
        '生命低於 25% 時，獲得 5 秒鋼鐵意志（受到傷害 -50%、免疫擊退）並回復 30% 生命（冷卻 60 秒）',
        on('hurt', [at('self', 'melee', [status('ironWill', 5, 0.5, { target: 'self' })]), restore({ hp: 0.3 })], { hpBelow: 0.25, cooldown: 60 }),
      ),
      unique(
        '受到近身攻擊時 30% 機率反擊周圍（武器 80% 傷害，冷卻 1 秒）',
        on('hurt', [at('self', 'melee', [area(2.2, [hit('physical', 0.8)])])], { near: 2, chance: 0.3, cooldown: 1 }),
      ),
      unique('生命高於 80% 時，所有傷害 +15%', cond({ hpAbove: 0.8 }, [{ stat: 'damageBonus', value: 0.15 }])),
    ],
  },

  // ── 手套 ──
  {
    id: 'mythic.god_hunter_hands',
    name: '獵神之手',
    rarity: 'mythic',
    kind: 'gloves',
    role: '暴擊終結',
    lore: '據說這雙手套曾經扼住一位神明的咽喉。',
    minItemLevel: 10,
    main: [3, 3.2],
    lines: [
      stat('critChance', 0.11, 0.13),
      stat('critDamageBonus', 0.32, 0.38),
      inc('attackSpeed', 0.1, 0.14),
      stat('castSpeed', 0.1, 0.14),
      unique('Combo 第三段傷害 +20%、暴擊率 +15%', mods(FINISHER, { damage: 0.2, crit: 0.15 })),
      unique('Combo 第三段暴擊時，回復 5% 魔力', on('crit', [restore({ mp: 0.05 })], { when: FINISHER, cooldown: 0.5 })),
      unique(
        'Combo 第三段累計暴擊 3 次後，下一個第三段必定暴擊',
        on('crit', [arm('god_hunter', FINISHER, { crit: 1 }, 30)], { when: FINISHER, every: 3, cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'mythic.titan_grip',
    name: '泰坦之握',
    rarity: 'mythic',
    kind: 'gloves',
    role: '重擊與快攻交替',
    lore: '泰坦的護手大得不像是給人戴的——直到它自己縮小了。',
    minItemLevel: 12,
    main: [3.6, 3.8],
    lines: [
      stat('meleeDamageBonus', 0.22, 0.28),
      inc('attackSpeed', 0.08, 0.12),
      inc('maxHp', 0.13, 0.17),
      stat('critDamageBonus', 0.18, 0.22),
      unique('衝擊類技能傷害 +25%、擊退 +100%', mods({ tags: ['Impact'] }, { damage: 0.25, knockback: 1 })),
      unique(
        '衝擊類技能命中時 30% 機率暈眩目標 0.8 秒（M10 後改為硬直）',
        on('hit', [at('target', 'melee', [status('stun', 0.8)])], { when: { tags: ['Impact'] }, chance: 0.3, cooldown: 1 }),
      ),
      unique('重擊類技能命中後，下一個快速技能傷害 +40%', on('hit', [arm('titan', { tags: ['Fast'] }, { damage: 0.4 }, 5)], { when: { tags: ['Heavy'] } })),
    ],
  },

  // ── 鞋子 ──
  {
    id: 'mythic.realm_walker',
    name: '踏界者',
    rarity: 'mythic',
    kind: 'boots',
    role: '距離轉換 Combo',
    lore: '一步踏在近處，下一步已經在遠方。',
    minItemLevel: 10,
    main: [2.9, 3.1],
    lines: [
      inc('moveSpeed', 0.23, 0.27),
      stat('dodgeChance', 0.11, 0.13),
      inc('attackSpeed', 0.07, 0.09),
      inc('maxHp', 0.1, 0.14),
      unique('所有中距離 / 橋接技能魔力消耗 -30%', mods({ ranges: ['Mid'] }, { mp: -0.3 })),
      unique('近 → 中 → 遠 的 Combo，第三招傷害 +30%', mods({ ...FINISHER, rangePattern: ['Near', 'Mid', 'Far'] }, { damage: 0.3 })),
      unique('遠 → 中 → 近 的 Combo，第三招傷害 +30%', mods({ ...FINISHER, rangePattern: ['Far', 'Mid', 'Near'] }, { damage: 0.3 })),
    ],
  },
  {
    id: 'mythic.phantom_step',
    name: '幽影步',
    rarity: 'mythic',
    kind: 'boots',
    role: '閃避反擊',
    lore: '穿著它的人從不擋架——因為攻擊永遠只打中影子。',
    minItemLevel: 12,
    main: [3.1, 3.3],
    lines: [
      stat('dodgeChance', 0.09, 0.11),
      inc('moveSpeed', 0.13, 0.17),
      stat('critChance', 0.07, 0.09),
      stat('rangedDamageBonus', 0.13, 0.17),
      unique('閃避後，下一招必定暴擊', on('dodge', [arm('phantom', {}, { crit: 1 }, 3)])),
      unique('閃避時回復 5% 魔力（冷卻 2 秒）', on('dodge', [restore({ mp: 0.05 })], { cooldown: 2 })),
      unique('周圍 4 格內沒有敵人時，閃避 +10%', cond({ noEnemiesWithin: 4 }, [{ stat: 'dodgeChance', value: 0.1 }])),
    ],
  },

  // ── 戒指 ──
  {
    id: 'mythic.samsara',
    name: '輪迴之環',
    rarity: 'mythic',
    kind: 'ring',
    role: 'Q / W / E 輪轉',
    lore: '戒圈上刻著三個相連的圓，沒有起點，也沒有終點。',
    minItemLevel: 10,
    lines: [
      stat('damageBonus', 0.16, 0.2),
      stat('critChance', 0.07, 0.09),
      inc('maxMana', 0.18, 0.22),
      stat('manaCostReduction', 0.11, 0.13),
      line('Combo 第三段傷害 +20%', mods(FINISHER, { damage: 0.2 })),
      unique(
        'Q 的 Combo 完成後，W 的 Combo 傷害 +15%（12 秒）',
        on('comboComplete', [buff('samsara_q', '輪迴 Q', 1, 12)], { when: { comboSlot: 0 } }),
        mods({ comboSlot: 1 }, { damage: 0.15 }, { requireBuff: { id: 'samsara_q', atLeast: 1 } }),
      ),
      unique(
        '接著完成 W 的 Combo 後，E 的 Combo 傷害 +15%（12 秒）',
        on('comboComplete', [clear('samsara_q'), buff('samsara_w', '輪迴 W', 1, 12)], { when: { comboSlot: 1 }, requireBuff: { id: 'samsara_q', atLeast: 1 } }),
        mods({ comboSlot: 2 }, { damage: 0.15 }, { requireBuff: { id: 'samsara_w', atLeast: 1 } }),
      ),
      unique(
        '依序完成 Q → W → E 後，下一個 Q 的 Combo 傷害 +40%',
        on('comboComplete', [clear('samsara_w'), buff('samsara_all', '輪迴', 1, 20)], { when: { comboSlot: 2 }, requireBuff: { id: 'samsara_w', atLeast: 1 } }),
        mods({ comboSlot: 0 }, { damage: 0.4 }, { requireBuff: { id: 'samsara_all', atLeast: 1 } }),
        on('comboComplete', [clear('samsara_all')], { when: { comboSlot: 0 }, requireBuff: { id: 'samsara_all', atLeast: 1 } }),
      ),
    ],
  },
  {
    id: 'mythic.meteor_eye',
    name: '星隕之眼',
    rarity: 'mythic',
    kind: 'ring',
    role: '法術終結連發',
    lore: '戒面是一顆墜落的星辰碎片，它還記得怎麼落下。',
    minItemLevel: 12,
    lines: [
      stat('spellDamageBonus', 0.2, 0.24),
      stat('critChance', 0.07, 0.09),
      inc('maxMana', 0.18, 0.22),
      stat('castSpeed', 0.08, 0.12),
      flat('manaRegen', 1.6, 2.4),
      unique('以法術作為 Combo 第三招時，25% 機率再施放一次', on('cast', [{ type: 'recast' }], { when: { ...FINISHER, categories: ['magic'] }, chance: 0.25 })),
      unique('法術作為 Combo 第三招時，傷害 +20%', mods({ ...FINISHER, categories: ['magic'] }, { damage: 0.2 })),
      unique('法術擊殺時回復 5% 魔力', on('kill', [restore({ mp: 0.05 })], { when: MAGIC })),
    ],
  },

  // ── 護身符 ──
  {
    id: 'mythic.crimson_heart',
    name: '深紅之心',
    rarity: 'mythic',
    kind: 'amulet',
    role: '近戰吸血循環',
    lore: '它跳動的節奏，和佩戴者的心跳並不一致。',
    minItemLevel: 10,
    lines: [
      inc('maxHp', 0.33, 0.37),
      stat('lifeSteal', 0.055, 0.065),
      stat('meleeDamageBonus', 0.23, 0.27),
      inc('attackSpeed', 0.1, 0.14),
      stat('potionEffect', 0.13, 0.17),
      unique('近戰吸血效率提高：近戰命中額外回復傷害 2% 的生命', on('hit', [restore({ hpOfDamage: 0.02 })], { when: MELEE })),
      unique(
        '生命已滿時，溢出的吸血轉為護盾：下一次受到的傷害 -30%（冷卻 3 秒）',
        on('hit', [at('self', 'melee', [status('guard', 6, 0.3, { target: 'self' })])], { when: MELEE, hpAbove: 0.99, cooldown: 3 }),
      ),
      unique('護盾存在時，近身技能傷害 +20%', mods({ ranges: ['Near'] }, { damage: 0.2 }, { requireStatus: 'guard' })),
    ],
  },
  {
    id: 'mythic.eye_of_all',
    name: '萬象之眼',
    rarity: 'mythic',
    kind: 'amulet',
    role: 'Combo 研究',
    lore: '看穿萬物的眼睛，最先看穿的是招式之間的縫隙。',
    minItemLevel: 14,
    lines: [
      stat('damageBonus', 0.18, 0.22),
      inc('maxMana', 0.23, 0.27),
      stat('critChance', 0.07, 0.09),
      stat('manaCostReduction', 0.09, 0.11),
      line('Combo 第三段傷害 +20%', mods(FINISHER, { damage: 0.2 })),
      unique('尚未發現的新 Combo：該次 Combo 傷害 +50%', mods({ comboOnly: true, newCombo: true }, { damage: 0.5 })),
      unique('已發現的秘密 Combo 傷害 +25%', mods({ comboOnly: true, secretCombo: true }, { damage: 0.25 })),
      unique(
        '每次完成 Combo，「洞察」+1 層（最多 5 層、8 秒）：每層所有傷害 +4%',
        on('comboComplete', [buff('insight', '洞察', 5, 8, [{ stat: 'damageBonus', value: 0.04 }])]),
      ),
    ],
  },
];

export const legendaries: Def[] = [...legendary, ...mythic];
