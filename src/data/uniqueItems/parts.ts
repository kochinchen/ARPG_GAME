import type { z } from 'zod';
import type { EffectDefSchema } from '../schema/effects';
import type { ItemActionSchema, ItemMechanicSchema, LegendaryDefSchema, ModsInputSchema, SkillFilterSchema } from '../schema/legendary';

export type Def = z.input<typeof LegendaryDefSchema>;
export type Line = Def['lines'][number];
export type Mechanic = z.input<typeof ItemMechanicSchema>;
export type Action = z.input<typeof ItemActionSchema>;
export type Filter = z.input<typeof SkillFilterSchema>;
export type Mods = z.input<typeof ModsInputSchema>;
export type Effect = z.input<typeof EffectDefSchema>;
export type StatId = Extract<Line, { type: 'stat' }>['stat'];



/** 傳奇 / 神話裝備資料的寫法輔助（legendaries.ts 與 uniqueItems/ 的各種類檔案共用） */

// ─────────────────────────── 寫法輔助 ───────────────────────────

export const stat = (s: StatId, min: number, max: number, o: { modifier?: 'flat' | 'increased'; strong?: boolean; growth?: number } = {}): Line => ({
  type: 'stat',
  stat: s,
  value: [min, max],
  ...o,
});
/** 「提高 X%」類（生命、魔力、防禦、攻速、移速） */
export const inc = (s: StatId, min: number, max: number, strong = false): Line => stat(s, min, max, { modifier: 'increased', strong });
/** 固定值類（荊棘、魔力回復）成長較快 */
export const flat = (s: StatId, min: number, max: number): Line => stat(s, min, max, { growth: 0.5 });
export const strongStat = (s: StatId, min: number, max: number): Line => stat(s, min, max, { strong: true });

/** 一般效果行（例如「火系技能傷害 +25%」） */
export const line = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, mechanics });
/** 強屬性（◆） */
export const strong = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, strong: true, mechanics });
/** 傳奇 / 神話效果（✦） */
export const unique = (text: string, ...mechanics: Mechanic[]): Line => ({ type: 'effect', text, unique: true, mechanics });

export const mods = (when: Filter, m: Mods, extra: Partial<Extract<Mechanic, { type: 'mods' }>> = {}): Mechanic => ({ type: 'mods', when, mods: m, ...extra });
export const on = (event: Extract<Mechanic, { type: 'trigger' }>['on'], actions: Action[], extra: Partial<Extract<Mechanic, { type: 'trigger' }>> = {}): Mechanic => ({
  type: 'trigger',
  on: event,
  actions,
  ...extra,
});
export const cond = (extra: Partial<Extract<Mechanic, { type: 'conditional' }>>, stats: { stat: StatId; modifier?: 'flat' | 'increased'; value: number }[]): Mechanic => ({
  type: 'conditional',
  ...extra,
  stats,
});

// 動作
export const at = (where: 'target' | 'self', category: 'melee' | 'ranged' | 'magic', effects: Effect[], hitFraction?: number): Action => ({
  type: 'effects',
  at: where,
  category,
  effects,
  ...(hitFraction ? { hitFraction } : {}),
});
export const restore = (r: { hp?: number; mp?: number; hpOfDamage?: number }): Action => ({ type: 'restore', ...r });
export const buff = (id: string, label: string, max: number, duration: number, stats: { stat: StatId; modifier?: 'flat' | 'increased'; value: number }[] = [], add = 1): Action => ({
  type: 'buff',
  id,
  label,
  max,
  duration,
  stats,
  add,
});
export const arm = (id: string, when: Filter, m: Mods, duration = 5): Action => ({ type: 'arm', id, when, mods: m, duration });
export const clear = (id: string): Action => ({ type: 'clearBuff', id });

/** 近戰 C 路線「刃術」 */
export const BLADE_ART = ['melee.dash_slash', 'melee.quake_slash', 'melee.launch_slash', 'melee.execution_slash'];

// 效果
export type DamageElement = 'physical' | 'fire' | 'cold' | 'lightning' | 'poison';
export const hit = (element: DamageElement, multiplier = 1, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({ type: 'damage', element, scaling, multiplier });
export const area = (radius: number, effects: Effect[], angleDeg?: number): Effect => ({ type: 'area', radius, effects, ...(angleDeg ? { angleDeg } : {}) });
export const status = (s: 'slow' | 'freeze' | 'stun' | 'armorBreak' | 'weakPoint' | 'guard' | 'ironWill', duration: number, magnitude = 0, extra: { chance?: number; target?: 'self' | 'target' } = {}): Effect => ({
  type: 'status',
  status: s,
  duration,
  magnitude,
  ...extra,
});
export const ring = (count: number, element: DamageElement, speed = 8, range = 4.5, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.2,
  range,
  count,
  spreadDeg: 360,
  onHit: [hit(element, 1, scaling)],
});
export const fan = (count: number, spreadDeg: number, element: DamageElement, speed = 11, range = 7): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.18,
  range,
  count,
  spreadDeg,
  onHit: [hit(element)],
});
export const rain = (repeat: number, scatter: number, radius: number, element: DamageElement, multiplier: number, scaling: 'weapon' | 'spell' = 'weapon'): Effect => ({
  type: 'delayed',
  delay: 0.3,
  repeat,
  interval: 0.15,
  scatter,
  effects: [area(radius, [hit(element, multiplier, scaling)])],
});

export const MELEE: Filter = { categories: ['melee'] };
export const RANGED: Filter = { categories: ['ranged'] };
export const MAGIC: Filter = { categories: ['magic'] };
export const FINISHER: Filter = { step: 3, comboOnly: true };

