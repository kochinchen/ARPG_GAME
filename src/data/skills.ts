import type { z } from 'zod';
import type { SkillDefSchema } from './schema/skill';
import { bossSkills } from './bosses';
import { skillComboTags } from './skillComboTags';

type SkillInput = z.input<typeof SkillDefSchema>;
type R5 = [number, number, number, number, number];

/** 百分比寫法轉倍率：[120, 135, …] → [1.2, 1.35, …] */
const pct = (...v: R5): R5 => v.map((x) => x / 100) as R5;
const T3_MP: R5 = [8, 9, 10, 11, 12];
const MAGIC_T2_MP: R5 = [5, 6, 7, 8, 9];
const MAGIC_T3_MP: R5 = [9, 10, 11, 12, 13];
const T4_MP: R5 = [13, 14, 15, 17, 19];

/** 普通攻擊（不在技能樹中） */
const special: SkillInput[] = [
  {
    // 玩家與怪物共用；傷害來自武器（怪物為 EnemyDef.damage）
    id: 'basic.attack',
    name: '普通攻擊',
    targeting: 'enemy',
    useAttackSpeed: true,
    tags: ['attack', 'melee'],
    effects: [{ type: 'damage', element: 'physical', scaling: 'weapon' }],
  },
];

// ─────────────────────────────── Melee 近戰 ───────────────────────────────
// A Heavy 重擊：高傷害、破甲、擊退 ｜ B Combo 連擊：快速、多段 ｜ C Guard 防禦：防守、反擊、控制
// 近戰承擔貼身風險（M7.5）：同 Tier 傷害約為遠程的 1.25～1.35 倍（Heavy ×1.3、Fast ×1.2、Guard ×1.25），
// 揮砍自帶扇形範圍（Fast 80°、Heavy 110°），主要目標一定命中。
/** 揮砍的觸及半徑（從角色中心；再加上目標半徑） */
const SWING_RADIUS = 1.3;
type EffectInput = NonNullable<SkillInput['effects']>[number];
const swing = (angleDeg: number, effects: EffectInput[]): EffectInput => ({
  type: 'area',
  radius: SWING_RADIUS,
  angleDeg,
  includeTarget: true,
  effects,
});

const melee: SkillInput[] = [
  {
    id: 'melee.heavy_slash',
    name: '重砍',
    description: '向前方 110° 重擊，適合作為 Finisher。',
    tree: { category: 'melee', tier: 1, branch: 'A' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: [2, 2, 3, 3, 4] },
    tags: ['attack', 'melee', 'heavy'],
    effects: [swing(110, [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(156, 176, 195, 215, 234) }])],
  },
  {
    id: 'melee.quick_slash',
    name: '快斬',
    description: '快速斬擊前方 80°。',
    tree: { category: 'melee', tier: 1, branch: 'B' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: [1, 1, 2, 2, 3] },
    tags: ['attack', 'melee', 'combo'],
    effects: [swing(80, [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(96, 108, 120, 132, 144) }])],
  },
  {
    id: 'melee.guard_stance',
    name: '防禦姿態',
    description: '下一次受到的傷害降低。',
    tree: { category: 'melee', tier: 1, branch: 'C' },
    targeting: 'self',
    castTime: 0.2,
    cost: { mana: [2, 2, 3, 3, 4] },
    tags: ['melee', 'guard', 'buff'],
    effects: [{ type: 'status', status: 'guard', target: 'self', duration: 10, magnitude: pct(20, 24, 28, 32, 36) }],
  },
  {
    id: 'melee.armor_break',
    name: '破甲斬',
    description: '向前方 110° 重擊並降低敵人防禦。',
    tree: { category: 'melee', tier: 2, branch: 'A' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: [4, 5, 5, 6, 7] },
    tags: ['attack', 'melee', 'heavy'],
    effects: [
      swing(110, [
        { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(176, 195, 215, 234, 254) },
        { type: 'status', status: 'armorBreak', duration: 5, magnitude: pct(10, 13, 16, 19, 22) },
      ]),
    ],
  },
  {
    id: 'melee.double_slash',
    name: '雙重斬',
    description: '快速斬擊前方 80° 兩次。',
    tree: { category: 'melee', tier: 2, branch: 'B' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: [4, 4, 5, 6, 7] },
    tags: ['attack', 'melee', 'combo'],
    effects: [swing(80, [{ type: 'damage', element: 'physical', scaling: 'weapon', hits: 2, multiplier: pct(78, 86, 95, 103, 112) }])],
  },
  {
    id: 'melee.shield_bash',
    name: '盾撞',
    description: '衝向敵人撞擊，擊退並短暫暈眩。',
    tree: { category: 'melee', tier: 2, branch: 'C' },
    targeting: 'enemy',
    range: 3,
    useAttackSpeed: true,
    cost: { mana: [4, 5, 5, 6, 7] },
    tags: ['attack', 'melee', 'guard'],
    effects: [
      { type: 'dash', distance: 3, direction: 'forward' },
      { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(113, 131, 150, 169, 188) },
      { type: 'status', status: 'stun', duration: 1 },
      { type: 'knockback', distance: 1 },
    ],
  },
  {
    id: 'melee.earth_break',
    name: '裂地擊',
    description: '向前方 160° 釋放震波，並擊退敵人。',
    tree: { category: 'melee', tier: 3, branch: 'A' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: T3_MP },
    tags: ['attack', 'melee', 'heavy', 'area'],
    effects: [
      {
        type: 'area',
        radius: 3,
        angleDeg: 160,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(221, 247, 273, 299, 325) },
          { type: 'knockback', distance: 1.5 },
        ],
      },
    ],
  },
  {
    id: 'melee.blade_dance',
    name: '劍刃旋舞',
    description: '360° 迴旋，三段攻擊周圍敵人。',
    tree: { category: 'melee', tier: 3, branch: 'B' },
    targeting: 'self',
    useAttackSpeed: true,
    cost: { mana: T3_MP },
    tags: ['attack', 'melee', 'combo', 'area'],
    effects: [
      { type: 'area', radius: 1.8, effects: [{ type: 'damage', element: 'physical', scaling: 'weapon', hits: 3, multiplier: pct(66, 74, 83, 91, 100) }] },
    ],
  },
  {
    id: 'melee.counter',
    name: '反擊',
    description: '下一次受到近戰攻擊時自動反擊。',
    tree: { category: 'melee', tier: 3, branch: 'C' },
    targeting: 'self',
    castTime: 0.2,
    cost: { mana: [7, 8, 9, 10, 11] },
    tags: ['melee', 'guard', 'buff'],
    effects: [{ type: 'status', status: 'counter', target: 'self', duration: 8, magnitude: pct(180, 205, 230, 255, 280) }],
  },
  {
    id: 'melee.devastator',
    name: '毀滅重擊',
    description: '以目標為中心的大範圍重擊；對破甲目標額外傷害。',
    tree: { category: 'melee', tier: 4, branch: 'A' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: T4_MP },
    tags: ['attack', 'melee', 'heavy', 'area'],
    effects: [
      {
        type: 'area',
        radius: 2.2,
        at: 'target',
        effects: [
          {
            type: 'damage',
            element: 'physical',
            scaling: 'weapon',
            multiplier: pct(312, 358, 403, 449, 494),
            bonus: { when: { status: 'armorBreak' }, damagePct: 0.3 },
          },
        ],
      },
    ],
  },
  {
    id: 'melee.phantom_blades',
    name: '幻影連斬',
    description: '快速連續五擊前方 80°。',
    tree: { category: 'melee', tier: 4, branch: 'B' },
    targeting: 'enemy',
    useAttackSpeed: true,
    cost: { mana: T4_MP },
    tags: ['attack', 'melee', 'combo'],
    effects: [swing(80, [{ type: 'damage', element: 'physical', scaling: 'weapon', hits: 5, multiplier: pct(58, 65, 72, 79, 86) }])],
  },
  {
    id: 'melee.iron_will',
    name: '鋼鐵意志',
    description: '接下來一段時間大幅提高減傷並免疫擊退。',
    tree: { category: 'melee', tier: 4, branch: 'C' },
    targeting: 'self',
    castTime: 0.2,
    cost: { mana: [12, 14, 15, 17, 18] },
    tags: ['melee', 'guard', 'buff'],
    effects: [{ type: 'status', status: 'ironWill', target: 'self', duration: 6, magnitude: pct(35, 40, 45, 50, 55) }],
  },
];

// ─────────────────────────────── Ranged 遠程 ───────────────────────────────
// A Precision 精準：單體、高暴擊、處決 ｜ B Barrage 彈幕：多箭、穿透 ｜ C Mobility 機動：射擊結合位移
const arrow = (multiplier: R5, extra: Record<string, unknown> = {}, onHit: unknown[] = []) => ({
  type: 'projectile' as const,
  speed: 14,
  radius: 0.2,
  range: 10,
  ...extra,
  onHit: [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier }, ...onHit],
});

const ranged: SkillInput[] = [
  {
    id: 'ranged.quick_shot',
    name: '快速射擊',
    description: '快速單發。',
    tree: { category: 'ranged', tier: 1, branch: 'A' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [1, 1, 2, 2, 3] },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [arrow(pct(85, 95, 105, 115, 125))] as SkillInput['effects'],
  },
  {
    id: 'ranged.piercing_shot',
    name: '穿透箭',
    description: '可穿透敵人。',
    tree: { category: 'ranged', tier: 1, branch: 'B' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [2, 2, 3, 3, 4] },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [arrow(pct(100, 112, 124, 136, 148), { pierce: 3 })] as SkillInput['effects'],
  },
  {
    id: 'ranged.backstep_shot',
    name: '後跳射擊',
    description: '後跳同時射擊。',
    tree: { category: 'ranged', tier: 1, branch: 'C' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [2, 3, 3, 4, 5] },
    tags: ['attack', 'ranged', 'projectile', 'movement'],
    effects: [{ type: 'dash', distance: 2.5, direction: 'backward' }, arrow(pct(75, 85, 95, 105, 115))] as SkillInput['effects'],
  },
  {
    id: 'ranged.charge_shot',
    name: '蓄力射擊',
    description: '蓄力射出高傷重箭，並擊退敵人。',
    tree: { category: 'ranged', tier: 2, branch: 'A' },
    targeting: 'direction',
    castTime: 0.6,
    cost: { mana: [4, 5, 5, 6, 7] },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [arrow(pct(145, 165, 185, 205, 225), { speed: 16, radius: 0.25 }, [{ type: 'knockback', distance: 1.5 }])] as SkillInput['effects'],
  },
  {
    id: 'ranged.spread_shot',
    name: '散射',
    description: '扇形射出 5 箭。',
    tree: { category: 'ranged', tier: 2, branch: 'B' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [5, 5, 6, 7, 8] },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [arrow(pct(38, 42, 46, 50, 54), { count: 5, spreadDeg: 50 })] as SkillInput['effects'],
  },
  {
    id: 'ranged.roll_shot',
    name: '翻滾射擊',
    description: '朝指定方向翻滾並攻擊。',
    tree: { category: 'ranged', tier: 2, branch: 'C' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [4, 5, 6, 7, 8] },
    tags: ['attack', 'ranged', 'projectile', 'movement'],
    effects: [{ type: 'dash', distance: 3, direction: 'forward' }, arrow(pct(90, 103, 116, 129, 142))] as SkillInput['effects'],
  },
  {
    id: 'ranged.weak_point',
    name: '弱點射擊',
    description: '標記敵人，提高其受到的暴擊傷害。',
    tree: { category: 'ranged', tier: 3, branch: 'A' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: [7, 8, 9, 10, 11] },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [
      arrow(pct(120, 135, 150, 165, 180), {}, [{ type: 'status', status: 'weakPoint', duration: 6, magnitude: 0.5 }]),
    ] as SkillInput['effects'],
  },
  {
    id: 'ranged.rapid_fire',
    name: '連射',
    description: '連續射擊五發。',
    tree: { category: 'ranged', tier: 3, branch: 'B' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: T3_MP },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [{ type: 'delayed', delay: 0, repeat: 5, interval: 0.12, effects: [arrow(pct(40, 44, 48, 52, 56))] }] as SkillInput['effects'],
  },
  {
    id: 'ranged.spin_shot',
    name: '迴旋射擊',
    description: '向周圍多方向射擊。',
    tree: { category: 'ranged', tier: 3, branch: 'C' },
    targeting: 'self',
    useAttackSpeed: true,
    cost: { mana: T3_MP },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [arrow(pct(75, 83, 91, 99, 107), { count: 8, spreadDeg: 360 })] as SkillInput['effects'],
  },
  {
    id: 'ranged.execution_shot',
    name: '狙殺',
    description: '高傷攻擊；對 HP 低於 30% 的目標額外 +30% 傷害。',
    tree: { category: 'ranged', tier: 4, branch: 'A' },
    targeting: 'direction',
    castTime: 0.7,
    cost: { mana: T4_MP },
    tags: ['attack', 'ranged', 'projectile'],
    effects: [
      {
        type: 'projectile',
        speed: 20,
        radius: 0.25,
        range: 12,
        onHit: [
          {
            type: 'damage',
            element: 'physical',
            scaling: 'weapon',
            multiplier: pct(260, 295, 330, 365, 400),
            bonus: { when: { hpBelow: 0.3 }, damagePct: 0.3 },
          },
        ],
      },
    ],
  },
  {
    id: 'ranged.rain_of_arrows',
    name: '箭雨',
    description: '指定區域降下大量箭矢。',
    tree: { category: 'ranged', tier: 4, branch: 'B' },
    targeting: 'ground',
    range: 9,
    castTime: 0.5,
    cost: { mana: [14, 15, 16, 18, 20] },
    tags: ['attack', 'ranged', 'area'],
    effects: [
      {
        type: 'delayed',
        delay: 0.3,
        repeat: 8,
        interval: 0.18,
        scatter: 1.8,
        effects: [{ type: 'area', radius: 0.8, effects: [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(35, 40, 45, 50, 55) }] }],
      },
    ],
  },
  {
    id: 'ranged.phantom_shot',
    name: '幻影射擊',
    description: '後撤位移並射擊，原地留下殘影再射一箭（40%）。殘影不是召喚物。',
    tree: { category: 'ranged', tier: 4, branch: 'C' },
    targeting: 'direction',
    useAttackSpeed: true,
    cost: { mana: T4_MP },
    tags: ['attack', 'ranged', 'projectile', 'movement'],
    effects: [
      { type: 'delayed', delay: 0.3, effects: [arrow([0.4, 0.4, 0.4, 0.4, 0.4])] },
      { type: 'dash', distance: 3, direction: 'backward' },
      arrow(pct(120, 135, 150, 165, 180)),
    ] as SkillInput['effects'],
  },
];

// ─────────────────────────────── Magic 魔法 ───────────────────────────────
// A Fire 火焰：爆發、燃燒、範圍 ｜ B Ice 冰霜：緩速、冰凍、控制 ｜ C Lightning 雷電：速度、連鎖、爆發
const spell = (element: 'fire' | 'cold' | 'lightning', multiplier: R5, bonus?: unknown) => ({
  type: 'damage' as const,
  element,
  scaling: 'spell' as const,
  multiplier,
  ...(bonus ? { bonus } : {}),
});

const magic: SkillInput[] = [
  {
    id: 'magic.fireball',
    name: '火球',
    description: '火焰投射物，命中時產生小爆炸。',
    tree: { category: 'magic', tier: 1, branch: 'A' },
    targeting: 'direction',
    castTime: 0.4,
    cost: { mana: [2, 2, 3, 4, 5] },
    tags: ['spell', 'projectile', 'fire'],
    effects: [
      { type: 'projectile', speed: 10, radius: 0.25, range: 12, onHit: [{ type: 'area', radius: 1, effects: [spell('fire', pct(105, 120, 135, 150, 165))] }] },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.ice_orb',
    name: '冰球',
    description: '命中造成緩速。',
    tree: { category: 'magic', tier: 1, branch: 'B' },
    targeting: 'direction',
    castTime: 0.4,
    cost: { mana: [2, 2, 3, 4, 5] },
    tags: ['spell', 'projectile', 'cold'],
    effects: [
      {
        type: 'projectile',
        speed: 9,
        radius: 0.3,
        range: 11,
        onHit: [spell('cold', pct(85, 97, 109, 121, 133)), { type: 'status', status: 'slow', duration: 2, magnitude: 0.3 }],
      },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.spark',
    name: '電擊',
    description: '快速電擊，會自動小幅修正方向。',
    tree: { category: 'magic', tier: 1, branch: 'C' },
    targeting: 'direction',
    castTime: 0.25,
    cost: { mana: [1, 2, 2, 3, 4] },
    tags: ['spell', 'projectile', 'lightning'],
    effects: [
      { type: 'projectile', speed: 16, radius: 0.2, range: 10, aimAssistDeg: 20, onHit: [spell('lightning', pct(90, 103, 116, 129, 142))] },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.flame_burst',
    name: '火焰爆破',
    description: '中距離範圍爆炸；對燃燒中的目標額外 +30% 傷害。',
    tree: { category: 'magic', tier: 2, branch: 'A' },
    targeting: 'ground',
    range: 7,
    castTime: 0.45,
    cost: { mana: MAGIC_T2_MP },
    tags: ['spell', 'area', 'fire'],
    effects: [
      { type: 'area', radius: 1.8, effects: [spell('fire', pct(145, 163, 181, 199, 217), { when: { status: 'burn' }, damagePct: 0.3 })] },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.ice_lance',
    name: '冰槍',
    description: '高速直線攻擊，可穿透 1 名敵人；對緩速中的敵人暴擊率 +25%。',
    tree: { category: 'magic', tier: 2, branch: 'B' },
    targeting: 'direction',
    castTime: 0.35,
    cost: { mana: MAGIC_T2_MP },
    tags: ['spell', 'projectile', 'cold'],
    effects: [
      {
        type: 'projectile',
        speed: 18,
        radius: 0.2,
        range: 12,
        pierce: 1,
        onHit: [spell('cold', pct(135, 152, 169, 186, 203), { when: { status: 'slow' }, critChance: 0.25 })],
      },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.chain_lightning',
    name: '連鎖閃電',
    description: '閃電在數名敵人之間跳躍（最多 3 次）。',
    tree: { category: 'magic', tier: 2, branch: 'C' },
    targeting: 'enemy',
    range: 8,
    castTime: 0.4,
    cost: { mana: MAGIC_T2_MP },
    tags: ['spell', 'lightning'],
    effects: [{ type: 'chain', jumps: 3, radius: 4, effects: [spell('lightning', pct(105, 118, 131, 144, 157))] }] as SkillInput['effects'],
  },
  {
    id: 'magic.firewall',
    name: '火牆',
    description: '在地面留下持續燃燒的火焰（4 秒，每秒傷害）。',
    tree: { category: 'magic', tier: 3, branch: 'A' },
    targeting: 'ground',
    range: 7,
    castTime: 0.5,
    cost: { mana: MAGIC_T3_MP },
    tags: ['spell', 'area', 'fire'],
    effects: [
      {
        type: 'zone',
        radius: 1.5,
        duration: 4,
        interval: 1,
        effects: [spell('fire', pct(65, 75, 85, 95, 105)), { type: 'status', status: 'burn', duration: 2 }],
      },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.frost_nova',
    name: '冰霜新星',
    description: '周圍範圍傷害並緩速，有機率冰凍敵人。',
    tree: { category: 'magic', tier: 3, branch: 'B' },
    targeting: 'self',
    castTime: 0.35,
    cost: { mana: MAGIC_T3_MP },
    tags: ['spell', 'area', 'cold'],
    effects: [
      {
        type: 'area',
        radius: 3,
        effects: [
          spell('cold', pct(120, 135, 150, 165, 180)),
          { type: 'status', status: 'slow', duration: 2, magnitude: 0.3 },
          { type: 'status', status: 'freeze', duration: 1.5, chance: pct(20, 25, 30, 35, 40) },
        ],
      },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.thunder_strike',
    name: '雷擊',
    description: '指定位置降下高傷落雷。',
    tree: { category: 'magic', tier: 3, branch: 'C' },
    targeting: 'ground',
    range: 8,
    castTime: 0.4,
    cost: { mana: MAGIC_T3_MP },
    tags: ['spell', 'area', 'lightning'],
    effects: [
      { type: 'delayed', delay: 0.35, effects: [{ type: 'area', radius: 1.2, effects: [spell('lightning', pct(195, 220, 245, 270, 295))] }] },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.meteor',
    name: '隕星',
    description: '延遲後大範圍爆炸，並留下 3 秒火焰區（每秒 30%）。',
    tree: { category: 'magic', tier: 4, branch: 'A' },
    targeting: 'ground',
    range: 9,
    castTime: 0.6,
    cost: { mana: [15, 16, 17, 18, 20] },
    tags: ['spell', 'area', 'fire'],
    effects: [
      {
        type: 'delayed',
        delay: 1,
        effects: [
          { type: 'area', radius: 2.5, effects: [spell('fire', pct(280, 320, 360, 400, 440)), { type: 'status', status: 'burn', duration: 2 }] },
          { type: 'zone', radius: 2, duration: 3, interval: 1, effects: [spell('fire', [0.3, 0.3, 0.3, 0.3, 0.3]), { type: 'status', status: 'burn', duration: 2 }] },
        ],
      },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.absolute_zero',
    name: '絕對零度',
    description: '大範圍冰凍；Boss 改為強力緩速。',
    tree: { category: 'magic', tier: 4, branch: 'B' },
    targeting: 'self',
    castTime: 0.5,
    cost: { mana: [14, 15, 16, 18, 20] },
    tags: ['spell', 'area', 'cold'],
    effects: [
      { type: 'area', radius: 4, effects: [spell('cold', pct(210, 240, 270, 300, 330)), { type: 'status', status: 'freeze', duration: 2 }] },
    ] as SkillInput['effects'],
  },
  {
    id: 'magic.storm_core',
    name: '雷暴',
    description: '區域內連續六次落雷。',
    tree: { category: 'magic', tier: 4, branch: 'C' },
    targeting: 'ground',
    range: 8,
    castTime: 0.5,
    cost: { mana: [15, 16, 17, 18, 20] },
    tags: ['spell', 'area', 'lightning'],
    effects: [
      {
        type: 'delayed',
        delay: 0.3,
        repeat: 6,
        interval: 0.35,
        scatter: 2,
        effects: [{ type: 'area', radius: 1.1, effects: [spell('lightning', pct(75, 85, 95, 105, 115))] }],
      },
    ] as SkillInput['effects'],
  },
];

// ─────────────────────────────── Support 輔助（常駐被動） ───────────────────────────────
// A Survival 生存 ｜ B Resource 資源 ｜ C Combat 戰鬥強化
const passive = (
  id: string,
  name: string,
  description: string,
  tier: 1 | 2 | 3 | 4,
  branch: 'A' | 'B' | 'C',
  bonuses: SkillInput['passive'],
): SkillInput => ({ id, name, description, kind: 'passive', tree: { category: 'support', tier, branch }, passive: bonuses, tags: ['support'] });

const support: SkillInput[] = [
  passive('support.vitality', '生命強化', '最大生命提高。', 1, 'A', [{ stat: 'maxHp', modifier: 'increased', values: pct(10, 20, 30, 40, 50) }]),
  passive('support.mana_pool', '魔力擴充', '最大魔力提高。', 1, 'B', [{ stat: 'maxMana', modifier: 'increased', values: pct(10, 15, 20, 25, 30) }]),
  passive('support.quick_step', '迅捷步伐', '移動速度提高。', 1, 'C', [{ stat: 'moveSpeed', modifier: 'increased', values: pct(5, 8, 11, 14, 17) }]),
  passive('support.iron_skin', '鐵壁', '防禦提高。', 2, 'A', [{ stat: 'defense', modifier: 'increased', values: pct(10, 15, 20, 25, 30) }]),
  passive('support.efficiency', '節能', '技能魔力消耗降低。', 2, 'B', [{ stat: 'manaCostReduction', modifier: 'flat', values: pct(5, 8, 11, 14, 17) }]),
  passive('support.combat_rhythm', '戰鬥節奏', '攻擊速度與施法速度提高。', 2, 'C', [
    { stat: 'attackSpeed', modifier: 'increased', values: pct(6, 9, 12, 15, 18) },
    { stat: 'castSpeed', modifier: 'flat', values: pct(6, 9, 12, 15, 18) },
  ]),
  passive('support.blood_drain', '血之汲取', '造成傷害的一部分回復生命。', 3, 'A', [{ stat: 'lifeSteal', modifier: 'flat', values: pct(2, 3, 4, 5, 6) }]),
  passive('support.mana_drain', '魔力汲取', '造成傷害的一部分回復魔力。', 3, 'B', [{ stat: 'manaSteal', modifier: 'flat', values: pct(1, 2, 3, 4, 5) }]),
  passive('support.precision', '精密', '暴擊率提高。', 3, 'C', [{ stat: 'critChance', modifier: 'flat', values: pct(4, 6, 8, 10, 12) }]),
  passive('support.regeneration', '再生', '每秒回復最大生命的一定比例。', 4, 'A', [{ stat: 'hpRegenPct', modifier: 'flat', values: pct(0.6, 0.8, 1, 1.2, 1.5) }]),
  passive('support.arcane_cycle', '魔力循環', '每次命中回復魔力。', 4, 'B', [{ stat: 'manaOnHit', modifier: 'flat', values: [0.5, 0.8, 1.1, 1.4, 1.8] }]),
  passive('support.overdrive', '超載', '所有傷害提高。', 4, 'C', [{ stat: 'damageBonus', modifier: 'flat', values: pct(10, 16, 22, 28, 35) }]),
];

/** 主動技能附上 Combo 標籤（skillComboTags.ts） */
const withComboTags = (list: SkillInput[]): SkillInput[] =>
  list.map((s) => (skillComboTags[s.id] ? { ...s, combo: skillComboTags[s.id] } : s));

// ─────────────────────────────── 怪物技能 ───────────────────────────────
// 怪物專用（不在技能樹）。傷害一律以 EnemyDef.damage 為基準（scaling: 'weapon'），
// 投射物比玩家的慢、重擊與法術有前搖提示（telegraph），讓玩家有機會躲開。
const enemySkills: SkillInput[] = [
  {
    id: 'enemy.bow_shot',
    name: '射箭',
    description: '骷髏弓手的遠程攻擊。',
    targeting: 'enemy',
    range: 6,
    useAttackSpeed: true,
    tags: ['attack', 'ranged', 'projectile'],
    effects: [
      {
        type: 'projectile',
        speed: 9,
        radius: 0.18,
        range: 9,
        onHit: [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1 }],
      },
    ],
  },
  {
    id: 'enemy.brute_smash',
    name: '重擊',
    description: '重甲骷髏蓄力後向前方 120° 重擊並擊退。前搖時地上會顯示範圍，走出範圍即可躲開。',
    targeting: 'enemy',
    range: 1.2,
    castTime: 1.4,
    impactAt: 0.7,
    telegraph: true,
    cooldown: 4,
    tags: ['attack', 'melee', 'heavy'],
    effects: [
      {
        type: 'area',
        radius: 2,
        angleDeg: 120,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 2.2 },
          { type: 'knockback', distance: 1.2 },
        ],
      },
    ],
  },
  {
    id: 'enemy.frost_bolt',
    name: '冰霜箭',
    description: '骷髏法師的遠程法術，命中造成緩速。',
    targeting: 'enemy',
    range: 6.5,
    castTime: 0.8,
    tags: ['spell', 'projectile', 'cold'],
    effects: [
      {
        type: 'projectile',
        speed: 8,
        radius: 0.22,
        range: 10,
        onHit: [
          { type: 'damage', element: 'cold', scaling: 'weapon', multiplier: 1 },
          { type: 'status', status: 'slow', duration: 1.5, magnitude: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'enemy.flame_burst',
    name: '烈焰爆裂',
    description: '骷髏法師在目標腳下引爆火焰。前搖時地上會顯示範圍。',
    targeting: 'ground',
    range: 7,
    castTime: 1.3,
    impactAt: 0.85,
    telegraph: true,
    cooldown: 6,
    tags: ['spell', 'area', 'fire'],
    effects: [{ type: 'area', radius: 1.4, effects: [{ type: 'damage', element: 'fire', scaling: 'weapon', multiplier: 1.8 }] }],
  },
];

// 非人形怪物（10 樓以上）的技能：撲擊與衝鋒用前搖（動畫）提示、範圍重擊與法術有地面提示。
const creatureSkills: SkillInput[] = [
  {
    id: 'enemy.pounce',
    name: '撲擊',
    description: '骨刺獵獸撲向目標並咬擊。',
    targeting: 'enemy',
    range: 4,
    castTime: 0.7,
    impactAt: 0.6,
    cooldown: 5,
    tags: ['attack', 'melee'],
    effects: [
      { type: 'dash', distance: 4, direction: 'forward' },
      { type: 'area', radius: 1.1, angleDeg: 100, includeTarget: true, effects: [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.5 }] },
    ],
  },
  {
    id: 'enemy.shadow_pounce',
    name: '暗影撲殺',
    description: '暗影獵豹從遠處撲向目標，造成高傷害。',
    targeting: 'enemy',
    range: 5.5,
    castTime: 0.6,
    impactAt: 0.5,
    cooldown: 6,
    tags: ['attack', 'melee'],
    effects: [
      { type: 'dash', distance: 5.5, direction: 'forward' },
      { type: 'area', radius: 1.1, angleDeg: 100, includeTarget: true, effects: [{ type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.9 }] },
    ],
  },
  {
    id: 'enemy.tail_sweep',
    name: '甩尾',
    description: '血鱗獵蜥甩尾攻擊周圍並擊退。',
    targeting: 'self',
    range: 1.4,
    castTime: 0.9,
    impactAt: 0.55,
    telegraph: true,
    cooldown: 6,
    tags: ['attack', 'melee', 'area'],
    effects: [
      {
        type: 'area',
        radius: 1.8,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.3 },
          { type: 'knockback', distance: 1.2 },
        ],
      },
    ],
  },
  {
    id: 'enemy.acid_spray',
    name: '酸液噴灑',
    description: '酸液甲蟲往前方噴出酸液，造成毒素傷害並降低防禦。',
    targeting: 'enemy',
    range: 2,
    castTime: 1.1,
    impactAt: 0.7,
    telegraph: true,
    cooldown: 6,
    tags: ['spell', 'area', 'poison'],
    effects: [
      {
        type: 'area',
        radius: 2.4,
        angleDeg: 80,
        effects: [
          { type: 'damage', element: 'poison', scaling: 'weapon', multiplier: 1.4 },
          { type: 'status', status: 'armorBreak', duration: 4, magnitude: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'enemy.hook_rend',
    name: '鉤爪撕裂',
    description: '鉤爪蟲連續撕裂兩次並破甲。',
    targeting: 'enemy',
    range: 1,
    castTime: 0.8,
    impactAt: 0.5,
    cooldown: 5,
    tags: ['attack', 'melee'],
    effects: [
      {
        type: 'area',
        radius: 1.4,
        angleDeg: 100,
        includeTarget: true,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', hits: 2, multiplier: 0.9 },
          { type: 'status', status: 'armorBreak', duration: 3, magnitude: 0.2 },
        ],
      },
    ],
  },
  {
    id: 'enemy.horn_charge',
    name: '角甲衝鋒',
    description: '角甲巨獸低頭衝鋒，撞到目標時擊退並暈眩。',
    targeting: 'enemy',
    range: 5,
    castTime: 1.3,
    impactAt: 0.9,
    cooldown: 7,
    tags: ['attack', 'melee', 'heavy'],
    effects: [
      { type: 'dash', distance: 5, direction: 'forward' },
      {
        type: 'area',
        radius: 1.5,
        angleDeg: 120,
        includeTarget: true,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.8 },
          { type: 'knockback', distance: 1.8 },
          { type: 'status', status: 'stun', duration: 0.6 },
        ],
      },
    ],
  },
  {
    id: 'enemy.magma_breath',
    name: '熔岩吐息',
    description: '熔顎巨獸往前方噴出熔岩（兩段火焰傷害）。前搖時地上會顯示範圍。',
    targeting: 'enemy',
    range: 2.8,
    castTime: 1.4,
    impactAt: 0.8,
    telegraph: true,
    cooldown: 6,
    tags: ['spell', 'area', 'fire'],
    effects: [{ type: 'area', radius: 3.2, angleDeg: 60, effects: [{ type: 'damage', element: 'fire', scaling: 'weapon', hits: 2, multiplier: 1 }] }],
  },
  {
    id: 'enemy.quake_stomp',
    name: '震地踐踏',
    description: '震地獸重踏地面，周圍大範圍傷害並暈眩。前搖時地上會顯示範圍。',
    targeting: 'self',
    range: 2,
    castTime: 1.5,
    impactAt: 0.75,
    telegraph: true,
    cooldown: 7,
    tags: ['attack', 'melee', 'area', 'heavy'],
    effects: [
      {
        type: 'area',
        radius: 3,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.8 },
          { type: 'status', status: 'stun', duration: 0.8 },
        ],
      },
    ],
  },
  {
    id: 'enemy.poison_spit',
    name: '毒沫',
    description: '毒沫噴吐者吐出毒液，落點留下一灘毒液（持續毒素傷害）。',
    targeting: 'enemy',
    range: 6,
    castTime: 0.8,
    tags: ['spell', 'projectile', 'poison'],
    effects: [
      {
        type: 'projectile',
        speed: 7,
        radius: 0.22,
        range: 8,
        onHit: [
          { type: 'damage', element: 'poison', scaling: 'weapon', multiplier: 0.8 },
          { type: 'zone', radius: 1.1, duration: 3, interval: 0.5, effects: [{ type: 'damage', element: 'poison', scaling: 'weapon', multiplier: 0.25 }] },
        ],
      },
    ],
  },
  {
    id: 'enemy.frost_spores',
    name: '寒霜孢子',
    description: '寒霜孢子體一次噴出三顆冰霜孢子，命中造成緩速。',
    targeting: 'enemy',
    range: 6,
    castTime: 0.9,
    tags: ['spell', 'projectile', 'cold'],
    effects: [
      {
        type: 'projectile',
        speed: 7,
        radius: 0.2,
        range: 8,
        count: 3,
        spreadDeg: 30,
        onHit: [
          { type: 'damage', element: 'cold', scaling: 'weapon', multiplier: 0.7 },
          { type: 'status', status: 'slow', duration: 1.5, magnitude: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'enemy.fire_glob',
    name: '火囊噴射',
    description: '火囊爬行者噴出火球，落點爆炸。',
    targeting: 'enemy',
    range: 6,
    castTime: 0.9,
    tags: ['spell', 'projectile', 'fire'],
    effects: [
      {
        type: 'projectile',
        speed: 6.5,
        radius: 0.25,
        range: 8,
        onHit: [{ type: 'area', radius: 1.2, effects: [{ type: 'damage', element: 'fire', scaling: 'weapon', multiplier: 1.1 }] }],
      },
    ],
  },
  {
    id: 'enemy.eye_beam',
    name: '眼光',
    description: '單眼浮體射出快速的閃電眼光。',
    targeting: 'enemy',
    range: 7,
    castTime: 0.7,
    tags: ['spell', 'projectile', 'lightning'],
    effects: [{ type: 'projectile', speed: 12, radius: 0.16, range: 10, onHit: [{ type: 'damage', element: 'lightning', scaling: 'weapon', multiplier: 1 }] }],
  },
  {
    id: 'enemy.mind_bolt',
    name: '心靈飛彈',
    description: '腦海浮體的遠程法術。',
    targeting: 'enemy',
    range: 7,
    castTime: 0.8,
    tags: ['spell', 'projectile', 'lightning'],
    effects: [{ type: 'projectile', speed: 8, radius: 0.22, range: 10, onHit: [{ type: 'damage', element: 'lightning', scaling: 'weapon', multiplier: 0.9 }] }],
  },
  {
    id: 'enemy.mind_blast',
    name: '心靈衝擊',
    description: '腦海浮體在目標腳下引爆心靈衝擊並暈眩。前搖時地上會顯示範圍。',
    targeting: 'ground',
    range: 7,
    castTime: 1.4,
    impactAt: 0.85,
    telegraph: true,
    cooldown: 7,
    tags: ['spell', 'area', 'lightning'],
    effects: [
      {
        type: 'area',
        radius: 1.5,
        effects: [
          { type: 'damage', element: 'lightning', scaling: 'weapon', multiplier: 1.5 },
          { type: 'status', status: 'stun', duration: 0.8 },
        ],
      },
    ],
  },
  {
    id: 'enemy.void_pulse',
    name: '虛空脈衝',
    description: '虛空孢子蓄力後釋放脈衝，周圍傷害並緩速。前搖時地上會顯示範圍。',
    targeting: 'self',
    range: 1.6,
    castTime: 1.1,
    impactAt: 0.7,
    telegraph: true,
    cooldown: 5,
    tags: ['spell', 'area', 'cold'],
    effects: [
      {
        type: 'area',
        radius: 2.2,
        effects: [
          { type: 'damage', element: 'cold', scaling: 'weapon', multiplier: 1.4 },
          { type: 'status', status: 'slow', duration: 2, magnitude: 0.35 },
        ],
      },
    ],
  },
  {
    id: 'enemy.web_spit',
    name: '吐網',
    description: '卵囊母體吐出黏網，命中造成緩速。',
    targeting: 'enemy',
    range: 6.5,
    castTime: 0.9,
    tags: ['spell', 'projectile', 'poison'],
    effects: [
      {
        type: 'projectile',
        speed: 7,
        radius: 0.24,
        range: 9,
        onHit: [
          { type: 'damage', element: 'poison', scaling: 'weapon', multiplier: 0.9 },
          { type: 'status', status: 'slow', duration: 2, magnitude: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'enemy.spawn_brood',
    name: '產卵',
    description: '卵囊母體生出 2 隻孵化蜘蛛（最多同時 4 隻）。',
    targeting: 'self',
    range: 8,
    castTime: 1.2,
    cooldown: 10,
    tags: ['spell', 'summon'],
    effects: [{ type: 'summon', enemyId: 'enemy.hatchling_spider', count: 2, maxAlive: 4 }],
  },
  {
    id: 'enemy.soul_bolt',
    name: '奪魂花粉',
    description: '奪魂寄生花射出花粉，命中造成緩速。',
    targeting: 'enemy',
    range: 7,
    castTime: 0.8,
    tags: ['spell', 'projectile', 'poison'],
    effects: [
      {
        type: 'projectile',
        speed: 7.5,
        radius: 0.22,
        range: 9,
        onHit: [
          { type: 'damage', element: 'poison', scaling: 'weapon', multiplier: 1 },
          { type: 'status', status: 'slow', duration: 1.5, magnitude: 0.3 },
        ],
      },
    ],
  },
  {
    id: 'enemy.root_grasp',
    name: '藤蔓纏繞',
    description: '奪魂寄生花在目標腳下伸出藤蔓，造成傷害並大幅緩速。前搖時地上會顯示範圍。',
    targeting: 'ground',
    range: 7,
    castTime: 1.3,
    impactAt: 0.85,
    telegraph: true,
    cooldown: 6,
    tags: ['spell', 'area'],
    effects: [
      {
        type: 'area',
        radius: 1.3,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.3 },
          { type: 'status', status: 'slow', duration: 2, magnitude: 0.6 },
        ],
      },
    ],
  },
  {
    id: 'enemy.burrow_strike',
    name: '鑽地突襲',
    description: '鑽地寄生蟲鑽入地下，從目標面前竄出咬擊並擊退。',
    targeting: 'enemy',
    range: 5,
    castTime: 1,
    impactAt: 0.85,
    cooldown: 6,
    tags: ['attack', 'melee'],
    effects: [
      { type: 'dash', distance: 5, direction: 'forward' },
      {
        type: 'area',
        radius: 1.3,
        includeTarget: true,
        effects: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: 1.6 },
          { type: 'knockback', distance: 1 },
        ],
      },
    ],
  },
];

export const skills: SkillInput[] = [...special, ...withComboTags([...melee, ...ranged, ...magic]), ...support, ...enemySkills, ...creatureSkills, ...bossSkills];
