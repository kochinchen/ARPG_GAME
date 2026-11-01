/**
 * 《井誌》：整個遊戲收集到的內容合成一本書（遺物、夾在寶箱裡的挑戰者筆記、魔王的魂魄）。
 * 魂魄一句一頁。頁碼由內容推導：依樓層排序，同一層依魂魄 → 遺物 → 筆記，不存檔。
 * 每收集滿 1/4 給一次獎勵（GameWorld）；事先不告訴玩家，拿到時才通知。
 */
export interface BookLine {
  en: string;
  zh: string;
}

export type BookPageKind = 'soul' | 'lore' | 'note';

export interface BookPage {
  /** 這一頁的 ID（魂魄一句一頁：`soul.f5#0`） */
  id: string;
  /** 收集紀錄的 ID：同一個魂魄的每一句共用，打倒魔王時一起收集 */
  sourceId: string;
  kind: BookPageKind;
  /** 頁碼（1 起算） */
  number: number;
  floor: number;
  /** 遺物、筆記的標題；魂魄沒有 */
  title: string | null;
  /** 魂魄的署名（哪一隻怪） */
  speaker: string | null;
  line: BookLine;
}

interface BookSource {
  lore: readonly { id: string; floor: number; object: string; en: string; zh: string }[] | { all: readonly { id: string; floor: number; object: string; en: string; zh: string }[] };
  notebook: readonly { id: string; floor: number; en: string; zh: string }[] | { all: readonly { id: string; floor: number; en: string; zh: string }[] };
  souls: readonly { id: string; floor: number; name: string; lines: BookLine[] }[] | { all: readonly { id: string; floor: number; name: string; lines: BookLine[] }[] };
}

const list = <T>(source: readonly T[] | { all: readonly T[] }): readonly T[] => ('all' in source ? source.all : source);
const ORDER: Record<BookPageKind, number> = { soul: 0, lore: 1, note: 2 };

export function buildBook(source: BookSource): BookPage[] {
  const pages: Omit<BookPage, 'number'>[] = [
    ...list(source.souls).flatMap((s) =>
      s.lines.map((line, i) => ({ id: `${s.id}#${i}`, sourceId: s.id, kind: 'soul' as const, floor: s.floor, title: null, speaker: s.name, line })),
    ),
    ...list(source.lore).map((l) => ({ id: l.id, sourceId: l.id, kind: 'lore' as const, floor: l.floor, title: l.object, speaker: null, line: { en: l.en, zh: l.zh } })),
    ...list(source.notebook).map((n) => ({ id: n.id, sourceId: n.id, kind: 'note' as const, floor: n.floor, title: '挑戰者的筆記', speaker: null, line: { en: n.en, zh: n.zh } })),
  ];
  // sort 是穩定排序：同一個魂魄的句子維持原本的順序，頁碼連續
  return pages.sort((a, b) => a.floor - b.floor || ORDER[a.kind] - ORDER[b.kind]).map((p, i) => ({ ...p, number: i + 1 }));
}

/** 收集進度到第幾個四分之一（0～4） */
export function bookQuarter(found: number, total: number): number {
  return Math.floor((found * 4) / total);
}
