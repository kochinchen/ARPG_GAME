import { reactive } from 'vue';
import { emptyInventoryView } from './InventoryView';
import { emptySkillTreeView } from './SkillTreeView';

export interface ComboBarView {
  key: string;
  steps: string[];
  active: boolean;
  /** 施放中的步驟（1 起算），沒有在施放時為 0 */
  running: number;
}

/** 除錯資訊的唯讀快照；M8 會由 GameViewStore 取代 */
export const debugView = reactive({
  milestone: 'M9 Save',
  /** 開發模式才顯示測試快捷鍵說明 */
  devKeys: false,
  tick: 0,
  fps: 0,
  player: { x: 0, y: 0 },
  waypoints: 0,
  target: '—',
  hp: { value: 0, max: 1 },
  mp: { value: 0, max: 1 },
  potions: '',
  gold: 0,
  enemies: 0,
  /** 倒地中顯示的倒數秒數；存活為 null */
  respawnIn: null as number | null,
  leftSkill: '',
  combos: [] as ComboBarView[],
  supports: [] as string[],
  inventory: emptyInventoryView(),
  /** 樓層進度（固定地圖模式 floor = 0） */
  floor: { floor: 0, killed: 0, total: 0, remaining: 0, exitOpen: false },
  /** 進入新樓層時顯示幾秒的橫幅 */
  floorBanner: null as number | null,
  /** 倒地後回到哪個存檔點 */
  respawnAt: '樓梯口',
  /** 第一次發現 Combo 時顯示幾秒的橫幅 */
  discovery: null as { name: string; description: string[] } | null,
  skillTree: emptySkillTreeView(),
  xp: { level: 1, value: 0, next: 1 },
  skillPoints: 0,
  /** 存檔狀態：最後一次成功存檔的時間、錯誤訊息 */
  save: { lastSavedAt: '', error: null as string | null },
  /** 讀檔時的提示（從備份還原、資料修復），顯示幾秒 */
  saveNotices: [] as string[],
});
