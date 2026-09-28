import type { FigureModel } from './FigureModel';
import { ABYSS_LORD } from './bosses/AbyssLord';
import { ABYSS_SOVEREIGN } from './bosses/AbyssSovereign';
import { ARMORED_BOSSES } from './bosses/ArmoredBosses';
import { LAVA_BEHEMOTH } from './bosses/LavaBehemoth';
import { ROBED_BOSSES } from './bosses/RobedBosses';
import { SPIDER_QUEEN } from './bosses/SpiderQueen';

/**
 * 樓層魔王（每 5 層）與眷屬的多面體模型。零件、骨架與動作分在 bosses/ 目錄：
 * BossRig（約 41 個關節的人形骨架）、BossParts（共用的多切面零件）、BossPoses（霸氣的站姿、行走、三種招式），
 * ArmoredBosses（墓穴守衛、墮落騎士）、RobedBosses（墮落神官、狂熱信徒）、LavaBehemoth（熔岩巨獸）、AbyssLord（深淵魔王）、SpiderQueen。
 * 以主角的尺寸設計（referenceRadius 0.5），遊戲中依 EnemyDef.size 放大到主角的 2 倍以上。
 */
export const BOSS_MODELS: Record<string, FigureModel> = {
  ...ARMORED_BOSSES,
  ...ROBED_BOSSES,
  'enemy.lava_behemoth': LAVA_BEHEMOTH,
  'enemy.spider_queen': SPIDER_QUEEN,
  // 深淵分身與深淵魔王同一個模型（體型較小）
  'enemy.abyss_lord': ABYSS_LORD,
  'enemy.abyss_shade': ABYSS_LORD,
  // 35F 深淵統御者：四足半身的惡魔（docs/ENDGAME.md 5.3）
  'enemy.abyss_sovereign': ABYSS_SOVEREIGN,
};
