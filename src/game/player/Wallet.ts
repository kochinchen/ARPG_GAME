/** 玩家的金幣 */
export class Wallet {
  constructor(public gold = 0) {}

  add(amount: number): void {
    this.gold += amount;
  }

  /** 付錢：金幣足夠時扣除並回傳 true */
  spend(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }
}
