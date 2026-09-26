import type { z } from 'zod';
import type { SkillComboInfoSchema } from './schema/combo';

type ComboInfo = z.input<typeof SkillComboInfoSchema>;

/**
 * 36 個主動技能的 Combo 標籤（規格：docs/COMBO_SYSTEM.md 第 1.2 節）。
 * 標籤必須與技能效果一致，載入時由 DataRegistry 檢查。
 */
export const skillComboTags: Record<string, ComboInfo> = {
  // ── Melee · Heavy ──
  'melee.heavy_slash': { range: 'Near', action: ['Heavy', 'Impact'], damage: ['Physical'], role: 'Finisher' },
  'melee.armor_break': { range: 'Near', action: ['Heavy'], damage: ['Physical'], control: ['ArmorBreak'], role: 'Setup' },
  'melee.earth_break': { range: 'Near', action: ['Heavy', 'AoE'], damage: ['Physical'], control: ['Knockback'], role: 'Finisher' },
  // 保留「對破甲目標加傷」的原始效果，因此不帶 Execute
  'melee.devastator': { range: 'Near', action: ['Heavy', 'AoE', 'Impact'], damage: ['Physical'], role: 'Finisher' },
  // ── Melee · Combo ──
  'melee.quick_slash': { range: 'Near', action: ['Fast'], damage: ['Physical'], role: 'Starter' },
  'melee.double_slash': { range: 'Near', action: ['Fast', 'MultiHit'], damage: ['Physical'], role: 'Amplifier' },
  'melee.blade_dance': { range: 'Near', action: ['MultiHit', 'AoE'], damage: ['Physical'], role: 'Amplifier' },
  'melee.phantom_blades': { range: 'Near', action: ['Fast', 'MultiHit', 'Burst'], damage: ['Physical'], role: 'Finisher' },
  // ── Melee · Guard ──
  'melee.guard_stance': { range: 'Near', action: ['Guard'], control: ['Shield'], role: 'Defense' },
  // 衝撞（Charge）：向前突進的 Bridge
  'melee.shield_bash': { range: 'Mid', action: ['Impact'], damage: ['Physical'], movement: ['Advance'], control: ['Stun', 'Knockback'], role: 'Setup' },
  'melee.counter': { range: 'Near', action: ['Counter', 'Burst'], damage: ['Physical'], role: 'Finisher' },
  'melee.iron_will': { range: 'Near', action: ['Guard'], control: ['Shield'], role: 'Defense' },
  // ── Ranged · Precision ──
  'ranged.quick_shot': { range: 'Far', action: ['Fast', 'Projectile'], damage: ['Physical'], role: 'Starter' },
  'ranged.charge_shot': { range: 'Far', action: ['Heavy', 'Projectile'], damage: ['Physical'], control: ['Knockback'], role: 'Finisher' },
  'ranged.weak_point': { range: 'Far', action: ['Projectile'], damage: ['Physical'], control: ['Mark'], role: 'Setup' },
  'ranged.execution_shot': { range: 'Far', action: ['Heavy', 'Projectile', 'Execute'], damage: ['Physical'], role: 'Finisher' },
  // ── Ranged · Barrage ──
  'ranged.piercing_shot': { range: 'Far', action: ['Projectile', 'Pierce'], damage: ['Physical'], role: 'Starter' },
  'ranged.spread_shot': { range: 'Far', action: ['Projectile', 'MultiHit', 'AoE'], damage: ['Physical'], role: 'Amplifier' },
  'ranged.rapid_fire': { range: 'Far', action: ['Fast', 'MultiHit', 'Projectile'], damage: ['Physical'], role: 'Amplifier' },
  // 以落點打擊實作、沒有實際投射物，因此不帶 Projectile（投射物類加成對它無效）
  'ranged.rain_of_arrows': { range: 'Far', action: ['AoE', 'MultiHit'], damage: ['Physical'], role: 'Finisher' },
  // ── Ranged · Mobility ──
  'ranged.backstep_shot': { range: 'Mid', action: ['Projectile'], damage: ['Physical'], movement: ['Retreat'], role: 'Bridge' },
  'ranged.roll_shot': { range: 'Mid', action: ['Projectile'], damage: ['Physical'], movement: ['Roll', 'Reposition'], role: 'Bridge' },
  'ranged.spin_shot': { range: 'Mid', action: ['Projectile', 'AoE', 'MultiHit'], damage: ['Physical'], movement: ['Reposition'], role: 'Bridge' },
  'ranged.phantom_shot': { range: 'Mid', action: ['Projectile', 'Burst'], damage: ['Physical'], movement: ['Reposition'], role: 'Finisher' },
  // ── Magic · Fire ──
  'magic.fireball': { range: 'Far', action: ['Projectile', 'AoE'], damage: ['Fire'], element: ['Fire'], role: 'Finisher' },
  'magic.flame_burst': { range: 'Far', action: ['AoE', 'Burst'], damage: ['Fire'], element: ['Fire'], role: 'Amplifier' },
  'magic.firewall': { range: 'Far', action: ['AoE', 'Channel'], damage: ['Fire'], element: ['Fire'], role: 'Setup' },
  'magic.meteor': { range: 'Far', action: ['AoE', 'Heavy', 'Burst'], damage: ['Fire'], element: ['Fire'], role: 'Finisher' },
  // ── Magic · Ice ──
  'magic.ice_orb': { range: 'Far', action: ['Projectile'], damage: ['Ice'], element: ['Ice'], control: ['Slow'], role: 'Setup' },
  'magic.ice_lance': { range: 'Far', action: ['Projectile', 'Pierce'], damage: ['Ice'], element: ['Ice'], role: 'Finisher' },
  'magic.frost_nova': { range: 'Near', action: ['AoE'], damage: ['Ice'], element: ['Ice'], control: ['Freeze', 'Slow'], role: 'Setup' },
  'magic.absolute_zero': { range: 'Near', action: ['AoE', 'Burst'], damage: ['Ice'], element: ['Ice'], control: ['Freeze'], role: 'Finisher' },
  // ── Magic · Lightning ──
  'magic.spark': { range: 'Far', action: ['Projectile', 'Fast'], damage: ['Lightning'], element: ['Lightning'], role: 'Starter' },
  'magic.chain_lightning': { range: 'Far', action: ['MultiHit', 'Burst'], damage: ['Lightning'], element: ['Lightning'], role: 'Amplifier' },
  'magic.thunder_strike': { range: 'Far', action: ['AoE', 'Heavy', 'Burst'], damage: ['Lightning'], element: ['Lightning'], role: 'Finisher' },
  'magic.storm_core': { range: 'Far', action: ['AoE', 'MultiHit', 'Burst'], damage: ['Lightning'], element: ['Lightning'], role: 'Finisher' },
};
