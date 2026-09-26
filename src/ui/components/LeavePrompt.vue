<script setup lang="ts">
import { gameBridge } from '../bridge/GameBridge';
import type { LeaveFloorPrompt } from '../bridge/GameViewStore';
import Dialog from './Dialog.vue';

const props = defineProps<{ prompt: LeaveFloorPrompt }>();
const emit = defineEmits<{ close: [] }>();

function leave() {
  gameBridge.send({ type: 'ConfirmLeaveFloor', direction: props.prompt.direction });
  emit('close');
}
</script>

<template>
  <Dialog :title="prompt.direction === 'down' ? `前往第 ${prompt.toFloor} 層？` : `回到第 ${prompt.toFloor} 層？`">
    <p>地上還有 <b class="rare">{{ prompt.valuableItems }} 件稀有以上的物品</b>。離開樓層後，地上的物品會消失。</p>
    <div class="actions">
      <button type="button" class="primary" @click="emit('close')">留下來撿</button>
      <button type="button" class="danger" @click="leave">仍然離開</button>
    </div>
  </Dialog>
</template>

<style scoped>
p {
  margin: 0 0 14px;
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
