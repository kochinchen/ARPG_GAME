import { reactive } from 'vue';

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
  milestone: 'M4 Skill',
  tick: 0,
  fps: 0,
  player: { x: 0, y: 0 },
  waypoints: 0,
  target: '—',
  playerHp: '',
  playerMp: '',
  potions: '',
  enemies: 0,
  /** 倒地中顯示的倒數秒數；存活為 null */
  respawnIn: null as number | null,
  leftSkill: '',
  rightSlots: [] as SkillSlotView[],
});
