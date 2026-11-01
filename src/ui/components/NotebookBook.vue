<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildBook } from '../../data/book';
import LORE from '../../data/lore.json';
import NOTEBOOK from '../../data/notebook.json';
import SOULS from '../../data/souls.json';

/**
 * 《井誌》：整個遊戲收集到的內容合成一本小書，遊戲暫停。一次一頁，左右翻頁；還沒收集到的頁是「？？？」。
 * 上面是內容，下面是小字頁碼。← → 或按鈕翻頁，Esc（由 App 處理）或點書外面闔上。
 */
const props = defineProps<{ page: number; owned: readonly string[] }>();
const emit = defineEmits<{ close: []; turned: [page: number] }>();

const pages = buildBook({ lore: LORE, notebook: NOTEBOOK, souls: SOULS });
const clamp = (n: number) => Math.min(pages.length - 1, Math.max(0, n));
const index = ref(clamp(props.page - 1));
watch(
  () => props.page,
  (page) => (index.value = clamp(page - 1)),
);
const current = computed(() => pages[index.value]!);
const ownedSet = computed(() => new Set(props.owned));
const found = computed(() => pages.filter((p) => ownedSet.value.has(p.sourceId)).length);
const known = computed(() => ownedSet.value.has(current.value.sourceId));
const label = computed(() => `P.${String(current.value.number).padStart(2, '0')}`);

function turn(step: number) {
  index.value = clamp(index.value + step);
  emit('turned', current.value.number);
}
function onKey(e: KeyboardEvent) {
  if (e.code === 'ArrowLeft') turn(-1);
  else if (e.code === 'ArrowRight') turn(1);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="book-back" role="dialog" aria-label="井誌" @pointerdown.stop="emit('close')">
    <header>
      <div class="name">井誌　{{ found }} / {{ pages.length }} 頁</div>
    </header>
    <div class="book" @pointerdown.stop>
      <button type="button" class="turn" aria-label="上一頁" :disabled="index === 0" @click="turn(-1)">‹</button>
      <Transition name="flip" mode="out-in">
        <article :key="current.id" class="page">
          <div class="content" :class="{ unknown: !known }">
            <template v-if="known">
              <h2 v-if="current.title">{{ current.title }}</h2>
              <p class="en">{{ current.line.en }}</p>
              <p class="zh">{{ current.line.zh }}</p>
              <p v-if="current.speaker" class="speaker">— {{ current.speaker }}</p>
            </template>
            <p v-else class="en">？？？</p>
          </div>
          <footer>{{ label }}</footer>
        </article>
      </Transition>
      <button type="button" class="turn" aria-label="下一頁" :disabled="index === pages.length - 1" @click="turn(1)">›</button>
    </div>
    <p class="hint">← → 翻頁　Esc 或點書外面闔上</p>
  </div>
</template>

<style scoped>
.book-back {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  pointer-events: auto;
  background: rgb(0 0 0 / 68%);
}
header {
  text-align: center;
}
.name {
  font: 700 16px/1.4 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif;
  letter-spacing: 0.14em;
  color: #e8c47a;
}
.book {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}
.page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 112px));
  height: min(520px, calc(100vh - 170px));
  padding: 30px 32px 14px;
  color: #33240f;
  background: linear-gradient(90deg, #a98a52 0%, #d6bf8e 7%, #dcc595 55%, #c9ab72 100%);
  box-shadow:
    0 0 40px rgb(0 0 0 / 80%),
    inset 0 0 30px rgb(70 40 10 / 40%);
}
.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
}
h2 {
  margin: 0 0 16px;
  font: 700 13px/1.4 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif;
  letter-spacing: 0.16em;
  color: #6b4a1e;
}
.speaker {
  margin: 18px 0 0;
  font: 14px/1.4 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif;
  text-align: right;
  color: #6b4a1e;
}
.en {
  margin: 0 0 6px;
  font: 20px/1.4 'IM Fell English', Georgia, 'Times New Roman', serif;
}
.zh {
  margin: 0;
  font: 14px/1.7 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif;
  color: #54401f;
}
.unknown {
  align-items: center;
  justify-content: center;
}
.unknown .en {
  margin: 0;
  letter-spacing: 0.3em;
  color: #8a7248;
}
footer {
  padding-top: 10px;
  font: 12px/1 'IM Fell English', Georgia, 'Times New Roman', serif;
  text-align: center;
  color: #6b5430;
}
.turn {
  flex: none;
  width: 36px;
  height: 64px;
  font: 28px/1 serif;
  color: #e8c47a;
  cursor: pointer;
  background: rgb(26 20 16 / 90%);
  border: 1px solid #5a4632;
}
.turn:not(:disabled):hover {
  border-color: #e8c47a;
}
.turn:disabled {
  cursor: default;
  opacity: 0.3;
}
.hint {
  margin: 0;
  font: 12px sans-serif;
  color: #a39478;
}
.flip-enter-active,
.flip-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.flip-enter-from,
.flip-leave-to {
  opacity: 0;
  transform: scaleX(0.94);
}
</style>
