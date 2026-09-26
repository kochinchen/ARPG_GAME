import { reactive } from 'vue';
import { emptyCharacterView } from './CharacterView';
import { emptyInventoryView } from './InventoryView';
import { emptySkillTreeView } from './SkillTreeView';

export interface SkillSlotView {
  id: string;
  name: string;
  /** 魔力足夠施放 */
  affordable: boolean;
}

export interface ComboBarView {
  key: 'Q' | 'W' | 'E';
  index: 0 | 1 | 2;
  /** 每一步：null = 空格；locked = 等級未到 */
  steps: ({ skill: SkillSlotView | null; locked: boolean })[];
  active: boolean;
  /** 施放中的步驟（1 起算），沒有在施放時為 0 */
  running: number;
  /** 已發現的 Combo 名稱；有 Combo 但未發現為 '???'；沒有 Combo 為 null */
  comboName: string | null;
}

export interface LeaveFloorPrompt {
  direction: 'down' | 'up';
  toFloor: number;
  valuableItems: number;
}

/**
 * UI 唯讀的遊戲快照（M8 取代 M1 起的 debugView）。
 * 由 ViewSync 在每幀 Tick 結束後更新；UI 只讀取這裡，寫入一律送 Command（gameBridge）。
 */
export const gameView = reactive({
  hud: {
    hp: { value: 0, max: 1 },
    mp: { value: 0, max: 1 },
    xp: { level: 1, value: 0, next: 1 },
    skillPoints: 0,
    attributePoints: 0,
    potions: 0,
    gold: 0,
  },
  skillBar: {
    left: null as SkillSlotView | null,
    combos: [] as ComboBarView[],
    supports: [] as string[],
  },
  /** 樓層進度（固定地圖模式 floor = 0） */
  floor: { floor: 0, killed: 0, total: 0, remaining: 0, exitOpen: false },
  /** 進入新樓層時顯示幾秒的橫幅 */
  floorBanner: null as number | null,
  /** 倒地中顯示的倒數秒數；存活為 null */
  respawnIn: null as number | null,
  /** 倒地後回到哪個存檔點 */
  respawnAt: '樓梯口',
  /** 第一次發現 Combo 時顯示幾秒的橫幅 */
  discovery: null as { name: string; description: string[] } | null,
  /** 離開樓層前的確認（地上還有稀有以上物品） */
  leavePrompt: null as LeaveFloorPrompt | null,
  inventory: emptyInventoryView(),
  skillTree: emptySkillTreeView(),
  character: emptyCharacterView(),
  /** 存檔狀態：最後一次成功存檔的時間、錯誤訊息 */
  save: { lastSavedAt: '', error: null as string | null },
  /** 讀檔時的提示（從備份還原、資料修復），顯示幾秒 */
  saveNotices: [] as string[],
  /** 開發用除錯資訊（只在 npm run dev 顯示，F3 切換） */
  dev: {
    enabled: false,
    tick: 0,
    fps: 0,
    player: { x: 0, y: 0 },
    waypoints: 0,
    enemies: 0,
    target: '—',
  },
});

export type GameView = typeof gameView;
