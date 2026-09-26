/** 玩家的金幣 */
export class Wallet {
  constructor(public gold = 0) {}

  add(amount: number): void {
    this.gold += amount;
  }
}
