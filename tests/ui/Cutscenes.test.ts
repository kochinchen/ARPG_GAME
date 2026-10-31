import { describe, expect, it } from 'vitest';
import { cutscenes } from '../../src/data/cutscenes';
import { dueCutscene, watchedCutscenes } from '../../src/ui/cutscene/dueCutscene';

const state = (floor: number, seen: string[] = [], completedHidden = false) => ({ floor, completedHidden, seen: new Set(seen) });

describe('過場影片', () => {
  it('每一環的第一層（1、6、11…31）各一部前導，最後是終章；ID 不重複', () => {
    const floors = cutscenes.flatMap((c) => (c.trigger.type === 'floor' ? [c.trigger.floor] : []));
    expect(floors).toEqual([1, 6, 11, 16, 21, 26, 31]);
    expect(cutscenes.at(-1)!.trigger.type).toBe('hiddenComplete');
    expect(new Set(cutscenes.map((c) => c.id)).size).toBe(cutscenes.length);
  });

  it('站上該層且還沒看過才播；看過之後回到這一層不再播', () => {
    expect(dueCutscene(cutscenes, state(1))?.id).toBe('prelude.f1');
    expect(dueCutscene(cutscenes, state(6))?.id).toBe('prelude.f6');
    expect(dueCutscene(cutscenes, state(5))).toBeNull();
    expect(dueCutscene(cutscenes, state(6, ['prelude.f6']))).toBeNull();
  });

  it('終章：擊敗深淵統御者之後播一次', () => {
    expect(dueCutscene(cutscenes, state(35, ['prelude.f31']))).toBeNull();
    expect(dueCutscene(cutscenes, state(35, ['prelude.f31'], true))?.id).toBe('epilogue');
    expect(dueCutscene(cutscenes, state(35, ['prelude.f31', 'epilogue'], true))).toBeNull();
  });

  it('標題畫面的重看清單：任一存檔看過的都算，不認得的 ID 忽略', () => {
    expect([...watchedCutscenes(cutscenes, [['prelude.f1'], ['prelude.f6', 'old.removed'], []])]).toEqual(['prelude.f1', 'prelude.f6']);
  });
});
