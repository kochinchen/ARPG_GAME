<script setup lang="ts">
/** 置中的對話框外框（離開樓層確認、選單共用） */
defineProps<{ title: string }>();
</script>

<template>
  <div class="backdrop" @pointerdown.stop @contextmenu.prevent>
    <section class="dialog" role="dialog" :aria-label="title">
      <header>{{ title }}</header>
      <div class="body"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  background: rgb(0 0 0 / 45%);
}
.dialog {
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  font: 13px/1.6 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 97%);
  border: 1px solid #8a6a3a;
  box-shadow: 0 8px 32px rgb(0 0 0 / 70%);
}
header {
  padding: 10px 16px;
  font: 16px/1.4 serif;
  letter-spacing: 0.1em;
  color: #e8c47a;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.body {
  padding: 12px 16px 16px;
}
.body :deep(button) {
  padding: 6px 14px;
  font: inherit;
  color: #d8cbb4;
  cursor: pointer;
  background: #2a231d;
  border: 1px solid #5a4c3e;
}
.body :deep(button:hover) {
  border-color: #e8c47a;
}
.body :deep(button.primary) {
  color: #f2e2b8;
  border-color: #8a6a3a;
}
.body :deep(button.danger) {
  color: #ff9b8b;
}
</style>
