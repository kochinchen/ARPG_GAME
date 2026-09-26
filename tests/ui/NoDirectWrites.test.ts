import { describe, expect, it } from 'vitest';

/**
 * M8 驗收：UI 對遊戲的修改全部經由 Command。
 * ui/ 內的程式可以讀取 GameWorld（ui/bridge 建立快照），但不可以直接寫入。
 * 依賴方向另由 dependency-cruiser 檢查（Vue 元件只能 import Commands / GameEvents）。
 */
const SOURCES = import.meta.glob<string>('../../src/ui/**/*.{ts,vue}', { query: '?raw', import: 'default', eager: true });

/** world.xxx = …、world.xxx += …、world.xxx++、world.xxx.push(…) 之類的寫入 */
const WRITE_PATTERNS = [
  /\bworld\.[\w.[\]'"]+\s*(?:[-+*/]?=(?!=)|\+\+|--)/,
  /\bworld\.[\w.[\]'"]+\.(?:push|pop|shift|unshift|splice|sort|reverse|set|delete|clear|add|fill)\(/,
  /\bworld\.(?:update|enterFloor|spawnGroundItem|spawnChestsNear|useExit|useStairsUp|restoreResources)\(/,
  /\bworld\.(?:inventory|equipment|cursor|skillTree|attributes|experience|potions|loadout|codex|floors|checkpoints)\.(?!get\b|has\b|all\b|version\b|points\b|check\b|rank\b|defs\b|count\b|cells\b|items\b|entry\b|mastery\b|index\b|xpForNextLevel\b|floor\b|killed\b|total\b|exitOpen\b|remainingToOpen\b|respawn\b|checkpoints\b|left\b|combos\b|supports\b|activeCombo\b|nextOrder\b|slotsFor\b|canEquip\b|state\b|checkUnlock\b)\w+\(/,
];

describe('UI 不直接寫入遊戲狀態', () => {
  const sources = Object.entries(SOURCES);

  it('掃描到 ui/ 的檔案', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources.map(([path, text]) => [path.replace('../../src/ui/', ''), text]))('%s', (_name, text) => {
    const lines = text.split('\n');
    const violations = lines.flatMap((line, i) => (WRITE_PATTERNS.some((p) => p.test(line)) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(violations).toEqual([]);
  });

  it('偵測規則本身有效', () => {
    const bad = ['world.player.hp = 5;', 'world.progress.level++;', 'world.groundItems.push(x);', 'world.enterFloor(2);', 'world.inventory.place(1, e);'];
    for (const line of bad) expect(WRITE_PATTERNS.some((p) => p.test(line)), line).toBe(true);
    const ok = ['const hp = world.player.hp;', 'world.inventory.get(3)', 'if (world.player.hp === 0)', 'world.skillTree.check(skill)'];
    for (const line of ok) expect(WRITE_PATTERNS.some((p) => p.test(line)), line).toBe(false);
  });
});
