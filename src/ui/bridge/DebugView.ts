import { reactive } from 'vue';

/** 除錯資訊的唯讀快照；M8 會由 GameViewStore 取代 */
export const debugView = reactive({
  milestone: 'M1 Player Movement',
  tick: 0,
  fps: 0,
  player: { x: 0, y: 0 },
  waypoints: 0,
});
