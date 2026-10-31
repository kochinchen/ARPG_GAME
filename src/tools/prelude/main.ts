/**
 * 過場影片預覽（prelude.html）：用遊戲的播放器（ui/cutscene/CutscenePlayer）播任一部，
 * 不需要存檔或進入遊戲。文字在 data/cutscenes.json，圖與聲音由 scripts/prelude_audio.py 產生。
 */
import { cutscenes } from '../../data/cutscenes';
import { playCutscene } from '../../ui/cutscene/CutscenePlayer';

const list = document.getElementById('list')!;
const ctx = new AudioContext();
let playing = false;

for (const def of cutscenes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${def.label}　${def.panels[0]?.title ?? ''}`;
  button.addEventListener('click', async () => {
    if (playing) return;
    playing = true;
    await ctx.resume();
    await playCutscene(def, { ctx, output: null });
    playing = false;
  });
  list.appendChild(button);
}
