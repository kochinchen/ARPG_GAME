<script setup lang="ts">
import type { GameView } from '../bridge/GameViewStore';

defineProps<{ dev: GameView['dev'] }>();
</script>

<template>
  <div class="dev">
    <div class="title">DEV · F3 關閉</div>
    <div>Tick {{ dev.tick }} · {{ dev.fps }} FPS</div>
    <div>Player ({{ dev.player.x.toFixed(2) }}, {{ dev.player.y.toFixed(2) }}) · Path {{ dev.waypoints }}</div>
    <div>敵人 {{ dev.enemies }} · Target {{ dev.target }}</div>
    <div class="keys">B 重置 · N 升一級 · M 生成寶箱</div>
  </div>
</template>

<style scoped>
.dev {
  position: absolute;
  top: 48px;
  left: 12px;
  padding: 6px 10px;
  font: 11px/1.6 ui-monospace, Menlo, monospace;
  color: #d8cbb4;
  background: rgb(0 0 0 / 55%);
  border: 1px solid #3d342c;
}
.title {
  color: #6fa8ff;
}
.keys {
  color: #8a7c68;
}
</style>
