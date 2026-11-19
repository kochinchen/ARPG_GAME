import { describe, expect, it } from 'vitest';
import { distance, moveTowards, vec2, type Vec2 } from '../../src/core/math/Vec2';
import { MovementSystem } from '../../src/game/movement/MovementSystem';
import { NavGrid } from '../../src/game/movement/NavGrid';
import { Pathfinder } from '../../src/game/movement/Pathfinder';
import { SeparationSystem } from '../../src/game/movement/SeparationSystem';
import { slide } from '../../src/game/skills/effects/movement';
import { createWorldWithMap, DT, makeActor, run } from './helpers';

/**
 * 難度模擬第 22 層看到的問題：主角的中心走進一格不可走的格子，之後每次點地面都不動。
 * 三件事湊在一起才會發生：
 *  1. 角色比格子寬（隨機地牢的格子 0.5、主角直徑 0.6）時，只有 1 格厚的牆會夾在「四個角」中間，
 *     isClearAt / hasLineOfSight 沒看到，直線路徑就直接穿過去。
 *  2. 走到一半被推開（怪物推擠、擊退、鉤擊拉扯）後路徑沒有重算，從新位置直線走向舊的 Waypoint 會斜切過牆角。
 *  3. 中心一旦在不可走的格子裡，findPath 直接回傳空陣列，怎麼點都走不出來。
 */

const R = 0.3;
/** 主角的走路速度（World 單位 / 秒） */
const SPEED = 5;

const grid = (cellSize: number, ...rows: string[]) => NavGrid.fromMap({ rows, cellSize });
const inWall = (nav: NavGrid, p: Vec2) => !nav.isWalkableAt(p.x, p.y);

/** 用和 MovementSystem 相同的步長沿路徑走（不做任何檢查）；回傳中心第一次落在不可走格子的位置 */
function firstStepInWall(nav: NavGrid, from: Vec2, path: readonly Vec2[]): Vec2 | null {
  let at = from;
  for (const waypoint of path) {
    while (distance(at, waypoint) > 0) {
      at = moveTowards(at, waypoint, SPEED * DT);
      if (inWall(nav, at)) return at;
    }
  }
  return null;
}

/** 每個可走的格子取四點：正中間（A* 的 Waypoint 都在這裡）與偏右下的位置 */
function samples(nav: NavGrid): Vec2[] {
  const points: Vec2[] = [];
  for (const tile of nav.walkableTiles()) {
    for (const fy of [0.5, 0.8]) for (const fx of [0.5, 0.8]) points.push(vec2((tile.x + fx) * nav.cell, (tile.y + fy) * nav.cell));
  }
  return points;
}

/** 所有起點 × 終點：沿 findPath 的路徑走，中心走進牆的組數與第一個例子 */
function pathsThroughWalls(nav: NavGrid): { count: number; first: string | null } {
  const finder = new Pathfinder(nav);
  const points = samples(nav);
  let count = 0;
  let first: string | null = null;
  for (const from of points) {
    for (const to of points) {
      const path = finder.findPath(from, to, R);
      const hit = firstStepInWall(nav, from, path);
      if (!hit) continue;
      count++;
      first ??= `(${from.x}, ${from.y}) → (${to.x}, ${to.y})，路徑 ${JSON.stringify(path)}，在 (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}) 走進牆`;
    }
  }
  return { count, first };
}

describe('路徑不會把角色的中心帶進不可走的格子', () => {
  it('格子 0.5：只有 1 格大的柱子（比主角窄）', () => {
    const nav = grid(0.5, '..........', '..........', '..........', '....#.....', '..........', '..........', '..........');
    expect(pathsThroughWalls(nav)).toEqual({ count: 0, first: null });
  });

  it('格子 0.5：1 格厚的牆', () => {
    const nav = grid(0.5, '..........', '..........', '..........', '..#####...', '..........', '..........', '..........');
    expect(pathsThroughWalls(nav)).toEqual({ count: 0, first: null });
  });

  it('格子 0.5：隨機地牢的 2×2 柱子（1 World 單位）', () => {
    const nav = grid(0.5, '..........', '..........', '..........', '....##....', '....##....', '..........', '..........', '..........');
    expect(pathsThroughWalls(nav)).toEqual({ count: 0, first: null });
  });

  it('格子 1：1 格大的柱子', () => {
    const nav = grid(1, '.....', '.....', '..#..', '.....', '.....');
    expect(pathsThroughWalls(nav)).toEqual({ count: 0, first: null });
  });

  it('比柱子寬的大型怪也一樣（半徑 0.8、柱子 1 格）', () => {
    const nav = grid(1, '.......', '.......', '.......', '...#...', '.......', '.......', '.......');
    // 正對著柱子直走：四個角在柱子兩側，舊的檢查會說「直線可達」
    const from = vec2(3.5, 1.5);
    const path = new Pathfinder(nav).findPath(from, vec2(3.5, 5.5), 0.8);
    expect(path.at(-1)).toEqual(vec2(3.5, 5.5));
    expect(firstStepInWall(nav, from, path)).toBeNull();
  });
});

describe('走到一半被推開', () => {
  //   0123456
  // 0 .......
  // 1 .......
  // 2 ...#...   柱子佔 [3, 4) × [2, 3)
  // 3 .......
  // 4 .......
  const nav = grid(1, '.......', '.......', '...#...', '.......', '.......');
  const destination = vec2(4.5, 0.5);

  /** 主角從柱子右下方往右上走，途中被往左推（模擬擊退 / 鉤擊 / 怪物推擠）；回傳走完後的狀態 */
  function shoved() {
    const finder = new Pathfinder(nav);
    const actor = makeActor({ position: vec2(4.5, 4.5), stats: { moveSpeed: SPEED } });
    actor.path = finder.findPath(actor.position, destination, R);
    expect(actor.path).toEqual([destination]);
    const movement = new MovementSystem(nav, finder);
    for (let t = 0; t < 6; t++) movement.update([actor], DT);
    // 被往左推 2 格：新位置到舊 Waypoint 的直線斜切過柱子
    slide(actor, vec2(-1, 0), 2, nav);
    expect(nav.isClearAt(actor.position, R)).toBe(true);
    expect(nav.hasLineOfSight(actor.position, destination, R)).toBe(false);
    let entered: Vec2 | null = null;
    for (let t = 0; t < 600 && actor.path.length > 0; t++) {
      movement.update([actor], DT);
      if (inWall(nav, actor.position)) entered ??= actor.position;
    }
    return { actor, entered };
  }

  it('不會照舊路徑直線走進柱子', () => {
    expect(shoved().entered).toBeNull();
  });

  it('改繞過柱子，仍然走到原本點的地方', () => {
    expect(shoved().actor.position).toEqual(destination);
  });

  it('怪物把主角推向比主角窄的牆：推不進去', () => {
    // 格子 0.5、牆只有 1 格厚；主角貼在牆的左邊，怪物從左邊擠過來
    const thin = grid(0.5, '........', '........', '....#...', '....#...', '....#...', '........', '........');
    const player = makeActor({ position: vec2(1.9, 1.75) });
    const monster = makeActor({ faction: 'enemy', position: vec2(1.55, 1.75), stats: { moveSpeed: 0 } });
    const separation = new SeparationSystem(thin);
    for (let t = 0; t < 30; t++) {
      // 怪物一路往右擠
      monster.position = vec2(monster.position.x + 0.03, 1.75);
      separation.update([monster, player]);
      expect(inWall(thin, player.position)).toBe(false);
    }
  });
});

describe('已經站在不可走的格子裡', () => {
  it('findPath 先帶到最近的可走格子，再走向目的地', () => {
    const nav = grid(1, '.....', '.....', '..#..', '.....', '.....');
    const finder = new Pathfinder(nav);
    // 柱子 [2, 3) × [2, 3) 的左下角裡面：最近的地板在下方
    const from = vec2(2.3, 2.9);
    const to = vec2(2.5, 0.5);
    const path = finder.findPath(from, to, R);
    expect(path[0]).toEqual(vec2(2.5, 3.5));
    expect(path.at(-1)).toEqual(to);

    const actor = makeActor({ position: from, stats: { moveSpeed: SPEED } });
    actor.path = path;
    const movement = new MovementSystem(nav, finder);
    let outAt: number | null = null;
    for (let t = 0; t < 600 && actor.path.length > 0; t++) {
      movement.update([actor], DT);
      if (outAt === null && !inWall(nav, actor.position)) outAt = t;
      // 出來之後不會再走回牆裡
      if (outAt !== null) expect(inWall(nav, actor.position)).toBe(false);
    }
    expect(outAt).not.toBeNull();
    expect(actor.position).toEqual(to);
  });

  it('難度模擬看到的位置：格子 0.5，站在柱子的角裡', () => {
    // 柱子佔 [1.5, 2.5) × [1.5, 2.5)；主角在右下那一格 (4, 4) 靠下緣的地方
    const nav = grid(0.5, '..........', '..........', '..........', '...##.....', '...##.....', '..........', '..........', '..........');
    const from = vec2(2.26, 2.44);
    expect(inWall(nav, from)).toBe(true);
    const path = new Pathfinder(nav).findPath(from, vec2(4.25, 0.75), R);
    expect(path.length).toBeGreaterThan(0);
    expect(inWall(nav, path[0]!)).toBe(false);
    expect(distance(from, path[0]!)).toBeLessThan(0.5);
  });

  it('四周都是牆（走不出來）時仍回傳空路徑', () => {
    const nav = grid(1, '#####', '#####', '#####');
    expect(new Pathfinder(nav).findPath(vec2(2.5, 1.5), vec2(2.5, 1.5), R)).toEqual([]);
  });

  it('GameWorld：主角在牆裡時，點地面會走出來並走到目的地', () => {
    const { world, commands } = createWorldWithMap(['#######', '#S....#', '#..#..#', '#.....#', '#######']);
    const player = world.player;
    player.position = vec2(3.4, 2.9);
    expect(inWall(world.nav, player.position)).toBe(true);
    const target = vec2(5.5, 1.5);
    commands.push({ type: 'PrimaryAction', worldPos: target, targetId: null, held: false });
    run(world, 2);
    expect(inWall(world.nav, player.position)).toBe(false);
    expect(distance(player.position, target)).toBeLessThan(0.01);
  });
});
