import type { z } from 'zod';
import type { SkillDefSchema } from './schema/skill';

type SkillInput = z.input<typeof SkillDefSchema>;
type R5 = [number, number, number, number, number];

/** 百分比寫法轉倍率：[120, 135, …] → [1.2, 1.35, …] */
const pct = (...v: R5): R5 => v.map((x) => x / 100) as R5;

// ─────────────────────────────── Utility 戰術 ───────────────────────────────
// 任何武器都能用、不吃武器種類的加減分（v0.4.0，規格：SPEC_v0.4.0_戰術技能與武器規則）。
// A 身法：位移與控場 ｜ B 機關：有血量的佈置物 ｜ C 投擲：直接傷害偏低，主要傷害在毒 / 流血。
// 傷害一律用「攻擊力」＝武器傷害與法術強度取較高者（DamageEffect.attackPower），法杖拿戰術技能也打得動。
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

type EffectInput = NonNullable<SkillInput['effects']>[number];

/** 霜凍地雷的爆炸（近接觸發與被打壞都一樣） */
const frostBlast: EffectInput[] = [
  {
    type: 'area',
    radius: 1.5,
    effects: [
      { type: 'damage', element: 'cold', scaling: 'weapon', multiplier: pct(70, 80, 90, 100, 110) },
      // Boss 依現有規則改為強力緩速
      { type: 'status', status: 'freeze', duration: [0.8, 0.9, 1, 1.1, 1.2] },
    ],
  },
];

/** 火藥桶的爆炸（被打壞或 10 秒後） */
const kegBlast: EffectInput[] = [
  {
    type: 'area',
    radius: [2, 2.05, 2.1, 2.15, 2.2],
    effects: [
      { type: 'damage', element: 'fire', scaling: 'weapon', multiplier: pct(300, 340, 380, 420, 460) },
      { type: 'knockback', distance: 2 },
      { type: 'status', status: 'burn', duration: 3 },
    ],
  },
];

// 機關：有血量的佈置物（血量 = 玩家最大生命 × 比例、防禦 = 玩家防禦），怪物在 3 格內會改打機關；全身最多 2 個
const devices: SkillInput[] = [
  {
    id: 'utility.trip_net',
    name: '絆索網',
    description: '在面前橫放一道 8 格寬的絆索網，碰到的敵人被絆倒（浮空）並緩速。被打壞或觸發次數用完就消失。',
    tree: { category: 'utility', tier: 1, branch: 'B' },
    targeting: 'direction',
    castTime: 0.3,
    cost: { mana: 4 },
    tags: ['utility', 'device'],
    effects: [
      {
        type: 'device',
        behavior: 'trip',
        hpPct: pct(15, 20, 25, 30, 35),
        duration: [8, 8, 8, 8, 12],
        forward: 3,
        line: { length: 8, width: 1 },
        triggers: [2, 2, 3, 3, 4],
        onTrigger: [
          { type: 'status', status: 'airborne', duration: [0.5, 0.6, 0.7, 0.8, 0.9] },
          { type: 'status', status: 'slow', magnitude: 0.3, duration: 2 },
        ],
      },
    ],
  },
  {
    id: 'utility.frost_mine',
    name: '霜凍地雷',
    description: '佈置霜凍地雷，0.8 秒後待命；敵人靠近或地雷被打壞時爆炸，範圍冰凍。',
    tree: { category: 'utility', tier: 2, branch: 'B' },
    targeting: 'ground',
    range: 6,
    castTime: 0.3,
    cost: { mana: 9 },
    tags: ['utility', 'device'],
    effects: [
      {
        type: 'device',
        behavior: 'proximity',
        hpPct: 0.1,
        duration: 30,
        maxAlive: [1, 1, 1, 1, 2],
        armDelay: 0.8,
        triggerRadius: 1.5,
        onTrigger: frostBlast,
        onDestroy: frostBlast,
      },
    ],
  },
  {
    id: 'utility.storm_totem',
    name: '雷電圖騰',
    description: '豎起雷電圖騰，每秒朝最近的敵人射出一道穿透所有敵人的閃電（吃法術強度）。',
    tree: { category: 'utility', tier: 3, branch: 'B' },
    targeting: 'ground',
    range: 6,
    castTime: 0.4,
    cost: { mana: 13 },
    tags: ['utility', 'device', 'lightning'],
    effects: [
      {
        type: 'device',
        behavior: 'turret',
        hpPct: 0.2,
        // 射完 5～6 發就消失；附近一直沒有敵人時最多留 15 秒
        duration: 15,
        interval: 1,
        shots: [5, 5, 6, 6, 6],
        range: 6,
        onShot: [
          {
            type: 'projectile',
            speed: 18,
            radius: 0.25,
            range: 6,
            pierce: 99,
            onHit: [{ type: 'damage', element: 'lightning', scaling: 'spell', multiplier: pct(40, 45, 50, 55, 60) }],
          },
        ],
      },
    ],
  },
  {
    id: 'utility.powder_keg',
    name: '火藥桶',
    description: '放下火藥桶：被打壞或 10 秒後爆炸，範圍火焰傷害、擊退並燃燒。',
    tree: { category: 'utility', tier: 4, branch: 'B' },
    targeting: 'ground',
    range: 6,
    castTime: 0.4,
    cost: { mana: 20 },
    tags: ['utility', 'device', 'fire'],
    effects: [
      {
        type: 'device',
        behavior: 'none',
        hpPct: 0.25,
        duration: 10,
        onDestroy: kegBlast,
        onExpire: kegBlast,
      },
    ],
  },
];

const throwables: SkillInput[] = [
  {
    id: 'utility.poison_knife',
    name: '淬毒飛刀',
    description: '直線擲出淬毒飛刀，命中使敵人中毒：5 秒內共 60%～200% 武器傷害（隨技能等級增加，最多 3 層）。近身時多把飛刀可以命中同一個敵人；可以當左鍵使用。',
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
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(20, 23, 26, 29, 32) },
          // 設計者調整（2026-10-29）：中毒總量 40%～80% → 60%～200%
          { type: 'status', status: 'poison', magnitude: pct(60, 95, 130, 165, 200), duration: 5 },
        ],
      },
    ],
  },
  {
    id: 'utility.frost_flask',
    name: '霜凍瓶',
    description: '放下一座自動投射器，每 0.5 秒朝最近的敵人射出一支冰箭（10%～20% 武器冰寒傷害，隨技能等級增加），持續 20 秒。',
    tree: { category: 'utility', tier: 2, branch: 'C' },
    targeting: 'ground',
    range: 6,
    castTime: 0.2,
    cost: { mana: 7 },
    tags: ['utility', 'device'],
    // 設計者調整（2026-10-29）：原本是落地碎裂的冰霜範圍，改成自動投射器
    effects: [
      {
        type: 'device',
        behavior: 'turret',
        hpPct: 0.15,
        duration: 20,
        interval: 0.5,
        shots: 40,
        range: 7,
        onShot: [
          {
            type: 'projectile',
            speed: 16,
            radius: 0.15,
            range: 7,
            onHit: [{ type: 'damage', element: 'cold', scaling: 'weapon', multiplier: pct(10, 12.5, 15, 17.5, 20) }],
          },
        ],
      },
    ],
  },
  {
    id: 'utility.throwing_axe',
    name: '擲斧',
    description: '扇形擲出飛斧，穿透敵人並造成流血：3 秒內共 60%～120% 武器傷害（物理、每秒結算、可暴擊、可疊加最多 5 層），適合掃過一排敵人。',
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
          { type: 'damage', element: 'physical', scaling: 'weapon', multiplier: pct(45, 50, 55, 60, 65) },
          // 設計者調整（2026-10-29）：流血 5 秒共 40%～80% → 3 秒共 60%～120%，可疊加
          { type: 'status', status: 'bleed', magnitude: pct(60, 75, 90, 105, 120), duration: 3, maxStacks: 5 },
        ],
      },
    ],
  },
  {
    id: 'utility.flash_powder',
    name: '閃光粉',
    description: '拋出閃光粉，落地範圍內的敵人抗性降低（弱化，直接相減、可以降到負數）。Lv4 起也降低物理抗性。冷卻 30 秒。',
    tree: { category: 'utility', tier: 4, branch: 'C' },
    targeting: 'ground',
    range: 6,
    castTime: 0.2,
    // 設計者調整（2026-10-18）：每級都是 30 魔力、維持 20 秒、冷卻 30 秒（戰術唯一有冷卻的技能）
    cost: { mana: 30 },
    cooldown: 30,
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
                duration: 20,
              },
            ],
          },
        ],
      },
    ],
  },
];

export const utilitySkills: SkillInput[] = [...mobility, ...devices, ...throwables];
