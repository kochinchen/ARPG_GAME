import type { DataRegistry } from '../../data/DataRegistry';
import type { FloorDef } from '../../data/schema/floor';
import { generatedMapId } from './MapGenerator';
import type { ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

export interface FloorBeginOptions {
  /** 本層已擊殺的怪物（生成順序索引）；讀檔時使用 */
  killed?: readonly number[];
  /** 出口一開始就開啟（已通過的樓層、或讀檔時已開啟） */
  exitOpen?: boolean;
  /** Boss 層：Boss 的生成索引。出口只在 Boss 被擊敗後開啟（不看清怪比例） */
  bossIndex?: number;
}

type FloorData = Pick<DataRegistry, 'floors' | 'maps'>;

/**
 * 目前樓層、該層設定與出口狀態。
 * 擊敗本層 clearRatio 比例的怪物後出口開啟；實際換層由 GameWorld 在 Tick 結尾執行。
 * 也記錄存檔需要的樓層狀態：本層已擊殺的怪物、每層已開啟的寶箱。
 */
export class FloorManager {
  floor = 0;
  def: FloorDef | null = null;
  /** 本層生成計畫的怪物總數與已擊敗數 */
  total = 0;
  killed = 0;
  exitOpen = false;
  /** 本層已擊殺怪物的生成索引（換層時清空） */
  readonly killedSpawns: number[] = [];
  /** 樓層 → 已開啟寶箱的生成索引（跨層永久保留：寶箱只能開一次） */
  readonly openedChests = new Map<number, Set<number>>();
  private readonly spawnIndexOf = new Map<ActorId, number>();
  /** Boss 層的 Boss 生成索引；一般樓層為 null */
  private bossIndex: number | null = null;
  private pendingFloor: number | null = null;

  constructor(
    private readonly data: FloorData,
    private readonly events: GameEventBus,
  ) {
    events.on('ActorDied', (e) => {
      // 召喚物不計入擊殺數
      if (e.faction !== 'enemy' || this.def === null || e.summoned) return;
      const index = this.spawnIndexOf.get(e.actorId);
      if (index !== undefined) this.killedSpawns.push(index);
      this.killed++;
      this.checkExit();
    });
  }

  defFor(floor: number): FloorDef {
    return floorDefFor(this.data, floor);
  }



  /** 還需要擊敗幾隻出口才會開（Boss 層：Boss 還活著時為 1） */
  get remainingToOpen(): number {
    if (!this.def || this.exitOpen) return 0;
    if (this.bossIndex !== null) return this.bossDefeated ? 0 : 1;
    return Math.max(0, Math.ceil(this.total * this.def.clearRatio) - this.killed);
  }

  /** 目前是 Boss 層 */
  get bossFloor(): boolean {
    return this.bossIndex !== null;
  }

  get bossDefeated(): boolean {
    return this.bossIndex !== null && this.killedSpawns.includes(this.bossIndex);
  }

  begin(floor: number, monsterCount: number, options: FloorBeginOptions = {}): void {
    this.floor = floor;
    this.def = this.defFor(floor);
    this.total = monsterCount;
    this.killedSpawns.length = 0;
    this.killedSpawns.push(...(options.killed ?? []));
    this.killed = this.killedSpawns.length;
    this.spawnIndexOf.clear();
    this.bossIndex = options.bossIndex ?? null;
    // 預先開啟時不發事件（不是這次擊殺造成的）
    this.exitOpen = options.exitOpen ?? false;
    this.checkExit();
  }

  /** 記錄怪物的生成索引（擊殺時寫入 killedSpawns） */
  trackSpawn(actorId: ActorId, index: number): void {
    this.spawnIndexOf.set(actorId, index);
  }

  isChestOpened(floor: number, index: number): boolean {
    return this.openedChests.get(floor)?.has(index) ?? false;
  }

  markChestOpened(floor: number, index: number): void {
    let opened = this.openedChests.get(floor);
    if (!opened) this.openedChests.set(floor, (opened = new Set()));
    opened.add(index);
  }

  /** 玩家點了出口：開啟時排定下一層，未開時回傳還差幾隻 */
  requestDescend(): number {
    if (!this.exitOpen) return this.remainingToOpen;
    this.pendingFloor = this.floor + 1;
    return 0;
  }

  /** 開發用：不需清怪，直接前往下一層 */
  forceDescend(): void {
    this.pendingFloor = this.floor + 1;
  }

  /** 玩家點了往上的樓梯：第 1 層沒有上一層 */
  requestAscend(): boolean {
    if (this.floor <= 1) return false;
    this.pendingFloor = this.floor - 1;
    return true;
  }

  /** Tick 結尾取出待切換的樓層 */
  takePending(): number | null {
    const next = this.pendingFloor;
    this.pendingFloor = null;
    return next;
  }

  private checkExit(): void {
    if (this.exitOpen || this.remainingToOpen > 0) return;
    this.exitOpen = true;
    this.events.emit('ExitOpened', { floor: this.floor });
  }
}

export function floorDefFor(data: FloorData, floor: number): FloorDef {
  const def = data.floors.all.find((f) => floor >= f.floors[0] && floor <= f.floors[1]);
  if (!def) throw new Error(`no floor definition for floor ${floor}`);
  return def;
}

/** 這一層的地圖 ID：隨機產生的樓層依產生器版本與樓層號；固定地圖在同一區間內輪替 */
export function mapIdForFloor(data: FloorData, floor: number): string {
  const def = floorDefFor(data, floor);
  if (def.layout) return generatedMapId(floor);
  const maps = def.maps!;
  return maps[(floor - def.floors[0]) % maps.length]!;
}
