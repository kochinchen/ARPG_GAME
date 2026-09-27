import type { Rng } from '../../core/Rng';
import { distance, vec2, type Vec2 } from '../../core/math/Vec2';
import type { FloorDef } from '../../data/schema/floor';
import type { NavGrid } from '../movement/NavGrid';

/** 不生成怪物的安全範圍（樓梯口、出口、存檔點） */
export interface SafeZone {
  center: Vec2;
  radius: number;
}

export interface SpawnRequest {
  enemyId: string;
  position: Vec2;
  /** 精英怪的詞綴 ID（一般怪物為 undefined） */
  eliteAffixes?: string[];
}

/** 精英怪設定：每群的隊長有 chance 機率成為精英，從 pool 抽 count 個不重複的詞綴 */
export interface EliteRoll {
  chance: number;
  count: readonly [number, number];
  pool: readonly { id: string; weight: number }[];
  /** 獨立的亂數：加入精英怪不會改變原本怪物的位置與種類 */
  rng: Rng;
}

/** 同一群怪物之間、以及和其他群的最小距離 */
const PACK_SPREAD = 1.3;
const MIN_PACK_GAP = 4;

/**
 * 依樓層設定決定怪物與寶箱的位置（不建立實體，只回傳 SpawnRequest）。
 * 同一個 Rng 狀態一定得到相同結果；安全範圍（樓梯口、出口、存檔點）內不放怪。
 */
export class SpawnSystem {
  constructor(
    private readonly nav: NavGrid,
    private readonly rng: Rng,
  ) {}

  planMonsters(
    floor: FloorDef,
    densityMultiplier: number,
    zones: readonly SafeZone[],
    elite?: EliteRoll,
  ): SpawnRequest[] {
    const tiles = this.candidates(zones);
    const target = Math.round((this.nav.walkableArea / 100) * floor.density * densityMultiplier);
    const requests: SpawnRequest[] = [];
    const packCenters: Vec2[] = [];
    let attempts = 0;
    while (requests.length < target && tiles.length > 0 && attempts++ < 400) {
      const center = this.nav.cellCenter(this.rng.pick(tiles));
      if (packCenters.some((c) => distance(c, center) < MIN_PACK_GAP)) continue;
      packCenters.push(center);
      const size = Math.min(this.rng.int(floor.packSize[0], floor.packSize[1]), target - requests.length);
      for (let i = 0; i < size; i++) {
        const position = i === 0 ? center : this.near(center, zones);
        if (!position) continue;
        const request: SpawnRequest = { enemyId: this.rng.weighted(floor.monsterPool).enemyId, position };
        if (i === 0 && elite) {
          const affixes = rollElite(elite);
          if (affixes) request.eliteAffixes = affixes;
        }
        requests.push(request);
      }
    }
    return requests;
  }

  planChests(count: number, avoid: readonly Vec2[]): Vec2[] {
    const tiles = this.candidates(avoid.map((center) => ({ center, radius: 3 })));
    const chests: Vec2[] = [];
    for (let attempts = 0; chests.length < count && tiles.length > 0 && attempts < 200; attempts++) {
      const p = this.nav.cellCenter(this.rng.pick(tiles));
      if (chests.some((c) => distance(c, p) < 5) || !this.nav.isClearAt(p, 0.45)) continue;
      chests.push(p);
    }
    return chests;
  }

  private candidates(zones: readonly SafeZone[]): Vec2[] {
    return this.nav
      .walkableTiles()
      .filter((t) => {
        const c = this.nav.cellCenter(t);
        return outside(c, zones) && this.nav.isClearAt(c, 0.35);
      });
  }

  /** 群組中心附近的空位 */
  private near(center: Vec2, zones: readonly SafeZone[]): Vec2 | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const p = vec2(center.x + Math.cos(angle) * PACK_SPREAD, center.y + Math.sin(angle) * PACK_SPREAD);
      if (this.nav.isClearAt(p, 0.35) && outside(p, zones)) return p;
    }
    return null;
  }
}

/** 這一群的隊長是否成為精英；是的話回傳詞綴 ID（不重複） */
function rollElite(elite: EliteRoll): string[] | null {
  if (elite.pool.length === 0 || !elite.rng.chance(elite.chance)) return null;
  const count = Math.min(elite.rng.int(elite.count[0], elite.count[1]), elite.pool.length);
  const remaining = [...elite.pool];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const affix = elite.rng.weighted(remaining);
    picked.push(affix.id);
    remaining.splice(remaining.indexOf(affix), 1);
  }
  return picked;
}

const outside = (p: Vec2, zones: readonly SafeZone[]) => zones.every((z) => distance(p, z.center) >= z.radius);
