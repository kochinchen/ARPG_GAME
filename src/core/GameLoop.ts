/** 時間來源（秒）。瀏覽器用 performance.now()，測試可手動推進。 */
export interface IClock {
  now(): number;
}

/** 排程下一幀。瀏覽器用 requestAnimationFrame，由 main.ts 注入。 */
export type FrameScheduler = (callback: () => void) => void;

export interface GameLoopOptions {
  /** 邏輯固定步長（秒），預設 1/60 */
  step?: number;
  /** 單幀最多追趕的時間，避免分頁回來時一次跑上千個 Tick */
  maxFrameTime?: number;
  update: (dt: number) => void;
  /** alpha：距離下一個 Tick 的比例 [0, 1)，用於畫面插值 */
  render: (alpha: number) => void;
}

/**
 * 固定步長 Game Loop：邏輯 60 Hz，與畫面 FPS 脫鉤。
 */
export class GameLoop {
  readonly step: number;
  private readonly maxFrameTime: number;
  private readonly update: (dt: number) => void;
  private readonly render: (alpha: number) => void;

  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private _tick = 0;
  paused = false;

  constructor(options: GameLoopOptions) {
    this.step = options.step ?? 1 / 60;
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
    this.update = options.update;
    this.render = options.render;
  }

  /** 已執行的邏輯 Tick 數 */
  get tick(): number {
    return this._tick;
  }

  /**
   * 推進 elapsed 秒，執行對應數量的邏輯 Tick 後 render 一次。
   * 回傳本次執行的 Tick 數。測試直接呼叫這個方法。
   */
  advance(elapsed: number): number {
    const frame = Math.min(Math.max(elapsed, 0), this.maxFrameTime);
    let ticks = 0;
    if (!this.paused) {
      this.accumulator += frame;
      while (this.accumulator >= this.step) {
        this.update(this.step);
        this.accumulator -= this.step;
        this._tick++;
        ticks++;
      }
    }
    this.render(this.accumulator / this.step);
    return ticks;
  }

  start(clock: IClock, schedule: FrameScheduler): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = clock.now();
    const frame = () => {
      if (!this.running) return;
      const now = clock.now();
      this.advance(now - this.lastTime);
      this.lastTime = now;
      schedule(frame);
    };
    schedule(frame);
  }

  stop(): void {
    this.running = false;
  }
}
