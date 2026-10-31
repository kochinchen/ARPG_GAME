<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { answer, askState } from '../askState';
import Dialog from './Dialog.vue';

const confirmButton = ref<HTMLButtonElement | null>(null);
watch(
  () => askState.current,
  (current) => {
    if (current) void nextTick(() => confirmButton.value?.focus());
  },
);

/** 問答框開著時吃掉所有按鍵：Enter 確定、Esc 取消，其他按鍵不會傳到遊戲（技能、面板快捷鍵） */
function onKeyDown(e: KeyboardEvent) {
  const current = askState.current;
  if (!current) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape') {
    e.preventDefault();
    answer(current.cancelLabel === null);
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    answer(true);
  } else if (e.code !== 'Tab' && e.code !== 'Space') e.preventDefault();
}
// capture：比遊戲與 App 的 keydown 先收到
onMounted(() => window.addEventListener('keydown', onKeyDown, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown, true));
</script>

<template>
  <Dialog v-if="askState.current" :title="askState.current.title">
    <p v-if="askState.current.message">{{ askState.current.message }}</p>
    <div class="actions">
      <button v-if="askState.current.cancelLabel !== null" type="button" @click="answer(false)">{{ askState.current.cancelLabel }}</button>
      <button ref="confirmButton" type="button" :class="askState.current.danger ? 'danger' : 'primary'" @click="answer(true)">
        {{ askState.current.confirmLabel }}
      </button>
    </div>
  </Dialog>
</template>

<style scoped>
p {
  margin: 0 0 14px;
  white-space: pre-line;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
