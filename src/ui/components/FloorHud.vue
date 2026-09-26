<script setup lang="ts">
import type { GameView } from '../bridge/GameViewStore';

defineProps<{ floor: GameView['floor'] }>();
</script>

<template>
  <div v-if="floor.floor > 0" class="floor-info">
    <b>第 {{ floor.floor }} 層</b>
    · 擊敗 {{ floor.killed }} / {{ floor.total }} ·
    <span v-if="floor.exitOpen" class="exit-open">出口已開啟</span>
    <span v-else>出口：還需 {{ floor.remaining }} 隻</span>
  </div>
</template>

<style scoped>
.floor-info {
  position: absolute;
  top: 12px;
  left: 50%;
  padding: 4px 14px;
  font: 12px/1.6 sans-serif;
  color: #b8ab94;
  white-space: nowrap;
  background: rgb(0 0 0 / 55%);
  border: 1px solid #3d342c;
  transform: translateX(-50%);
}
b {
  color: #e8c47a;
}
.exit-open {
  color: #c8a8ff;
}
</style>
