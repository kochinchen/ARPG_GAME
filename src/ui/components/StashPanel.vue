<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ask } from '../ask';
import { gameBridge } from '../bridge/GameBridge';
import type { HoverTarget, StashView } from '../bridge/InventoryView';
import { createPress, DOUBLE_TAP_MS, isFinger } from '../bridge/TouchPress';
import ItemCell from './ItemCell.vue';

/**
 * 共用倉庫（商人旁邊的華麗寶箱）：5 頁、每頁 30 格，3 個存檔欄位共用；只放裝備與熔核。
 * 滑鼠：點擊拿起 / 放下，Ctrl（Mac：⌘）+ 點擊直接拿回背包。
 * 觸控：和背包一樣，輕點看內容、點兩下直接拿回背包、長按拿起並拖到別處放下（由 App 處理放下）。
 */
const props = defineProps<{ view: StashView; holding: boolean; touch?: boolean; selected?: HoverTarget | null; devAvailable?: boolean }>();
const emit = defineEmits<{
  close: [];
  hover: [target: HoverTarget | null];
  select: [target: HoverTarget];
  grab: [origin: HTMLElement];
  quick: [target: HoverTarget];
  page: [first: number];
}>();

const page = ref(0);
const pageSize = computed(() => props.view.cols * props.view.rows);
const first = computed(() => page.value * pageSize.value);
/** 目前這一頁的格子（cell = 整個倉庫的格子編號） */
const visible = computed(() => props.view.cells.slice(first.value, first.value + pageSize.value).map((entry, i) => ({ entry, cell: first.value + i })));
const pageCounts = computed(() => Array.from({ length: props.view.pages }, (_, p) => props.view.cells.slice(p * pageSize.value, (p + 1) * pageSize.value).filter((c) => c !== null).length));
// 背包 Ctrl + 點擊放進倉庫時，從目前這一頁開始找空格
watch(first, (value) => emit('page', value), { immediate: true });

const press = createPress();
let fingerDown = false;
let lastTap: { cell: number; time: number } | null = null;

function onPress(e: PointerEvent, cell: number) {
  fingerDown = props.touch === true && isFinger(e);
  if (!fingerDown) return;
  const el = e.currentTarget as HTMLElement;
  const target: HoverTarget = { kind: 'stash', cell };
  press.down(
    e,
    () => {
      if (props.holding) return gameBridge.send({ type: 'StashClick', cell });
      const now = performance.now();
      if (lastTap?.cell === cell && now - lastTap.time < DOUBLE_TAP_MS) {
        lastTap = null;
        emit('quick', target);
        return;
      }
      lastTap = { cell, time: now };
      emit('select', target);
    },
    () => {
      if (props.holding || !props.view.cells[cell]) return;
      gameBridge.send({ type: 'StashClick', cell });
      emit('grab', el);
    },
  );
}

function click(e: MouseEvent, cell: number) {
  (e.currentTarget as HTMLElement).blur();
  // 手指按下的動作已由輕點 / 長按處理；手指放開時 App 送的 click 不是使用者觸發，照常處理
  if (fingerDown && e.isTrusted) return;
  if ((e.ctrlKey || e.metaKey) && props.view.cells[cell]) gameBridge.send({ type: 'StashWithdraw', cell });
  else gameBridge.send({ type: 'StashClick', cell });
}

function sortPage(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
  gameBridge.send({ type: 'StashSortPage', page: page.value });
}

function hover(e: PointerEvent, target: HoverTarget | null) {
  if (!isFinger(e)) emit('hover', target);
}

async function clearAll() {
  if (await ask({ title: '清空共用倉庫？', message: '開發用：所有欄位共用的倉庫內容會全部刪除。', confirmLabel: '清空', danger: true })) gameBridge.send({ type: 'DebugClearStash' });
}
</script>

<template>
  <aside class="panel" @pointerdown.stop @contextmenu.prevent @pointerleave="hover($event, null)" @pointermove="press.move" @pointerup="press.up" @pointercancel="press.cancel">
    <header>
      <span>共用倉庫</span>
      <span class="total">{{ view.count }} / {{ view.cells.length }}</span>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>
    <p v-if="view.locked" class="locked">倉庫的存檔無法讀取，暫時不能使用。檔案沒有被覆蓋，可以在選單「匯出倉庫」保留下來。</p>
    <template v-else>
      <nav class="pages">
        <button v-for="(n, p) in pageCounts" :key="p" type="button" :class="{ on: page === p }" :data-drop="`stash-page:${p}`" @click="page = p">
          {{ p + 1 }}<small v-if="n > 0">{{ n }}</small>
        </button>
      </nav>
      <div class="page-tools">
        <span>第 {{ page + 1 }} 頁</span>
        <button type="button" class="sort" title="只整理這一頁：裝備依類別、物品等級（高到低）排列，熔核排在裝備後面" :disabled="pageCounts[page] === 0" @click="sortPage">整理</button>
      </div>
      <div class="grid" :style="{ gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))` }">
        <button
          v-for="{ entry, cell } in visible"
          :key="cell"
          type="button"
          class="cell"
          :class="{ selected: selected?.kind === 'stash' && selected.cell === cell }"
          :data-drop="`stash:${cell}`"
          @click="click($event, cell)"
          @pointerdown="onPress($event, cell)"
          @pointerenter="hover($event, { kind: 'stash', cell })"
          @pointerleave="hover($event, null)"
        >
          <ItemCell :entry="entry" />
        </button>
      </div>
      <p v-if="touch" class="hint">所有存檔欄位共用 · 點一下看內容 · 點兩下拿回背包 · 長按拿起</p>
      <p v-else class="hint">所有存檔欄位共用，只能放裝備與熔核。點擊拿起 / 放下；Ctrl（Mac：⌘）+ 點擊直接存取。</p>
      <button v-if="devAvailable" type="button" class="dev" @click="clearAll">開發用：清空倉庫</button>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  /* 觸控版面：DOM 排在背包後面（視窗較窄時才不會被角色預覽框蓋住），但顯示在左欄 */
  order: -1;
  top: 12px;
  left: 12px;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  pointer-events: auto;
  font: 13px/1.5 sans-serif;
  color: #d8cbb4;
  background: rgb(10 12 20 / 95%);
  border: 1px solid #c09a48;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #9cc8ff;
  background: #141a2a;
  border-bottom: 1px solid #3a4560;
}
.total {
  margin-left: auto;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  color: #e8c47a;
}
.close {
  font-size: 18px;
  line-height: 1;
  color: #b8ab94;
  background: none;
  border: 0;
  cursor: pointer;
}
.pages {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 10px 12px 6px;
}
.pages button {
  position: relative;
  min-height: 30px;
  font: 13px/1 sans-serif;
  color: #b8ab94;
  cursor: pointer;
  background: #171b28;
  border: 1px solid #3a4560;
}
.pages button:hover {
  border-color: #c8a25a;
}
.pages button.on {
  color: #ffe6a0;
  background: #2a2f46;
  border-color: #e8c47a;
}
.pages small {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 9px;
  color: #8a9cc0;
}
.page-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px;
  font-size: 12px;
  color: #8a9cc0;
}
.sort {
  padding: 1px 10px;
  font: 12px/1.6 sans-serif;
  color: #d8cbb4;
  cursor: pointer;
  background: #1c2233;
  border: 1px solid #4a5674;
}
.sort:hover:not(:disabled) {
  border-color: #e8c47a;
}
.sort:disabled {
  cursor: default;
  opacity: 0.4;
}
.grid {
  display: grid;
  gap: 2px;
  padding: 0 12px;
}
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: #12151f;
  border: 1px solid #333c52;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.cell:hover {
  border-color: #c8a25a;
}
.cell.selected {
  border-color: #f0e2c0;
  box-shadow: 0 0 0 1px #f0e2c0;
}
.hint,
.locked {
  margin: 8px 12px 10px;
  font-size: 11px;
  color: #6f7a92;
}
.locked {
  font-size: 13px;
  color: #ff9b8b;
}
.dev {
  margin: 0 12px 10px;
  padding: 2px 10px;
  font: 11px/1.6 sans-serif;
  color: #ffb08a;
  cursor: pointer;
  background: #2a1a14;
  border: 1px solid #8a3a2a;
}
</style>
