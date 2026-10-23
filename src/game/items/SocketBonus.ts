import type { Balance } from '../../data/schema/balance';
import type { CoreInstance, Sockets } from './CoreInstance';

/**
 * 一件裝備上的熔核給的額外加成（2026-10-23）：同核加成、鑲在武器的武器傷害 +%。
 * 獨立成一個檔案：ItemStats（武器傷害）、Equipment 與 CoreDescriber 都要用，避免循環依賴。
 */

/** 同核加成：孔都鑲滿、每顆熔核核種相同（混核要兩個核種都相同）→ 1 + 孔數 × matchBonus；否則 1 */
export function socketBonus(sockets: Sockets | undefined, balance: Balance): number {
  const cores = sockets?.cores ?? [];
  if (!sockets || cores.length === 0 || cores.length < sockets.max) return 1;
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
export function socketsWeaponDamage(sockets: Sockets | undefined, balance: Balance): number {
  const cores = sockets?.cores ?? [];
  return cores.reduce((sum, c) => sum + coreWeaponDamage(c, balance), 0) * socketBonus(sockets, balance);
}
