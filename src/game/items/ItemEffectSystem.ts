import type { Rng } from '../../core/Rng';
import { distance, normalize, sub, vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { EffectDef } from '../../data/schema/effects';
import type { ItemAction, ItemMechanic, LegendaryDef, ModsInput, SkillFilter } from '../../data/schema/legendary';
import { SkillDefSchema, type SkillDef } from '../../data/schema/skill';
import type { ModifierKind } from '../stats/StatBlock';
import type { ComboCodex } from '../combo/ComboCodex';
import type { ComboSkillIndex } from '../combo/ComboSkillIndex';
import { NO_MODS, type ComboCastInfo, type StepMods } from '../combo/StepMods';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { SkillExecutor } from '../skills/SkillExecutor';
import { combatCategory } from '../skills/skillCategory';
import type { TargetingService } from '../targeting/TargetingService';
import type { EquipmentSlot, ItemInstance } from './ItemInstance';
import { EQUIPMENT_SLOTS } from './ItemInstance';

/** 目前啟用的一條機制（屬於哪件裝備的哪一行） */
interface ActiveMechanic {
  key: string;
  def: LegendaryDef;
  mechanic: ItemMechanic;
}

interface Buff {
  label: string;
  stacks: number;
  max: number;
  remaining: number;
  stats: { stat: StatId; modifier: ModifierKind; value: number }[];
}

interface Armed {
  id: string;
  when: SkillFilter;
  mods: ModsInput;
  remaining: number;
}

/** 觸發事件的內容 */
interface TriggerEvent {
  skillId: string | null;
  combo: ComboCastInfo | null;
  target: Actor | null;
  /** 觸發那一擊的傷害（hitFraction / hpOfDamage 使用） */
  amount: number;
  /** cast 事件：施放的位置與方向（recast 使用） */
  cast?: { targetId: number | null; point: { x: number; y: number }; direction: { x: number; y: number } };
}

/** 顯示在 HUD 的增益 */
export interface ActiveBuffView {
  id: string;
  label: string;
  stacks: number;
  remaining: number;
}

/**
 * 傳奇（橘）/ 神話（紅）裝備的特殊效果。只作用在玩家身上。
 * - mods：施放時，符合條件的技能得到加成（由 SkillSystem 在施放瞬間詢問）
 * - trigger：命中、暴擊、擊殺、受傷、閃避、施放、完成 Combo 等事件發生時執行動作
 * - conditional：條件成立期間的屬性加成（每幀判斷）
 * 全部依資料（data/legendaries.ts）運作；效果中的傷害走一般的 DamagePipeline。
 */
export class ItemEffectSystem {
  private active: ActiveMechanic[] = [];
  private signature = '';
  private readonly buffs = new Map<string, Buff>();
  private readonly armed: Armed[] = [];
  private readonly counters = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly applied = new Map<string, number>();
  private readonly syntheticSkills = new Map<string, SkillDef>();

  constructor(
    private readonly player: Actor,
    private readonly data: Pick<DataRegistry, 'legendaries' | 'skills'>,
    private readonly equipped: (slot: EquipmentSlot) => ItemInstance | undefined,
    private readonly index: ComboSkillIndex,
    private readonly codex: ComboCodex,
    private readonly executor: SkillExecutor,
    private readonly targeting: TargetingService,
    private readonly rng: Rng,
    events: GameEventBus,
  ) {
    events.on('SkillHit', (e) => {
      if (e.casterId !== player.id || this.isItemSkill(e.skillId)) return;
      const target = targeting.getActor(e.targetId) ?? null;
      const event: TriggerEvent = { skillId: e.skillId, combo: e.combo, target, amount: e.amount };
      this.fire('hit', event);
      if (e.isCrit) this.fire('crit', event);
      if (e.killed) this.fire('kill', event);
    });
    events.on('ActorDamaged', (e) => {
      if (e.targetId !== player.id || e.sourceId === null) return;
      const source = targeting.getActor(e.sourceId) ?? null;
      this.fire('hurt', { skillId: null, combo: null, target: source, amount: e.amount });
    });
    events.on('AttackDodged', (e) => {
      if (e.targetId === player.id) this.fire('dodge', { skillId: null, combo: null, target: null, amount: 0 });
    });
    events.on('SkillCast', (e) => {
      if (e.actorId !== player.id) return;
      const target = e.targetId === null ? null : (targeting.getActor(e.targetId) ?? null);
      this.fire('cast', { skillId: e.skillId, combo: e.combo ?? null, target, amount: 0, cast: { targetId: e.targetId, point: e.point, direction: e.direction } });
    });
    events.on('ComboCompleted', (e) => {
      const combo: ComboCastInfo = { step: 3, skills: e.skills, success: true, comboId: e.comboId, ruleTier: e.ruleTier, slot: e.slot };
      this.fire('comboComplete', { skillId: e.skills[2], combo, target: null, amount: 0 });
    });
    events.on('ComboDiscovered', () => this.fire('comboDiscovered', { skillId: null, combo: null, target: null, amount: 0 }));
  }

  /** 目前的增益（HUD 顯示） */
  get activeBuffs(): ActiveBuffView[] {
    return [...this.buffs].map(([id, b]) => ({ id, label: b.label, stacks: b.stacks, remaining: b.remaining }));
  }

  update(dt: number): void {
    this.refresh();
    for (const [key, t] of this.cooldowns) {
      if (t - dt <= 0) this.cooldowns.delete(key);
      else this.cooldowns.set(key, t - dt);
    }
    for (const [id, b] of this.buffs) {
      b.remaining -= dt;
      if (b.remaining <= 0) this.clearBuff(id);
    }
    for (let i = this.armed.length - 1; i >= 0; i--) {
      this.armed[i]!.remaining -= dt;
      if (this.armed[i]!.remaining <= 0) this.armed.splice(i, 1);
    }
    this.updateConditionals();
  }

  /**
   * 施放時的加成：回傳加上裝備效果後的 StepMods，以及確定施放後要執行的 commit（消耗增益與預備加成）。
   * 由 SkillSystem 在扣魔力前呼叫；魔力不足沒有施放時不呼叫 commit。
   */
  modsFor(actor: Actor, skill: SkillDef, base: Readonly<StepMods>): { mods: Readonly<StepMods>; commit: () => void } {
    if (actor !== this.player || this.isItemSkill(skill.id)) return { mods: base, commit: () => {} };
    this.refresh();
    const consume: string[] = [];
    const armedUsed: Armed[] = [];
    let mods: StepMods | null = null;
    const add = (input: ModsInput, factor: number) => {
      mods ??= cloneMods(base);
      addMods(mods, input, factor);
    };
    for (const { mechanic: m } of this.active) {
      if (m.type !== 'mods' || !this.matches(m.when, skill.id, base.combo)) continue;
      if (m.requireBuff && (this.buffs.get(m.requireBuff.id)?.stacks ?? 0) < m.requireBuff.atLeast) continue;
      if (m.requireStatus && !this.player.hasStatus(m.requireStatus)) continue;
      const factor = !m.scale ? 1 : m.scale.by === 'elements' ? this.elementCount(base.combo) : (this.buffs.get(m.scale.id)?.stacks ?? 0);
      if (factor <= 0) continue;
      add(m.mods, factor);
      if (m.consumeBuff) consume.push(m.consumeBuff);
    }
    for (const a of this.armed) {
      if (!this.matches(a.when, skill.id, base.combo)) continue;
      add(a.mods, 1);
      armedUsed.push(a);
    }
    return {
      mods: mods ?? base,
      commit: () => {
        for (const id of consume) this.clearBuff(id);
        for (const a of armedUsed) {
          const i = this.armed.indexOf(a);
          if (i >= 0) this.armed.splice(i, 1);
        }
      },
    };
  }

  // ─────────────────────────── 裝備變更 ───────────────────────────

  /** 裝備改變時重建啟用的機制（清除舊的增益與條件加成） */
  private refresh(): void {
    const items = EQUIPMENT_SLOTS.map((slot) => this.equipped(slot)).filter((i): i is ItemInstance => i?.legendaryId !== undefined);
    const signature = items.map((i) => i.uid).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const id of [...this.buffs.keys()]) this.clearBuff(id);
    this.armed.length = 0;
    for (const key of this.applied.keys()) this.player.stats.removeBySource(`legend:${key}`);
    this.applied.clear();
    this.active = [];
    items.forEach((item, n) => {
      if (!this.data.legendaries.has(item.legendaryId!)) return;
      const def = this.data.legendaries.get(item.legendaryId!);
      def.lines.forEach((line, i) => {
        if (line.type !== 'effect') return;
        line.mechanics.forEach((mechanic, j) => this.active.push({ key: `${n}:${def.id}:${i}:${j}`, def, mechanic }));
      });
    });
  }

  // ─────────────────────────── 觸發 ───────────────────────────

  private fire(on: Extract<ItemMechanic, { type: 'trigger' }>['on'], event: TriggerEvent): void {
    if (this.active.length === 0) return;
    for (const { key, mechanic: m } of this.active) {
      if (m.type !== 'trigger' || m.on !== on) continue;
      if (!this.triggerAllowed(m, event, on)) continue;
      if (m.every) {
        const n = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, n % m.every);
        if (n < m.every) continue;
      }
      if ((this.cooldowns.get(key) ?? 0) > 0) continue;
      if (m.chance !== undefined && !this.rng.chance(m.chance)) continue;
      if (m.cooldown > 0) this.cooldowns.set(key, m.cooldown);
      if (m.consumeBuff) this.clearBuff(m.consumeBuff);
      for (const action of m.actions) this.run(key, action, event);
    }
  }

  private triggerAllowed(m: Extract<ItemMechanic, { type: 'trigger' }>, e: TriggerEvent, on: string): boolean {
    const p = this.player;
    if (!p.alive) return false;
    // 需要技能的事件：依技能條件判斷；受傷 / 閃避 / 發現 Combo 沒有技能
    const needsSkill = on !== 'hurt' && on !== 'dodge' && on !== 'comboDiscovered';
    if (needsSkill && !this.matches(m.when, e.skillId, e.combo)) return false;
    if (m.near !== undefined && (!e.target || distance(e.target.position, p.position) > m.near + e.target.radius + p.radius)) return false;
    if (m.targetStatus && !e.target?.hasStatus(m.targetStatus)) return false;
    if (m.hpBelow !== undefined && p.hp / p.maxHp >= m.hpBelow) return false;
    if (m.hpAbove !== undefined && p.hp / p.maxHp <= m.hpAbove) return false;
    if (m.mpAbove !== undefined && p.mana / Math.max(1, p.maxMana) <= m.mpAbove) return false;
    if (m.requireBuff && (this.buffs.get(m.requireBuff.id)?.stacks ?? 0) < m.requireBuff.atLeast) return false;
    return true;
  }

  private run(key: string, action: ItemAction, e: TriggerEvent): void {
    const p = this.player;
    switch (action.type) {
      case 'effects': {
        const target = action.at === 'target' ? e.target : null;
        const origin = action.at === 'target' && target ? target.position : p.position;
        const toward = target ? sub(target.position, p.position) : p.facing;
        const direction = toward.x === 0 && toward.y === 0 ? p.facing : normalize(toward);
        const effects = action.hitFraction ? withFlatDamage(action.effects, e.amount * action.hitFraction) : action.effects;
        const skill = this.syntheticSkill(key, action.category);
        const ctx = this.executor.createContext(p, skill, 1, target && target.alive ? target : null, vec2(origin.x, origin.y), direction, NO_MODS);
        ctx.run(effects, ctx);
        break;
      }
      case 'restore':
        if (action.hp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * action.hp);
        if (action.mp) p.mana = Math.min(p.maxMana, p.mana + p.maxMana * action.mp);
        if (action.hpOfDamage) p.hp = Math.min(p.maxHp, p.hp + e.amount * action.hpOfDamage);
        break;
      case 'buff': {
        const b = this.buffs.get(action.id);
        const stacks = Math.min(action.max, (b?.stacks ?? 0) + action.add);
        this.buffs.set(action.id, { label: action.label, stacks, max: action.max, remaining: action.duration, stats: action.stats });
        this.applyBuffStats(action.id);
        break;
      }
      case 'clearBuff':
        this.clearBuff(action.id);
        break;
      case 'arm': {
        const i = this.armed.findIndex((a) => a.id === action.id);
        if (i >= 0) this.armed.splice(i, 1);
        this.armed.push({ id: action.id, when: action.when, mods: action.mods, remaining: action.duration });
        break;
      }
      case 'recast': {
        if (!e.skillId || !e.cast || !this.data.skills.has(e.skillId)) break;
        const skill = this.data.skills.get(e.skillId);
        const target = e.cast.targetId === null ? null : (this.targeting.getValidTarget(p, e.cast.targetId) ?? null);
        if (skill.targeting === 'enemy' && !target) break;
        const origin = skill.targeting === 'ground' ? e.cast.point : p.position;
        const rank = p.skillRanks.get(skill.id) ?? 1;
        this.executor.execute(p, skill, rank, target, vec2(origin.x, origin.y), vec2(e.cast.direction.x, e.cast.direction.y));
        break;
      }
    }
  }

  // ─────────────────────────── 增益與條件 ───────────────────────────

  private applyBuffStats(id: string): void {
    const source = `buff:${id}`;
    this.player.stats.removeBySource(source);
    const b = this.buffs.get(id);
    if (!b) return;
    for (const s of b.stats) this.player.stats.addModifier({ stat: s.stat, kind: s.modifier, value: s.value * b.stacks, source });
  }

  private clearBuff(id: string): void {
    if (!this.buffs.delete(id)) return;
    this.player.stats.removeBySource(`buff:${id}`);
  }

  private updateConditionals(): void {
    const p = this.player;
    for (const { key, mechanic: m } of this.active) {
      if (m.type !== 'conditional') continue;
      let factor = p.alive ? 1 : 0;
      if (m.hpBelow !== undefined && p.hp / p.maxHp >= m.hpBelow) factor = 0;
      if (m.hpAbove !== undefined && p.hp / p.maxHp <= m.hpAbove) factor = 0;
      if (m.buff && (this.buffs.get(m.buff.id)?.stacks ?? 0) < m.buff.atLeast) factor = 0;
      if (factor > 0 && m.noEnemiesWithin !== undefined && this.targeting.hostilesWithin(p, p.position, m.noEnemiesWithin).length > 0) factor = 0;
      if (factor > 0 && m.enemiesWithin) {
        const count = this.targeting.hostilesWithin(p, p.position, m.enemiesWithin.radius).length;
        factor = m.enemiesWithin.perEnemy ? Math.min(count, m.enemiesWithin.max) : count > 0 ? 1 : 0;
      }
      if ((this.applied.get(key) ?? 0) === factor) continue;
      const source = `legend:${key}`;
      p.stats.removeBySource(source);
      this.applied.set(key, factor);
      if (factor > 0) for (const s of m.stats) p.stats.addModifier({ stat: s.stat, kind: s.modifier, value: s.value * factor, source });
    }
  }

  // ─────────────────────────── 條件判斷 ───────────────────────────

  private matches(f: SkillFilter, skillId: string | null, combo: ComboCastInfo | null): boolean {
    if (skillId === null) return Object.keys(f).length === 0;
    const profile = this.index.get(skillId);
    if (f.skills && !f.skills.includes(skillId)) return false;
    if (f.tags && !(profile && f.tags.some((t) => profile.tags.has(t)))) return false;
    if (f.ranges && !(profile && f.ranges.includes(profile.range))) return false;
    if (f.roles && !(profile && f.roles.includes(profile.role))) return false;
    if (f.elements && !(profile && f.elements.some((el) => profile.elementTags.includes(el)))) return false;
    if (f.categories) {
      const category = this.data.skills.has(skillId) ? combatCategory(this.data.skills.get(skillId)) : null;
      if (!category || !f.categories.includes(category)) return false;
    }
    if (f.step !== undefined && combo?.step !== f.step) return false;
    if (f.comboOnly && !combo?.success) return false;
    if (f.comboSlot !== undefined && combo?.slot !== f.comboSlot) return false;
    if (f.newCombo !== undefined && f.newCombo !== (combo?.success === true && combo.comboId !== null && !this.codex.has(combo.comboId))) return false;
    if (f.secretCombo && !(combo?.success && combo.ruleTier === 1 && combo.comboId !== null && this.codex.has(combo.comboId))) return false;
    if (f.rangePattern || f.allRange || f.distinctSkills || f.minElements) {
      if (!combo) return false;
      const profiles = combo.skills.map((id) => this.index.get(id));
      if (profiles.some((x) => !x)) return false;
      if (f.rangePattern && !f.rangePattern.every((r, i) => profiles[i]!.range === r)) return false;
      if (f.allRange && !profiles.every((x) => x!.range === f.allRange)) return false;
      if (f.distinctSkills && new Set(combo.skills).size !== combo.skills.length) return false;
      if (f.minElements && this.elementCount(combo) < f.minElements) return false;
    }
    return true;
  }

  /** 連段中不同元素的種類數 */
  private elementCount(combo: ComboCastInfo | null): number {
    if (!combo) return 0;
    return new Set(combo.skills.flatMap((id) => this.index.get(id)?.elementTags ?? [])).size;
  }

  private isItemSkill(skillId: string): boolean {
    return skillId.startsWith('item.');
  }

  /** 裝備效果用的技能（只提供名稱與類別標籤：套用對應的傷害加成與吸血） */
  private syntheticSkill(key: string, category: 'melee' | 'ranged' | 'magic'): SkillDef {
    const id = `item.${key.replace(/[^a-z0-9_.]/g, '_')}.${category}`;
    let skill = this.syntheticSkills.get(id);
    if (!skill) {
      const tags = category === 'magic' ? ['spell'] : ['attack', category];
      skill = SkillDefSchema.parse({ id, name: '裝備效果', targeting: 'self', tags, effects: [{ type: 'damage', element: 'physical', scaling: 'flat', base: [0, 0] }] });
      this.syntheticSkills.set(id, skill);
    }
    return skill;
  }
}

// ─────────────────────────── 輔助 ───────────────────────────

function cloneMods(m: Readonly<StepMods>): StepMods {
  return { ...m, elementDamage: [...m.elementDamage], vsTarget: [...m.vsTarget], vsLowHp: [...m.vsLowHp] };
}

const NUMERIC: (keyof ModsInput & keyof StepMods)[] = [
  'damage',
  'crit',
  'aoeRadius',
  'projectileSpeed',
  'projectileCount',
  'pierce',
  'knockback',
  'attackSpeed',
  'castSpeed',
  'freezeChance',
  'statusChance',
  'chainCount',
  'hitCount',
  'mp',
];

function addMods(target: StepMods, input: ModsInput, factor: number): void {
  for (const key of NUMERIC) {
    const v = input[key];
    if (typeof v === 'number') (target[key] as number) += v * factor;
  }
  if (input.vsStatus) {
    if (input.vsStatus.damage) target.vsTarget.push({ type: 'damage', statuses: input.vsStatus.statuses, value: input.vsStatus.damage * factor });
    if (input.vsStatus.crit) target.vsTarget.push({ type: 'crit', statuses: input.vsStatus.statuses, value: input.vsStatus.crit * factor });
  }
  if (input.vsLowHp) target.vsLowHp.push({ below: input.vsLowHp.below, damage: input.vsLowHp.damage * factor });
}

/** 把效果中的傷害改成固定值（觸發那一擊傷害 × 比例） */
function withFlatDamage(effects: readonly EffectDef[], amount: number): EffectDef[] {
  const map = (e: EffectDef): EffectDef => {
    switch (e.type) {
      case 'damage':
        return { ...e, scaling: 'flat', base: [amount, amount], multiplier: 1, hits: 1 };
      case 'area':
      case 'chain':
      case 'zone':
      case 'delayed':
        return { ...e, effects: e.effects.map(map) };
      case 'projectile':
        return { ...e, onHit: e.onHit.map(map) };
      default:
        return e;
    }
  };
  return effects.map(map);
}
