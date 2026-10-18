<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{ entry: EntryView | null; size?: 'cell' | 'slot' }>();
</script>

<template>
  <span v-if="entry" class="glyph" :class="[`r-${entry.rarity}`, `kind-${entry.kind}`, `size-${size ?? 'cell'}`]">
    <img v-if="entry.icon" class="icon" :src="entry.icon" alt="" draggable="false" />
    <template v-else>{{ entry.glyph }}</template>
    <span v-if="entry.kind === 'potion'" class="count">{{ entry.count }}</span>
  </span>
</template>

<style scoped>
/* 小圖示 + 稀有度顏色邊框：普通灰、魔法藍、稀有黃、史詩紫、傳奇橘、神話紅（脈動） */
.glyph {
  --rc: #6a6258;
  --rbg: rgb(255 255 255 / 3%);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  font: 14px/1 serif;
  background: radial-gradient(circle at 50% 40%, var(--rbg), #14110e 78%);
  border: 2px solid var(--rc);
  border-radius: 4px;
  box-shadow: inset 0 0 8px rgb(0 0 0 / 70%);
}
.icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.glyph.size-slot {
  font-size: 18px;
}
.glyph.size-slot .icon {
  width: 92%;
  height: 92%;
}
.r-normal {
  --rc: #6a6258;
  color: #e8e2d4;
}
.r-magic {
  --rc: #5a7cff;
  --rbg: rgb(111 141 255 / 16%);
  color: #8aa2ff;
}
.r-rare {
  --rc: #e8c23a;
  --rbg: rgb(242 210 75 / 16%);
  color: #f2d24b;
}
.r-epic {
  --rc: #9a5cff;
  --rbg: rgb(154 92 255 / 18%);
  color: #b98cff;
}
.r-legendary {
  --rc: #f08a2a;
  --rbg: rgb(240 138 42 / 22%);
  color: #ff9a3c;
  box-shadow:
    inset 0 0 8px rgb(0 0 0 / 70%),
    0 0 6px rgb(240 138 42 / 45%);
}
.r-mythic {
  --rc: #e83a3a;
  --rbg: rgb(232 58 58 / 24%);
  color: #ff4d4d;
  box-shadow:
    inset 0 0 8px rgb(0 0 0 / 70%),
    0 0 8px rgb(232 58 58 / 55%);
  animation: mythic-pulse 1.6s ease-in-out infinite;
}
@keyframes mythic-pulse {
  50% {
    border-color: #ff6a5a;
    box-shadow:
      inset 0 0 8px rgb(0 0 0 / 70%),
      0 0 12px rgb(255 90 70 / 75%);
  }
}
.glyph.kind-potion {
  --rc: #8a3a30;
  --rbg: rgb(176 42 30 / 16%);
  color: #e0574b;
}
.count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font: 9px/1 ui-monospace, Menlo, monospace;
  color: #f0e2c0;
  text-shadow: 0 0 2px #000;
}
</style>
