import type { z } from 'zod';
import type { SkillDefSchema } from './schema/skill';

type SkillInput = z.input<typeof SkillDefSchema>;
type R5 = [number, number, number, number, number];

/** 百分比寫法轉倍率：[120, 135, …] → [1.2, 1.35, …] */
const pct = (...v: R5): R5 => v.map((x) => x / 100) as R5;

// ─────────────────────────────── Utility 戰術 ───────────────────────────────
// 任何武器都能用、不吃武器種類的加減分（v0.4.0，規格：SPEC_v0.4.0_戰術技能與武器規則）。
// A 身法：位移與控場 ｜ B 機關：有血量的佈置物（P5）｜ C 投擲：直接傷害是固定值（投擲物本身），武器傷害只體現在毒 / 流血上。
// 冷卻全部為 0，節流靠魔力；魔力對齊同階魔法。投擲不吃攻速。

const mobility: SkillInput[] = [
  {
    id: 'utility.roll',
    name: '翻滾',
    description: '朝游標反方向後翻，翻滾期間免疫擊退。',
    tree: { category: 'utility', tier: 1, branch: 'A' },
    targeting: 'direction',
    castTime: 0.2,
    impactAt: 0,
    cost: { mana: 3 },
    tags: ['utility', 'movement'],
    effects: [
      { type: 'dash', direction: 'backward', distance: 2.5 },
      { type: 'status', status: 'unstoppable', target: 'self', duration: [0.6, 0.7, 0.8, 0.9, 1] },
    ],
  },
  {
    id: 'utility.shadow_step',
    name: '影步',
    description: '向前穿越敵人，強化下一個近戰或遠程技能。',
    tree: { category: 'utility', tier: 2, branch: 'A' },
    targeting: 'direction',
    castTime: 0.2,
    impactAt: 0,
    cost: { mana: 4 },
    tags: ['utility', 'movement'],
    effects: [
      { type: 'dash', direction: 'forward', distance: 4, passThrough: true },
      { type: 'status', status: 'meleeEmpower', target: 'self', magnitude: pct(8, 10, 12, 14, 16), duration: [2, 2, 2.5, 2.5, 3] },
      { type: 'status', status: 'rangedEmpower', target: 'self', magnitude: pct(8, 10, 12, 14, 16), duration: [2, 2, 2.5, 2.5, 3] },
    ],
  },
  {
    id: 'utility.grapple_hook',
    name: '鉤索',
    description: '擲出鉤索，把命中的敵人拉到面前。',
    tree: { category: 'utility', tier: 3, branch: 'A' },
    targeting: 'direction',
    castTime: 0.3,
    cost: { mana: 6 },
    tags: ['utility', 'projectile'],
    effects: [
      {
        type: 'projectile',
        speed: 16,
        radius: 0.25,
        range: 7,
        onHit: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(60, 70, 80, 90, 100) },
          { type: 'knockback', distance: [-2, -2.5, -3, -3.5, -4] },
          // Lv5：命中後緩速
          { type: 'status', status: 'slow', magnitude: 0.3, duration: 1.5, chance: [0, 0, 0, 0, 1] },
        ],
      },
    ],
  },
  {
    id: 'utility.phantom_rush',
    name: '幻影突襲',
    description: '穿越突進，路徑上的敵人全部受到傷害並暈眩。',
    tree: { category: 'utility', tier: 4, branch: 'A' },
    targeting: 'direction',
    castTime: 0.3,
    cost: { mana: 12 },
    tags: ['utility', 'movement'],
    effects: [
      {
        type: 'dash',
        direction: 'forward',
        distance: 5,
        passThrough: true,
        onPath: [
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(100, 115, 130, 145, 160) },
          { type: 'status', status: 'stun', duration: [0.8, 0.9, 1, 1.1, 1.2] },
        ],
      },
    ],
  },
];

const throwables: SkillInput[] = [
  {
    id: 'utility.poison_knife',
    name: '淬毒飛刀',
    description: '直線擲出淬毒飛刀，命中使敵人中毒（最多 3 層）。近身時多把飛刀可以命中同一個敵人；可以當左鍵使用。',
    tree: { category: 'utility', tier: 1, branch: 'C' },
    targeting: 'direction',
    castTime: 0.2,
    cost: { mana: [2, 2, 3, 3, 5] },
    tags: ['utility', 'projectile'],
    effects: [
      {
        type: 'projectile',
        speed: 15,
        radius: 0.2,
        range: 7,
        count: [1, 1, 2, 2, 3],
        spreadDeg: 12,
        onHit: [
          { type: 'damage', element: 'physical', scaling: 'flat', base: [[3, 5], [4, 6], [5, 8], [6, 9], [7, 11]] },
          { type: 'status', status: 'poison', magnitude: pct(40, 50, 60, 70, 80), duration: 5 },
        ],
      },
    ],
  },
  {
    id: 'utility.frost_flask',
    name: '霜凍瓶',
    description: '拋出霜凍瓶，落地碎裂，範圍內的敵人受到冰霜傷害並緩速。',
    tree: { category: 'utility', tier: 2, branch: 'C' },
    targeting: 'ground',
    range: 6,
    castTime: 0.2,
    cost: { mana: 7 },
    tags: ['utility', 'area'],
    effects: [
      {
        type: 'delayed',
        delay: 0.45,
        effects: [
          {
            type: 'area',
            radius: [1.6, 1.7, 1.8, 1.9, 2],
            effects: [
              { type: 'damage', element: 'cold', scaling: 'weapon', multiplier: [0.4, 0.475, 0.55, 0.625, 0.7] },
              { type: 'status', status: 'slow', magnitude: pct(30, 35, 40, 45, 50), duration: [3, 3, 3.5, 3.5, 4] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'utility.throwing_axe',
    name: '擲斧',
    description: '扇形擲出飛斧，穿透敵人並造成流血，適合掃過一排敵人。',
    tree: { category: 'utility', tier: 3, branch: 'C' },
    targeting: 'direction',
    castTime: 0.35,
    cost: { mana: [5, 5, 7, 7, 10] },
    tags: ['utility', 'projectile'],
    effects: [
      {
        type: 'projectile',
        speed: 14,
        radius: 0.3,
        range: 6,
        count: [1, 1, 2, 2, 3],
        spreadDeg: 30,
        pierce: [1, 1, 1, 1, 2],
        onHit: [
          { type: 'damage', element: 'physical', scaling: 'flat', base: [[8, 14], [10, 17], [13, 21], [15, 24], [18, 28]] },
          { type: 'status', status: 'bleed', magnitude: pct(40, 50, 60, 70, 80), duration: 5 },
        ],
      },
    ],
  },
  {
    id: 'utility.flash_powder',
    name: '閃光粉',
    description: '拋出閃光粉，落地範圍內的敵人抗性降低（弱化）。Lv4 起也降低物理抗性。',
    tree: { category: 'utility', tier: 4, branch: 'C' },
    targeting: 'ground',
    range: 6,
    castTime: 0.2,
    cost: { mana: 12 },
    tags: ['utility', 'area'],
    effects: [
      {
        type: 'delayed',
        delay: 0.45,
        effects: [
          {
            type: 'area',
            radius: 1.8,
            effects: [
              // Lv1～2 全元素減半（P0-5 定案）；Lv4 起加物理
              {
                type: 'status',
                status: 'expose',
                magnitude: [0.075, 0.1, 0.2, 0.2, 0.25],
                physicalMagnitude: [0, 0, 0, 0.1, 0.15],
                duration: [6, 8, 8, 8, 10],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const utilitySkills: SkillInput[] = [...mobility, ...throwables];
