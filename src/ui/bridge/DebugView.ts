import { reactive } from 'vue';
import { emptyInventoryView } from './InventoryView';

export interface SkillSlotView {
  key: string;
  name: string;
  active: boolean;
  /** 剩餘冷卻秒數，0 = 可用 */
  cooldown: number;
  manaCost: number;
}

/** 除錯資訊的唯讀快照；M8 會由 GameViewStore 取代 */
export const debugView = reactive({
  milestone: 'M5 Loot',
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
  rightSlots: [] as SkillSlotView[],
  inventory: emptyInventoryView(),
});
