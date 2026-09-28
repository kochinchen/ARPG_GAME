<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SlotSummary, TitleState } from '../bridge/TitleView';

/**
 * 標題畫面：繼續遊戲、新遊戲（選欄位）、讀取存檔（選欄位 / 刪除）、離開遊戲。
 * 只負責選擇；實際讀檔、刪除、離開由 main.ts 處理。
 */
const props = defineProps<{ state: TitleState }>();
const emit = defineEmits<{ start: [slot: number, mode: 'new' | 'load', floor?: number | null]; delete: [slot: number]; import: [slot: number, file: File]; quit: [] }>();

type Page = 'main' | 'new' | 'load' | 'import' | 'floor';
const page = ref<Page>('main');
/** 匯入：先選檔案，再選要放進哪個欄位 */
const importFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  importFile.value = file;
  page.value = 'import';
}
function importTo(s: SlotSummary) {
  if (!importFile.value) return;
  if (s.status !== 'empty' && !window.confirm(`欄位 ${s.slot} 已有存檔（${describe(s)}），匯入會覆蓋它。確定嗎？`)) return;
  emit('import', s.slot, importFile.value);
  importFile.value = null;
  page.value = 'load';
}
const heading: Record<Exclude<Page, 'main' | 'floor'>, string> = { new: '新遊戲：選擇存檔欄位', load: '讀取存檔', import: '匯入存檔：選擇要放進的欄位' };
/** 選層：已通關的存檔可以選擇前往的樓層（docs/ENDGAME.md 第 2 節） */
const floorSlot = ref<SlotSummary | null>(null);
const floorBack = ref<Page>('main');
function open(s: SlotSummary) {
  if (s.status !== 'ok') return;
  if (!s.floors?.length) {
    emit('start', s.slot, 'load');
    return;
  }
  floorBack.value = page.value;
  floorSlot.value = s;
  page.value = 'floor';
}
function pick(s: SlotSummary) {
  if (page.value === 'new') startNew(s);
  else if (page.value === 'import') importTo(s);
  else load(s);
}

const continueSlot = computed(() => props.state.slots.find((s) => s.slot === props.state.lastSlot && s.status === 'ok') ?? props.state.slots.find((s) => s.status === 'ok') ?? null);
const hasSave = computed(() => props.state.slots.some((s) => s.status !== 'empty'));

function describe(s: SlotSummary): string {
  if (s.status === 'empty') return '空欄位';
  if (s.status === 'corrupt') return '存檔無法讀取';
  const badge = s.completedHidden ? ' · 已完成隱藏難關' : s.cleared ? ' · 已通關' : '';
  return `Lv ${s.level} · 第 ${s.floor} 層（最深 ${s.highestFloor} 層）${badge}`;
}

function startNew(s: SlotSummary) {
  if (s.status !== 'empty' && !window.confirm(`欄位 ${s.slot} 已有存檔（${describe(s)}）。\n開始新遊戲會刪除這個存檔，無法復原。確定嗎？`)) return;
  emit('start', s.slot, 'new');
}

function load(s: SlotSummary) {
  if (s.status === 'empty') return;
  open(s);
}

function remove(s: SlotSummary) {
  if (!window.confirm(`刪除欄位 ${s.slot} 的存檔（${describe(s)}）？這個動作無法復原。`)) return;
  emit('delete', s.slot);
}
</script>

<template>
  <div class="title-screen" @contextmenu.prevent>
    <div class="glow" />
    <header>
      <h1>ARPG</h1>
      <p class="subtitle">深 淵 地 城</p>
    </header>

    <nav v-if="page === 'main'" class="menu">
      <button v-if="continueSlot" type="button" class="primary" @click="open(continueSlot)">
        繼續遊戲
        <small>欄位 {{ continueSlot.slot }} · {{ describe(continueSlot) }}</small>
      </button>
      <button type="button" @click="page = 'new'">新遊戲</button>
      <button type="button" :disabled="!hasSave" @click="page = 'load'">讀取存檔</button>
      <button type="button" @click="fileInput?.click()">匯入存檔</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
      <button type="button" @click="emit('quit')">離開遊戲</button>
    </nav>

    <section v-else-if="page === 'floor' && floorSlot" class="slots floors">
      <h2>欄位 {{ floorSlot.slot }}：選擇要前往的樓層</h2>
      <p class="hint">{{ describe(floorSlot) }}。選擇樓層會從那一層的樓梯口開始。</p>
      <button type="button" class="continue" @click="emit('start', floorSlot.slot, 'load', null)">繼續（第 {{ floorSlot.floor }} 層，存檔的位置）</button>
      <div class="floor-grid">
        <button
          v-for="f in floorSlot.floors"
          :key="f"
          type="button"
          :class="{ challenge: f > 30, current: f === floorSlot.floor }"
          @click="emit('start', floorSlot.slot, 'load', f)"
        >
          {{ f }}
        </button>
      </div>
      <p v-if="floorSlot.floors!.some((f) => f > 30) && !floorSlot.completedHidden" class="hint">已進入極限挑戰：完成第 35 層的隱藏難關後才能回到 1～30 層。</p>
      <button type="button" class="back" @click="page = floorBack">返回</button>
    </section>

    <section v-else class="slots">
      <h2>{{ heading[page as Exclude<Page, 'main' | 'floor'>] }}</h2>
      <p v-if="page === 'import' && importFile" class="hint">檔案：{{ importFile.name }}</p>
      <div v-for="s in state.slots" :key="s.slot" class="slot" :class="[s.status, { disabled: page === 'load' && s.status === 'empty' }]">
        <button type="button" class="pick" :disabled="page === 'load' && s.status === 'empty'" @click="pick(s)">
          <span class="no">欄位 {{ s.slot }}</span>
          <span class="desc">{{ describe(s) }}</span>
          <span v-if="s.savedAt" class="time">{{ s.savedAt }}</span>
        </button>
        <button v-if="page === 'load' && s.status !== 'empty'" type="button" class="delete" title="刪除這個存檔" @click="remove(s)">刪除</button>
      </div>
      <p v-if="page === 'new' || page === 'import'" class="hint">選擇已有存檔的欄位會覆蓋原本的角色。</p>
      <button type="button" class="back" @click="page = 'main'">返回</button>
    </section>

    <p v-if="state.soundLocked" class="sound-hint">點一下畫面開啟音樂與音效</p>
    <footer>{{ state.version }}</footer>
  </div>
</template>

<style scoped>
.floor-grid {
  display: grid;
  grid-template-columns: repeat(7, 44px);
  gap: 6px;
  justify-content: center;
}
.floor-grid button {
  height: 36px;
  font: 14px/1 sans-serif;
  color: #d8cbb4;
  cursor: pointer;
  background: #1a1410;
  border: 1px solid #4a3c30;
}
.floor-grid button:hover {
  border-color: #c8a25a;
}
.floor-grid button.challenge {
  color: #ff9a7a;
  border-color: #6a2a20;
}
.floor-grid button.current {
  outline: 1px solid #c8a25a;
}
.continue {
  padding: 8px 16px;
  font: inherit;
  color: #f0e2c0;
  cursor: pointer;
  background: #2a1c14;
  border: 1px solid #c8a25a;
}
.title-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 40px;
  font: 15px/1.6 sans-serif;
  color: #d8cbb4;
  pointer-events: auto;
  background: radial-gradient(ellipse at 50% 40%, #2a1c14 0%, #120c09 55%, #070505 100%);
}
.glow {
  position: absolute;
  top: 18%;
  left: 50%;
  width: 520px;
  height: 240px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse, rgb(232 120 50 / 18%), transparent 70%);
  pointer-events: none;
}
header {
  position: relative;
  text-align: center;
}
h1 {
  margin: 0;
  font: 88px/1 serif;
  letter-spacing: 0.25em;
  color: #e8c47a;
  text-shadow:
    0 0 24px rgb(232 150 60 / 45%),
    0 4px 0 #3a2410;
}
.subtitle {
  margin: 10px 0 0;
  font: 20px/1 serif;
  letter-spacing: 0.4em;
  color: #b0876a;
}
.menu {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
}
button {
  font: inherit;
  color: #d8cbb4;
  cursor: pointer;
  background: rgb(26 20 16 / 90%);
  border: 1px solid #5a4632;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
.menu button {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 14px;
  font-size: 17px;
  letter-spacing: 0.15em;
}
.menu button:not(:disabled):hover,
.pick:not(:disabled):hover {
  color: #f0e2c0;
  border-color: #e8c47a;
  background: #2a1f16;
}
.menu button.primary {
  border-color: #c8a25a;
}
.menu small {
  margin-top: 2px;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: #9a8c76;
}
.slots {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(460px, calc(100vw - 32px));
}
h2 {
  margin: 0 0 6px;
  font: 16px/1.4 serif;
  letter-spacing: 0.15em;
  text-align: center;
  color: #e8c47a;
}
.slot {
  display: flex;
  gap: 6px;
}
.pick {
  display: grid;
  flex: 1;
  grid-template-columns: 64px 1fr;
  gap: 2px 10px;
  padding: 10px 14px;
  text-align: left;
}
.no {
  grid-row: span 2;
  align-self: center;
  color: #c8a25a;
}
.slot.empty .desc {
  color: #7a6c58;
}
.slot.corrupt .desc {
  color: #ff7b6b;
}
.time {
  font-size: 12px;
  color: #8a7c68;
}
.delete {
  padding: 0 12px;
  font-size: 13px;
  color: #d08070;
}
.delete:hover {
  border-color: #d06050;
}
.hint {
  margin: 0;
  font-size: 12px;
  text-align: center;
  color: #8a7c68;
}
.back {
  align-self: center;
  padding: 6px 24px;
}
.sound-hint {
  position: absolute;
  left: 16px;
  bottom: 10px;
  margin: 0;
  font-size: 12px;
  color: #8a7c68;
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
footer {
  position: absolute;
  right: 16px;
  bottom: 10px;
  font-size: 11px;
  color: #5a4c3e;
}
</style>
