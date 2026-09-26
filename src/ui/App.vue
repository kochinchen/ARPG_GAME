<script setup lang="ts">
import { debugView } from './bridge/DebugView';
</script>

<template>
  <div class="debug">
    <div class="title">ARPG · M0 Project Foundation</div>
    <div>Tick {{ debugView.tick }} · {{ debugView.fps }} FPS</div>
    <div>
      Tile
      <template v-if="debugView.hoverTile">({{ debugView.hoverTile.x }}, {{ debugView.hoverTile.y }})</template>
      <template v-else>—</template>
    </div>
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
</style>
