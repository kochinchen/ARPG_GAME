import type { Balance } from '../../data/schema/balance';
import type { CoreInstance } from './CoreInstance';
import type { ItemInstance } from './ItemInstance';

/**
 * 一件裝備上的熔核給的額外加成（2026-10-23）：同核加成、鑲在武器的武器傷害 +%。
 * 獨立成一個檔案：ItemStats（武器傷害）、Equipment 與 CoreDescriber 都要用，避免循環依賴。
 */

type Socketed = Pick<ItemInstance, 'rarity' | 'sockets'>;

/**
 * 同核加成（設計者 2026-11-05）：孔要鑿到這個稀有度的上限（白 5、藍 4、黃 3、紫 2）並全部鑲滿，
 * 每顆熔核核種相同（混核要兩個核種都相同）→ 1 + 孔數 × matchBonus；否則 1。
 * 上限只有 1 孔的橘裝沒有加成：一顆核不算「同核」。
 */
export function socketBonus(item: Socketed, balance: Balance): number {
  const { sockets, rarity } = item;
  const cores = sockets?.cores ?? [];
  const full = balance.sockets.max[rarity];
  if (!sockets || full < 2 || sockets.max < full || cores.length < sockets.max) return 1;
  const key = (c: CoreInstance) => [...c.types].sort().join('+');
  const first = key(cores[0]!);
  return cores.every((c) => key(c) === first) ? 1 + sockets.max * balance.sockets.matchBonus : 1;
}

/** 一顆熔核鑲在武器時給的武器傷害 +%（依核階；不含同核加成） */
export function coreWeaponDamage(core: Pick<CoreInstance, 'tier'>, balance: Balance): number {
  const table = balance.sockets.weaponDamage;
  return table[Math.min(core.tier, table.length) - 1] ?? 0;
}

/** 武器上所有熔核的武器傷害 +% 合計（含同核加成） */
export function socketsWeaponDamage(item: Socketed, balance: Balance): number {
  const cores = item.sockets?.cores ?? [];
  return cores.reduce((sum, c) => sum + coreWeaponDamage(c, balance), 0) * socketBonus(item, balance);
}
