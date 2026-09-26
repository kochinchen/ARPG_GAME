export type RightSlot = 0 | 1 | 2;

/**
 * 左鍵技能、右鍵 Q / W / E 三格，以及目前啟用哪一格。
 */
export class PlayerLoadout {
  activeRight: RightSlot = 0;

  constructor(
    public left: string,
    public readonly right: [string | null, string | null, string | null],
  ) {}

  get activeRightSkill(): string | null {
    return this.right[this.activeRight];
  }

  select(slot: RightSlot): void {
    this.activeRight = slot;
  }
}
