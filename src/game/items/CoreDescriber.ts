import type { DataRegistry } from '../../data/DataRegistry';
import type { CoreElement } from '../../data/schema/core';
import type { CoreInstance } from './CoreInstance';

export const CORE_ELEMENT_LABELS: Record<CoreElement, string> = { fire: '火', cold: '冰', lightning: '雷' };

/** 熔核的名稱：例如「靈核（火）」「混核（銳＋重）」 */
export function coreName(core: CoreInstance, data: Pick<DataRegistry, 'cores'>): string {
  const names = core.types.map((t) => data.cores.types.get(t).name);
  const element = core.element ? `（${CORE_ELEMENT_LABELS[core.element]}）` : '';
  if (names.length === 2) return `混核（${names.map((n) => n.replace('核', '')).join('＋')}）${element}`;
  return `${names[0]}${element}`;
}
