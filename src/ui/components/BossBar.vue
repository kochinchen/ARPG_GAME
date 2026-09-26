<script setup lang="ts">
import { computed } from 'vue';
import type { GameView } from '../bridge/GameViewStore';

const props = defineProps<{ boss: NonNullable<GameView['boss']> }>();
const pct = computed(() => Math.max(0, Math.min(100, (props.boss.hp / props.boss.max) * 100)));
</script>

<template>
  <div class="boss-bar" role="status">
    <div class="name">
      {{ boss.name }}<span v-if="boss.enraged" class="enraged">狂暴</span>
    </div>
    <div class="bar">
      <div class="fill" :class="{ enraged: boss.enraged }" :style="{ width: `${pct}%` }" />
      <span class="text">{{ Math.ceil(boss.hp) }} / {{ Math.round(boss.max) }}</span>
    </div>
  </div>
</template>

<style scoped>
.boss-bar {
  position: absolute;
  top: 44px;
  left: 50%;
  width: min(460px, calc(100vw - 48px));
  transform: translateX(-50%);
  text-align: center;
}
.name {
  font: 16px/1.4 serif;
  letter-spacing: 0.15em;
  color: #ff9b6b;
  text-shadow: 0 2px 4px #000;
}
.enraged {
  margin-left: 8px;
  padding: 0 6px;
  font: 11px/1.6 sans-serif;
  letter-spacing: 0;
  color: #fff;
  background: #b02a1e;
}
.bar {
  position: relative;
  height: 14px;
  background: rgb(0 0 0 / 75%);
  border: 1px solid #8a3a2a;
}
.fill {
  height: 100%;
  background: linear-gradient(#c0392b, #6e1a12);
  transition: width 0.2s ease-out;
}
.fill.enraged {
  background: linear-gradient(#ff5a3a, #9a2010);
}
.text {
  position: absolute;
  inset: 0;
  font: 10px/14px ui-monospace, Menlo, monospace;
  color: #f0e2c0;
  text-shadow: 0 1px 2px #000;
}
</style>
