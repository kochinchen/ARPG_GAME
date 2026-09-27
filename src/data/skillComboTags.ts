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
  // ── Melee · Blade 刃術 ──
  // 突進斬：向前突進的 Bridge 型 Starter（取代舊的盾撞，是唯一的中距離 Advance）
  'melee.dash_slash': { range: 'Mid', action: ['Fast'], damage: ['Physical'], movement: ['Advance'], role: 'Starter' },
  'melee.quake_slash': { range: 'Near', action: ['AoE', 'Impact'], damage: ['Physical'], control: ['Knockback'], role: 'Setup' },
  'melee.launch_slash': { range: 'Near', action: ['Impact'], damage: ['Physical'], control: ['Launch'], role: 'Bridge' },
  'melee.execution_slash': { range: 'Near', action: ['Heavy', 'Execute'], damage: ['Physical'], role: 'Finisher' },
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
  // ── Ranged · Archery 射術 ──
  'ranged.backstep_shot': { range: 'Mid', action: ['Projectile'], damage: ['Physical'], movement: ['Retreat'], role: 'Bridge' },
  'ranged.pinning_shot': { range: 'Far', action: ['Projectile'], damage: ['Physical'], control: ['Slow'], role: 'Setup' },
  // 以落點爆炸實作、沒有實際投射物，因此不帶 Projectile
  'ranged.explosive_arrow': { range: 'Far', action: ['AoE'], damage: ['Physical'], control: ['Knockback'], role: 'Amplifier' },
  'ranged.mark_shot': { range: 'Far', action: ['Projectile'], damage: ['Physical'], control: ['Mark'], role: 'Starter' },
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
