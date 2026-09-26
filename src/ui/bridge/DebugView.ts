import { reactive } from 'vue';

/** M0 除錯資訊的唯讀快照；M8 會由 GameViewStore 取代 */
export const debugView = reactive({
  tick: 0,
  fps: 0,
  hoverTile: null as { x: number; y: number } | null,
});
