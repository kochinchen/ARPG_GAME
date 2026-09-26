import type { DataRegistry } from '../../data/DataRegistry';
import type { FloorDef } from '../../data/schema/floor';
import type { MapDef } from '../../data/schema/map';
import type { GameEventBus } from '../GameEvents';

/**
 * 目前樓層、該層設定與出口狀態。
 * 擊敗本層 clearRatio 比例的怪物後出口開啟；進入下一層的實際切換由 GameWorld 在 Tick 結尾執行。
 */
export class FloorManager {
  floor = 0;
  def: FloorDef | null = null;
  /** 本層生成的怪物數與已擊敗數 */
  total = 0;
  killed = 0;
  exitOpen = false;
  private pendingFloor: number | null = null;

  constructor(
    private readonly data: Pick<DataRegistry, 'floors' | 'maps'>,
    private readonly events: GameEventBus,
  ) {
    events.on('ActorDied', (e) => {
      if (e.faction !== 'enemy' || this.def === null) return;
      this.killed++;
      this.checkExit();
    });
  }

  defFor(floor: number): FloorDef {
    const def = this.data.floors.all.find((f) => floor >= f.floors[0] && floor <= f.floors[1]);
    if (!def) throw new Error(`no floor definition for floor ${floor}`);
    return def;
  }

  /** 同一區間內依樓層輪替地圖 */
  mapFor(floor: number): MapDef {
    const def = this.defFor(floor);
    return this.data.maps.get(def.maps[(floor - def.floors[0]) % def.maps.length]!);
  }

  /** 還需要擊敗幾隻出口才會開 */
  get remainingToOpen(): number {
    if (!this.def) return 0;
    return Math.max(0, Math.ceil(this.total * this.def.clearRatio) - this.killed);
  }

  begin(floor: number, monsterCount: number): void {
    this.floor = floor;
    this.def = this.defFor(floor);
    this.total = monsterCount;
    this.killed = 0;
    this.exitOpen = false;
    this.checkExit();
  }

  /** 玩家點了出口：開啟時排定下一層，未開時回傳還差幾隻 */
  requestDescend(): number {
    if (!this.exitOpen) return this.remainingToOpen;
    this.pendingFloor = this.floor + 1;
    return 0;
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
