<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { displayBridge } from '../bridge/DisplayBridge';

/**
 * 角色頁的大尺寸人物預覽：這裡只有外框與轉向按鈕，主角由遊戲畫面畫在這個區域
 * （與遊戲同一個模型、換裝、武器與微光；不另外建立 WebGL 環境）。← → 轉換方向（八個方向）。
 */
const frame = ref<HTMLElement | null>(null);
const dir = ref(0);
let observer: ResizeObserver | null = null;

function report(): void {
  const el = frame.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  // 畫面太窄（隱藏）時關閉預覽
  displayBridge.setPreview(r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height, dir: dir.value } : null);
}

function turn(step: number): void {
  dir.value = (dir.value + step + 8) % 8;
  report();
}

onMounted(() => {
  report();
  observer = new ResizeObserver(report);
  if (frame.value) observer.observe(frame.value);
  window.addEventListener('resize', report);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', report);
  displayBridge.setPreview(null);
});
</script>

<template>
  <aside ref="frame" class="hero" @pointerdown.stop @contextmenu.prevent>
    <button type="button" class="turn left" aria-label="向左轉" title="向左轉" @click="turn(1)">←</button>
    <button type="button" class="turn right" aria-label="向右轉" title="向右轉" @click="turn(-1)">→</button>
  </aside>
</template>

<style scoped>
/* 背景由遊戲畫面畫（主角畫在畫布上，這裡要透明才看得到） */
.hero {
  position: absolute;
  top: 12px;
  right: calc(12px + min(510px, 100vw - 32px) + 8px);
  width: 240px;
  height: 360px;
  pointer-events: auto;
  border: 1px solid #5a4632;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
.turn {
  position: absolute;
  bottom: 6px;
  width: 36px;
  height: 24px;
  font: 16px/1 sans-serif;
  color: #e8c47a;
  cursor: pointer;
  background: rgb(26 20 16 / 90%);
  border: 1px solid #5a4632;
}
.turn:hover {
  border-color: #c9a86a;
}
.left {
  left: 8px;
}
.right {
  right: 8px;
}
/* 畫面太窄時不顯示（避免蓋住遊戲） */
@media (max-width: 820px) {
  .hero {
    display: none;
  }
}
</style>
