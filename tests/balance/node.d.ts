// 難度模擬跑在 Node（vitest）裡：專案沒有安裝 @types/node，這裡只宣告用到的部分
declare const process: { env: Record<string, string | undefined> };

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function appendFileSync(path: string, data: string): void;
  export function writeFileSync(path: string, data: string): void;
}
