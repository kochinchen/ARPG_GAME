<script setup lang="ts">
import { debugView } from './bridge/DebugView';
</script>

<template>
  <div class="debug">
    <div class="title">ARPG · {{ debugView.milestone }}</div>
    <div>Tick {{ debugView.tick }} · {{ debugView.fps }} FPS</div>
    <div>Player ({{ debugView.player.x.toFixed(2) }}, {{ debugView.player.y.toFixed(2) }})</div>
    <div>Waypoints {{ debugView.waypoints }}</div>
    <div class="hint">左鍵點地面移動 · 按住左鍵持續移動</div>
  </div>
</template>

<style scoped>
.debug {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 8px 12px;
  font: 12px/1.6 ui-monospace, Menlo, monospace;
  color: #d8cbb4;
  background: rgb(0 0 0 / 55%);
  border: 1px solid #3d342c;
}
.title {
  color: #e8c47a;
}
.hint {
  margin-top: 4px;
  color: #8a7c68;
}
</style>
