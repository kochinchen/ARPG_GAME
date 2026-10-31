import type { CutsceneDef } from '../../data/cutscenes';
import './cutscene.css';

/**
 * 過場影片播放器（data/cutscenes.json）：全畫面覆蓋，自動播放。
 * 開頭是標題卡（標題＋樓層），接著每幅舊紙繪圖慢慢放大，英文旁白逐句播放、字幕淡入，
 * 底下一直有黑暗魔法的低語（旁白說話時壓小）。左鍵：下一句；Esc：整段跳過。
 * 播放期間攔下所有按鍵，不會觸發遊戲或選單的快捷鍵。
 */

/** 每幅畫的放大幅度與鏡頭推向哪裡（transform-origin） */
const ZOOM = 1.12;
const FOCUS: Record<string, string> = {
  'f1-1': '42% 62%', // 井與女劍士
  'f1-2': '55% 30%', // 隊長的頭盔
  'f6-1': '58% 75%', // 神官貼地聽的裂縫
  'f11-1': '64% 38%', // 胸口插著鍛造錘的巨獸
  'f16-1': '36% 60%', // 三段附魔的劍
  'f21-1': '70% 45%', // 網上的王冠與後方的女王
  'f26-1': '57% 28%', // 王座上的魔王與分身
  'f31-1': '64% 78%', // 底下握著的艾希琳之盾
  'f35-1': '50% 32%', // 手牽手升起的艾希琳與女王
  'f35-2': '78% 58%', // 坐在斷牆上看著隊伍的她
  'f35-3': '72% 52%', // 井口的盾劍與燭光下作畫的她
  'f35-4': '36% 42%', // 井邊的孩子與拉住他的她
};
/** 標題卡停留、句與句、幅與幅之間的停頓（秒） */
const CARD_SECONDS = 3.2;
const LINE_GAP = 0.9;
const PANEL_GAP = 1.4;
/** 沒有 Web Audio 時每句字幕停留的時間 */
const SILENT_LINE_SECONDS = 6;
/** 低語的音量：平常 / 旁白說話時 */
const BED_GAIN = 0.4;
const BED_DUCK = 0.22;
const HINT = '左鍵：下一句　Esc：跳過';

const MEDIA = import.meta.glob<string>('./media/*', { query: '?url', import: 'default', eager: true });
function mediaUrl(name: string): string | null {
  for (const [path, url] of Object.entries(MEDIA)) {
    if (path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.')) === name) return url;
  }
  return null;
}

export interface CutsceneAudio {
  ctx: AudioContext | null;
  /** 旁白與低語接到這裡（遊戲的主音量）；null = 直接接到喇叭 */
  output: AudioNode | null;
}

const wait = (seconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, seconds * 1000));

export async function playCutscene(def: CutsceneDef, audio: CutsceneAudio): Promise<void> {
  const ctx = audio.ctx;
  const out = audio.output ?? ctx?.destination ?? null;
  const root = document.createElement('div');
  root.className = 'cutscene';
  root.innerHTML =
    '<div class="art"><div class="flicker"></div></div>' +
    '<div class="text"><div class="en"></div><div class="zh"></div></div>' +
    '<div class="card"><div class="title"></div><div class="label"></div></div>' +
    `<div class="hint">${HINT}</div>`;
  const art = root.querySelector<HTMLElement>('.art')!;
  const text = root.querySelector<HTMLElement>('.text')!;
  const en = root.querySelector<HTMLElement>('.en')!;
  const zh = root.querySelector<HTMLElement>('.zh')!;
  const card = root.querySelector<HTMLElement>('.card')!;
  card.querySelector('.title')!.textContent = def.panels[0]?.title ?? '';
  card.querySelector('.label')!.textContent = def.label;

  // 左鍵：下一句；Esc：整段跳過。其他按鍵一律攔下
  let skipLine: (() => void) | null = null;
  let skipAll = false;
  /** 進行中的等待：Esc 時全部立刻結束 */
  const waiting = new Set<() => void>();
  const next = () => skipLine?.();
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Escape' && !skipAll) {
      skipAll = true;
      next();
      for (const done of [...waiting]) done();
    }
  };
  const onPointer = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 0) next();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  root.addEventListener('pointerdown', onPointer);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('show'));

  /** 等待：Esc 一律提早結束；skippable 時左鍵也會 */
  const pause = (seconds: number, skippable = false) =>
    skipAll
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const id = window.setTimeout(done, seconds * 1000);
          function done() {
            window.clearTimeout(id);
            waiting.delete(done);
            if (skipLine === done) skipLine = null;
            resolve();
          }
          waiting.add(done);
          if (skippable) skipLine = done;
        });

  const bedGain = ctx?.createGain() ?? null;
  let bed: AudioBufferSourceNode | null = null;
  const ramp = (to: number, seconds: number) => {
    if (!ctx || !bedGain) return;
    bedGain.gain.cancelScheduledValues(ctx.currentTime);
    bedGain.gain.setValueAtTime(bedGain.gain.value, ctx.currentTime);
    bedGain.gain.linearRampToValueAtTime(to, ctx.currentTime + seconds);
  };
  const load = async (name: string): Promise<AudioBuffer | null> => {
    const url = mediaUrl(name);
    if (!ctx || !url) return null;
    try {
      return await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    } catch (error) {
      console.warn(`過場影片的聲音無法載入：${name}`, error);
      return null;
    }
  };
  const speak = (buffer: AudioBuffer | null): Promise<void> => {
    if (!ctx || !out || !buffer) return pause(SILENT_LINE_SECONDS, true);
    if (skipAll) return Promise.resolve();
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (skipLine === finish) skipLine = null;
        try {
          src.stop();
        } catch {
          // 已經停了
        }
        ramp(BED_GAIN, 1.2);
        resolve();
      };
      src.onended = finish;
      skipLine = finish;
      ramp(BED_DUCK, 0.6);
      src.start();
    });
  };

  try {
    if (ctx && bedGain && out) {
      bedGain.gain.value = 0;
      bedGain.connect(out);
      const bedBuffer = await load('whispers');
      if (bedBuffer) {
        bed = ctx.createBufferSource();
        bed.buffer = bedBuffer;
        bed.loop = true;
        bed.connect(bedGain);
        bed.start();
        ramp(BED_GAIN, 3);
      }
    }
    // 標題卡（同時載入旁白）
    card.classList.add('show');
    const [voices] = await Promise.all([
      Promise.all(def.panels.map((p, i) => Promise.all(p.lines.map((_, j) => load(`${def.media}-${i + 1}-${j + 1}`))))),
      pause(CARD_SECONDS),
    ]);
    card.classList.remove('show');
    await pause(1.2);

    for (const [i, panel] of def.panels.entries()) {
      if (skipAll) break;
      const url = mediaUrl(panel.image);
      const img = url ? await paper(url).catch(() => null) : null;
      if (img) {
        art.insertBefore(img, art.firstChild);
        // 這幅畫停留的總時間 = 每句旁白 + 停頓；放大動畫跟著拉長
        const seconds = panel.lines.reduce((s, _, j) => s + (voices[i]?.[j]?.duration ?? SILENT_LINE_SECONDS) + LINE_GAP, 0) + PANEL_GAP + 2;
        img.style.transformOrigin = FOCUS[panel.image] ?? '50% 50%';
        img.style.transition = `opacity 1.6s ease, transform ${seconds}s linear`;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            img.classList.add('show');
            img.style.transform = `scale(${ZOOM})`;
          }),
        );
      }
      await pause(1.4);
      for (const [j, line] of panel.lines.entries()) {
        if (skipAll) break;
        en.textContent = line.en;
        zh.textContent = line.zh;
        text.classList.add('show');
        await speak(voices[i]?.[j] ?? null);
        text.classList.remove('show');
        await pause(LINE_GAP);
      }
      await pause(PANEL_GAP - LINE_GAP);
      img?.classList.remove('show');
      await pause(1.6);
      img?.remove();
    }
  } finally {
    // 結束（或跳過）：低語與畫面一起淡出
    skipLine = null;
    ramp(0, 1.2);
    text.classList.remove('show');
    root.classList.remove('show');
    await wait(1.2);
    try {
      bed?.stop();
    } catch {
      // 已經停了
    }
    bedGain?.disconnect();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    root.remove();
  }
}

/** 生成的圖在紙張外圍是白底：從四邊往內，把連在一起的淺色像素變透明，只留下紙 */
async function paper(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const { naturalWidth: w, naturalHeight: h } = img;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const light = (i: number) => px[i * 4]! > 225 && px[i * 4 + 1]! > 220 && px[i * 4 + 2]! > 210;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !light(i)) continue;
    seen[i] = 1;
    px[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  g.putImageData(data, 0, 0);
  return canvas;
}
