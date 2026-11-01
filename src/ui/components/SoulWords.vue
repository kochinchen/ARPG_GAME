<script setup lang="ts">
import type { SoulLine } from '../bridge/GameViewStore';

/** 魔王倒下時魂魄說的話：畫面下方逐句淡入，不暫停遊戲、不擋操作 */
defineProps<{ line: SoulLine | null }>();
</script>

<template>
  <Transition name="soul">
    <div v-if="line" :key="line.en" class="soul-words" :class="line.smoke" role="status">
      <div class="en">{{ line.en }}</div>
      <div class="zh">{{ line.zh }}</div>
    </div>
  </Transition>
</template>

<style scoped>
.soul-words {
  position: absolute;
  left: 50%;
  bottom: 150px;
  width: min(720px, calc(100vw - 32px));
  text-align: center;
  pointer-events: none;
  transform: translateX(-50%);
  text-shadow: 0 0 8px #000, 0 2px 4px #000;
}
.en {
  font: 24px/1.35 'IM Fell English', Georgia, 'Times New Roman', serif;
  color: #e8edef;
}
.zh {
  margin-top: 4px;
  font: 15px/1.6 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif;
  letter-spacing: 0.06em;
  color: #b6b8b4;
}
.black .en {
  color: #b9a8c9;
}
.grey .en {
  color: #b2b2b2;
}
.gold .en {
  color: #f2d68c;
}
.soul-enter-active,
.soul-leave-active {
  transition: opacity 0.7s ease;
}
.soul-enter-from,
.soul-leave-to {
  opacity: 0;
}
</style>
