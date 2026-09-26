<script setup lang="ts">
import type { GameView } from '../bridge/GameViewStore';

defineProps<{ view: GameView }>();
</script>

<template>
  <div v-if="view.floorBanner !== null" class="floor-banner" role="status">第 {{ view.floorBanner }} 層</div>

  <div v-if="view.discovery" class="discovery" role="status">
    <div class="discovery-title">COMBO DISCOVERED</div>
    <div class="discovery-name">{{ view.discovery.name }}</div>
    <div v-for="line in view.discovery.description" :key="line" class="discovery-line">{{ line }}</div>
  </div>

  <div v-if="view.saveNotices.length" class="save-notices" role="status">
    <div v-for="n in view.saveNotices" :key="n">{{ n }}</div>
  </div>

  <div v-if="view.respawnIn !== null" class="death">
    <div class="death-title">你倒下了</div>
    <div>{{ Math.ceil(view.respawnIn) }} 秒後回到{{ view.respawnAt }}</div>
  </div>
</template>

<style scoped>
.floor-banner {
  position: absolute;
  top: 30%;
  left: 50%;
  font: 38px/1 serif;
  letter-spacing: 0.3em;
  color: #e8c47a;
  text-shadow: 0 3px 10px #000;
  transform: translateX(-50%);
  animation: fade-in 0.5s ease-out;
}
.discovery {
  position: absolute;
  top: 16%;
  left: 50%;
  padding: 10px 28px;
  text-align: center;
  color: #f0e2c0;
  background: linear-gradient(90deg, transparent, rgb(12 10 9 / 90%) 15%, rgb(12 10 9 / 90%) 85%, transparent);
  text-shadow: 0 2px 6px #000;
  transform: translateX(-50%);
  animation: fade-in 0.35s ease-out;
}
.discovery-title {
  font: 11px/1.4 ui-monospace, Menlo, monospace;
  letter-spacing: 0.35em;
  color: #ffb347;
}
.discovery-name {
  font: 24px/1.4 serif;
  color: #ffd27a;
}
.discovery-line {
  font-size: 12px;
  color: #b8ab94;
}
.save-notices {
  position: absolute;
  top: 56px;
  left: 50%;
  max-width: 520px;
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: #f2e2b8;
  background: rgb(20 14 8 / 85%);
  border: 1px solid #8a6a3a;
  transform: translateX(-50%);
}
.death {
  position: absolute;
  top: 38%;
  left: 50%;
  text-align: center;
  font: 16px/1.6 serif;
  color: #d8cbb4;
  text-shadow: 0 2px 6px #000;
  transform: translate(-50%, -50%);
}
.death-title {
  font-size: 34px;
  color: #b02a1e;
  letter-spacing: 0.2em;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translate(-50%, -8px);
  }
}
</style>
