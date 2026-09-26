<script setup lang="ts">
import { debugView } from './bridge/DebugView';
</script>

<template>
  <div class="debug">
    <div class="title">ARPG · {{ debugView.milestone }}</div>
    <div>Tick {{ debugView.tick }} · {{ debugView.fps }} FPS</div>
    <div>Player ({{ debugView.player.x.toFixed(2) }}, {{ debugView.player.y.toFixed(2) }})</div>
    <div>Waypoints {{ debugView.waypoints }}</div>
    <div>HP {{ debugView.playerHp }} · 敵人 {{ debugView.enemies }}</div>
    <div>Target {{ debugView.target }}</div>
    <div class="hint">左鍵點地面移動 · 點敵人攻擊一下 · 按住持續攻擊</div>
  </div>
  <div v-if="debugView.respawnIn !== null" class="death">
    <div class="death-title">你倒下了</div>
    <div>{{ Math.ceil(debugView.respawnIn) }} 秒後回到樓梯口</div>
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
.death {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font: 16px/1.6 serif;
  color: #d8cbb4;
  text-shadow: 0 2px 6px #000;
}
.death-title {
  font-size: 34px;
  color: #b02a1e;
  letter-spacing: 0.2em;
}
.hint {
  margin-top: 4px;
  color: #8a7c68;
}
</style>
