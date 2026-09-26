<script setup lang="ts">
import { debugView } from './bridge/DebugView';
</script>

<template>
  <div class="debug">
    <div class="title">ARPG · {{ debugView.milestone }}</div>
    <div>Tick {{ debugView.tick }} · {{ debugView.fps }} FPS</div>
    <div>Player ({{ debugView.player.x.toFixed(2) }}, {{ debugView.player.y.toFixed(2) }})</div>
    <div>HP {{ debugView.playerHp }} · MP {{ debugView.playerMp }}</div>
    <div>藥水 {{ debugView.potions }} · 敵人 {{ debugView.enemies }}</div>
    <div>Target {{ debugView.target }}</div>
    <div class="hint">左鍵：移動 / 攻擊 · 右鍵：技能 · QWE：切換 · Space：藥水</div>
  </div>

  <div class="skill-bar">
    <div class="slot left">
      <span class="key">左</span>
      <span class="name">{{ debugView.leftSkill }}</span>
    </div>
    <div v-for="slot in debugView.rightSlots" :key="slot.key" class="slot" :class="{ active: slot.active }">
      <span class="key">{{ slot.key }}</span>
      <span class="name">{{ slot.name }}</span>
      <span class="cost">{{ slot.manaCost }} MP</span>
      <span v-if="slot.cooldown > 0" class="cooldown">{{ slot.cooldown.toFixed(1) }}</span>
    </div>
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
.hint {
  margin-top: 4px;
  color: #8a7c68;
}
.skill-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 58px;
  font: 12px/1.3 sans-serif;
  color: #b8ab94;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #3d342c;
}
.slot.left {
  margin-right: 10px;
}
.slot.active {
  color: #f0e2c0;
  border-color: #e8c47a;
  box-shadow: 0 0 8px rgb(232 196 122 / 45%);
}
.key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: #8a7c68;
}
.cost {
  font-size: 10px;
  color: #6fa8ff;
}
.cooldown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #fff;
  background: rgb(0 0 0 / 60%);
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
</style>
