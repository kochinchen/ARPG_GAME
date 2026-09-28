<script setup lang="ts">
import { gameBridge } from '../bridge/GameBridge';
import Dialog from './Dialog.vue';

const props = defineProps<{ prompt: { toFloor: number; valuableItems: number } }>();
const emit = defineEmits<{ close: [] }>();

function enter() {
  gameBridge.send({ type: 'ConfirmEnterChallenge' });
  emit('close');
}
</script>

<template>
  <Dialog :title="`進入極限挑戰（第 ${props.prompt.toFloor} 層）？`">
    <p>第 31～35 層是極限挑戰：每層都有魔王與中途小王，第 35 層是隱藏的最終魔王。</p>
    <p class="warn">進入後就<b>回不到第 1～30 層</b>（31～35 層之間可以上下）。完成隱藏難關後才會解除。</p>
    <p v-if="props.prompt.valuableItems > 0">地上還有 <b class="rare">{{ props.prompt.valuableItems }} 件稀有以上的物品</b>，離開後會消失。</p>
    <div class="actions">
      <button type="button" class="primary" @click="emit('close')">留在 1～30 層</button>
      <button type="button" class="danger" @click="enter">進入挑戰</button>
    </div>
  </Dialog>
</template>

<style scoped>
p {
  margin: 0 0 12px;
}
.warn b {
  color: #ff7a6a;
}
.rare {
  color: #f2d24b;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
