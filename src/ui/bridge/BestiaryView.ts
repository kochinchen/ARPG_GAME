import type { DataRegistry } from '../../data/DataRegistry';
import type { EnemyDef, EnemyFamily } from '../../data/schema/enemy';
import { scaleForFloor } from '../../game/world/DifficultyScaler';

/** 圖鑑的分類（依顯示順序） */
export const FAMILY_LABELS: Record<Exclude<EnemyFamily, 'other'>, string> = {
  undead: '亡者與人形',
  beast: '掠界獸系',
  chitin: '甲殼蟲與節肢系',
  brute: '巨獸系',
  spitter: '噴吐異種',
  floater: '漂浮異體',
  parasite: '寄生變異體',
  boss: '樓層魔王與眷屬',
};

export interface BestiarySkill {
  name: string;
  description: string;
}

export interface BestiaryEntry {
  id: string;
  name: string;
  family: Exclude<EnemyFamily, 'other'>;
  lore: string;
  boss: boolean;
  /** 近戰 / 遠程 / 法術 */
  style: string;
  /** 出現樓層的說明，例如「第 12 層起」「第 5 層（魔王）」「由墓穴守衛召喚」 */
  appears: string;
  /** 第一次出現的樓層（統計表預設顯示這一層） */
  firstFloor: number;
  /** 體型說明 */
  size: string;
  skills: BestiarySkill[];
  phases: { hpBelow: number; label: string }[];
  moveSpeed: number;
  attackSpeed: number;
  /** 基礎數值（樓層倍率之前） */
  base: { hp: number; damage: [number, number]; defense: number; xp: number };
}

export interface BestiaryStats {
  hp: number;
  damage: [number, number];
  defense: number;
  xp: number;
}

/**
 * 怪物圖鑑的靜態內容（由遊戲資料推導，不存檔）。擊敗次數另外由 gameView.bestiary 提供。
 */
export function buildBestiary(data: DataRegistry): BestiaryEntry[] {
  const summoners = new Map<string, string[]>();
  for (const skill of data.skills.all) {
    for (const effect of skill.effects) {
      if (effect.type !== 'summon') continue;
      for (const enemy of data.enemies.all) {
        if (enemy.skills.includes(skill.id) || enemy.phases.some((p) => p.skills?.includes(skill.id))) {
          const list = summoners.get(effect.enemyId) ?? [];
          if (!list.includes(enemy.name)) list.push(enemy.name);
          summoners.set(effect.enemyId, list);
        }
      }
    }
  }
  const size = data.balance.enemySize;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const entries: BestiaryEntry[] = [];
  for (const enemy of data.enemies.all) {
    if (enemy.family === 'other') continue;
    const { appears, firstFloor } = appearance(enemy, data, summoners.get(enemy.id) ?? []);
    const skillIds = [...new Set([...enemy.skills, ...enemy.phases.flatMap((p) => p.skills ?? [])])];
    const roll = enemy.ai === 'melee' ? size.melee : size.ranged;
    entries.push({
      id: enemy.id,
      name: enemy.name,
      family: enemy.family,
      lore: enemy.lore,
      boss: enemy.boss,
      style: enemy.ai === 'ranged' ? (enemy.skills.some((id) => data.skills.get(id).tags.includes('spell')) ? '遠程・法術' : '遠程') : '近戰',
      appears,
      firstFloor,
      size: enemy.boss
        ? `約主角的 ${enemy.size} 倍大`
        : `${pct(enemy.size * roll.min)}～${pct(enemy.size * roll.max)}（常態分佈）${roll.statPerSize > 0 ? `，越大越強：HP / 傷害最多 ${pct(1 + (roll.max - 1) * roll.statPerSize)}` : '，數值不變'}`,
      skills: skillIds
        .filter((id) => id !== 'basic.attack')
        .map((id) => {
          const s = data.skills.get(id);
          return { name: s.name, description: s.description };
        }),
      phases: enemy.phases.map((p) => ({ hpBelow: p.hpBelow, label: p.label })),
      moveSpeed: enemy.moveSpeed,
      attackSpeed: enemy.attackSpeed,
      base: { hp: enemy.hp, damage: [enemy.damage[0], enemy.damage[1]], defense: enemy.defense, xp: enemy.xp },
    });
  }
  const order = Object.keys(FAMILY_LABELS);
  return entries.sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || a.firstFloor - b.firstFloor);
}

/** 某一層的數值（套用樓層倍率；一般體型 100%） */
export function statsAtFloor(entry: BestiaryEntry, floor: number, data: DataRegistry): BestiaryStats {
  const s = scaleForFloor(floor, data.balance.difficulty);
  return {
    hp: Math.round(entry.base.hp * s.hp),
    damage: [Math.round(entry.base.damage[0] * s.damage * 10) / 10, Math.round(entry.base.damage[1] * s.damage * 10) / 10],
    defense: Math.round(entry.base.defense * s.defense),
    xp: Math.round(entry.base.xp * s.xp),
  };
}

function appearance(enemy: EnemyDef, data: DataRegistry, summoners: readonly string[]): { appears: string; firstFloor: number } {
  const floors = data.floors.all;
  if (enemy.boss) {
    const list: number[] = [];
    for (const f of floors) {
      if (f.boss?.enemyId !== enemy.id) continue;
      const first = Math.ceil(f.floors[0] / f.boss.every) * f.boss.every;
      for (let n = first; n <= Math.min(f.floors[1], first + f.boss.every * 2); n += f.boss.every) list.push(n);
    }
    if (list.length === 0) return { appears: '尚未出現', firstFloor: 1 };
    const open = floors.some((f) => f.boss?.enemyId === enemy.id && f.floors[1] > list[list.length - 1]! + (f.boss?.every ?? 5));
    return { appears: `第 ${list.join('、')}${open ? '…' : ''} 層（魔王）`, firstFloor: list[0]! };
  }
  let first = Infinity;
  for (const f of floors) {
    for (const m of f.monsterPool) {
      if (m.enemyId === enemy.id) first = Math.min(first, Math.max(f.floors[0], m.minFloor));
    }
  }
  if (first !== Infinity) return { appears: `第 ${first} 層起`, firstFloor: first };
  if (summoners.length > 0) {
    const bossFloor = floors.find((f) => summoners.some((n) => data.enemies.all.find((e) => e.name === n)?.id === f.boss?.enemyId));
    return { appears: `由${summoners.join('、')}召喚`, firstFloor: bossFloor ? Math.ceil(bossFloor.floors[0] / bossFloor.boss!.every) * bossFloor.boss!.every : 1 };
  }
  return { appears: '尚未出現', firstFloor: 1 };
}

/**
 * 圖鑑面板使用的資料來源：main.ts 啟動時設定遊戲資料與頭像產生器（頭像由 render 畫出）。
 */
export const bestiaryBridge = {
  entries: [] as BestiaryEntry[],
  data: null as DataRegistry | null,
  portrait: (_enemyId: string): string => '',
  init(data: DataRegistry, portrait: (enemyId: string) => string): void {
    this.data = data;
    this.entries = buildBestiary(data);
    this.portrait = portrait;
  },
  statsAt(entry: BestiaryEntry, floor: number): BestiaryStats {
    return statsAtFloor(entry, floor, this.data!);
  },
};
