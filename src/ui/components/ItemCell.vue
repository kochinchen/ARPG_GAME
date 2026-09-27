<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{ entry: EntryView | null; size?: 'cell' | 'slot' }>();
</script>

<template>
  <span v-if="entry" class="glyph" :class="[`r-${entry.rarity}`, entry.kind, size ?? 'cell']">
    {{ entry.glyph }}
    <span v-if="entry.kind === 'potion'" class="count">{{ entry.count }}</span>
  </span>
</template>

<style scoped>
.glyph {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font: 14px/1 serif;
  background: rgb(255 255 255 / 4%);
}
/* 稀有度邊框：普通灰、魔法藍、稀有黃、史詩紫、傳奇橘、神話紅（脈動） */
.glyph.r-normal {
  box-shadow: inset 0 0 0 1px #6a6258;
}
.glyph.r-magic {
  box-shadow: inset 0 0 0 2px #5a7cff;
}
.glyph.r-rare {
  box-shadow: inset 0 0 0 2px #e8c23a;
}
.glyph.r-epic {
  box-shadow: inset 0 0 0 2px #9a5cff;
}
.glyph.r-legendary {
  box-shadow:
    inset 0 0 0 2px #f08a2a,
    inset 0 0 8px rgb(240 138 42 / 45%);
}
.glyph.r-mythic {
  box-shadow:
    inset 0 0 0 2px #e83a3a,
    inset 0 0 10px rgb(232 58 58 / 55%);
  animation: mythic-pulse 1.6s ease-in-out infinite;
}
@keyframes mythic-pulse {
  50% {
    box-shadow:
      inset 0 0 0 2px #ff6a5a,
      inset 0 0 14px rgb(255 90 70 / 75%);
  }
}
.glyph.potion {
  box-shadow: inset 0 0 0 1px #8a3a30;
}
.glyph.slot {
  font-size: 18px;
}
.potion {
  color: #e0574b;
  background: rgb(176 42 30 / 18%);
}
.count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font: 9px/1 ui-monospace, Menlo, monospace;
  color: #f0e2c0;
}
.r-normal {
  color: #e8e2d4;
}
.r-magic {
  color: #8aa2ff;
  background: rgb(111 141 255 / 12%);
}
.r-rare {
  color: #f2d24b;
  background: rgb(242 210 75 / 12%);
}
.r-epic {
  color: #b98cff;
  background: rgb(154 92 255 / 14%);
}
.r-legendary {
  color: #ff9a3c;
  background: rgb(240 138 42 / 16%);
}
.r-mythic {
  color: #ff4d4d;
  background: rgb(232 58 58 / 18%);
}
.potion.r-normal {
  color: #e0574b;
}
</style>
