<script setup lang="ts">
import { computed } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import { resolveHover, type CoreHost, type EquipmentSlot, type HoverTarget, type InventoryView } from '../bridge/InventoryView';
import { createPress, DOUBLE_TAP_MS, isFinger } from '../bridge/TouchPress';
import HeroPreview from './HeroPreview.vue';
import ItemCell from './ItemCell.vue';

/**
 * touch：iPad 操作。手指輕點 = 選取（顯示說明與比較）；點兩下 = 快速放到商人的鍛造 / 融合格（App 判斷目前分頁）；
 * 長按 0.5 秒 = 拿起，跟著手指拖到別的格子、裝備欄或商人放下（由 App 處理放下）。
 * 手上已經拿著東西時，輕點照舊是放下。滑鼠操作不受影響。selected：目前選取的位置。
 */
const props = defineProps<{ view: InventoryView; gold: number; shopOpen?: boolean; touch?: boolean; selected?: HoverTarget | null }>();

const press = createPress();
/** 最近一次按下是手指：瀏覽器之後補發的 click 已由輕點 / 長按處理，不再當成滑鼠點擊（放下時 App 送的 click 不是使用者觸發，照常處理） */
let fingerDown = false;
const byFinger = (e: MouseEvent) => fingerDown && e.isTrusted;

function command(target: HoverTarget) {
  if (target.kind === 'cell') gameBridge.send({ type: 'InventoryClick', cell: target.cell });
  else if (target.kind === 'slot') gameBridge.send({ type: 'EquipmentClick', slot: target.slot });
  else gameBridge.send({ type: 'SalvageClick', slot: target.slot });
}

function sameTarget(a: HoverTarget | null | undefined, b: HoverTarget): boolean {
  return a !== null && a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** 上一次輕點（判斷點兩下） */
let lastTap: { target: HoverTarget; time: number } | null = null;

function onPress(e: PointerEvent, target: HoverTarget) {
  fingerDown = props.touch === true && isFinger(e);
  if (!fingerDown) return;
  const el = e.currentTarget as HTMLElement;
  press.down(
    e,
    () => {
      if (props.view.held) return command(target);
      const now = performance.now();
      if (lastTap && sameTarget(lastTap.target, target) && now - lastTap.time < DOUBLE_TAP_MS) {
        lastTap = null;
        emit('quick', target);
        return;
      }
      lastTap = { target, time: now };
      emit('select', target);
    },
    () => {
      if (props.view.held || !resolveHover(props.view, target)) return;
      command(target);
      emit('grab', el);
    },
  );
}

/** 商店開啟時 Ctrl + 點擊 = 賣出；否則拿起 / 放下 */
function clickCell(e: MouseEvent, cell: number) {
  (e.currentTarget as HTMLElement).blur();
  if (byFinger(e)) return;
  if (props.shopOpen && (e.ctrlKey || e.metaKey) && props.view.cells[cell]) gameBridge.send({ type: 'ShopSell', cell });
  else gameBridge.send({ type: 'InventoryClick', cell });
}

/** 右鍵有熔核的裝備：取下最後鑲入的那顆，放進背包（背包滿了才拿在手上） */
function removeCore(from: CoreHost) {
  // 手指長按在部分瀏覽器會觸發右鍵選單：觸控改在說明框點選熔核取下
  if (fingerDown) return;
  gameBridge.send({ type: 'RemoveCore', from });
}

function salvageClick(e: MouseEvent, slot: number) {
  (e.currentTarget as HTMLElement).blur();
  if (byFinger(e)) return;
  gameBridge.send({ type: 'SalvageClick', slot });
}
function salvageAll(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
  const count = props.view.salvage.filter((s) => s !== null).length;
  const rare = props.view.salvage.filter((s) => s && ['epic', 'legendary', 'mythic'].includes(s.rarity)).length;
  const warning = rare > 0 ? `\n\n其中有 ${rare} 件紫色以上的裝備！` : '';
  if (window.confirm(`拆掉拆解區的 ${count} 件裝備？\n預計得到：${props.view.salvagePreview}${warning}\n\n拆掉後無法復原。`)) {
    gameBridge.send({ type: 'SalvageAll' });
  }
}
const salvageCount = computed(() => props.view.salvage.filter((s) => s !== null).length);

function sort(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
  gameBridge.send({ type: 'SortInventory' });
}
const emit = defineEmits<{
  close: [];
  /** 滑鼠所在的背包格 / 裝備欄（null = 離開） */
  hover: [target: HoverTarget | null];
  /** 觸控：選取某一格（顯示說明） */
  select: [target: HoverTarget];
  /** 觸控：長按拿起了某一格的物品（origin = 那一格，放到無效位置時放回去） */
  grab: [origin: HTMLElement];
  /** 觸控：點兩下某一格 */
  quick: [target: HoverTarget];
}>();

/** 觸控時不送滑鼠 hover（手指按下也會觸發 pointerenter） */
function hover(e: PointerEvent, target: HoverTarget | null) {
  if (!isFinger(e)) emit('hover', target);
}
function clickEquip(e: MouseEvent, slot: EquipmentSlot) {
  if (byFinger(e)) return;
  gameBridge.send({ type: 'EquipmentClick', slot });
}

/** 裝備欄排列（紙娃娃式簡化版） */
const LAYOUT: { slot: EquipmentSlot; area: string }[] = [
  { slot: 'helmet', area: 'helmet' },
  { slot: 'amulet', area: 'amulet' },
  { slot: 'weapon', area: 'weapon' },
  { slot: 'shield', area: 'shield' },
  { slot: 'armor', area: 'armor' },
  { slot: 'gloves', area: 'gloves' },
  { slot: 'ring1', area: 'ring1' },
  { slot: 'ring2', area: 'ring2' },
  { slot: 'boots', area: 'boots' },
];

const bySlot = computed(() => new Map(props.view.equipment.map((e) => [e.slot, e])));
</script>

<template>
  <HeroPreview v-if="!touch" />
  <aside
    class="panel"
    :class="{ touch }"
    @pointerdown.stop
    @contextmenu.prevent
    @pointerleave="hover($event, null)"
    @pointermove="press.move"
    @pointerup="press.up"
    @pointercancel="press.cancel"
  >
    <header>
      <span>角色 · 背包</span>
      <button type="button" class="sort" title="依裝備類別、物品等級（高到低）排列，藥水合併放最後" @click="sort">整理</button>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>

    <section class="doll">
      <button
        v-for="{ slot, area } in LAYOUT"
        :key="slot"
        type="button"
        class="equip"
        :class="{ selected: sameTarget(selected, { kind: 'slot', slot }) }"
        :style="{ gridArea: area }"
        :aria-label="bySlot.get(slot)?.label"
        :data-drop="`slot:${slot}`"
        @click="clickEquip($event, slot)"
        @contextmenu.prevent="removeCore({ kind: 'slot', slot })"
        @pointerdown="onPress($event, { kind: 'slot', slot })"
        @pointerenter="hover($event, { kind: 'slot', slot })"
        @pointerleave="hover($event, null)"
      >
        <ItemCell v-if="bySlot.get(slot)?.item" :entry="bySlot.get(slot)!.item" size="slot" />
        <span v-else class="slot-label">{{ bySlot.get(slot)?.label }}</span>
      </button>
    </section>

    <section class="stats">
      <dl>
        <template v-for="s in view.stats" :key="s.label">
          <dt>{{ s.label }}</dt>
          <dd>{{ s.value }}</dd>
        </template>
        <dt>金幣</dt>
        <dd class="gold">{{ gold }}</dd>
        <template v-for="m in view.materials" :key="m.id">
          <dt>{{ m.label }}</dt>
          <dd class="material">{{ m.count }}</dd>
        </template>
      </dl>
    </section>

    <!-- 拆解區：拿著裝備點格子放進去，按「拆掉」換成精華 -->
    <section class="salvage">
      <div class="salvage-head">
        <span>拆解區</span>
        <span class="salvage-preview">{{ view.salvagePreview ? `預計：${view.salvagePreview}` : '武器 → 武器精華；防具與飾品 → 防具精華' }}</span>
        <button type="button" class="salvage-go" :disabled="salvageCount === 0" @click="salvageAll">拆掉</button>
      </div>
      <div class="salvage-grid">
        <button
          v-for="(entry, slot) in view.salvage"
          :key="slot"
          type="button"
          class="cell"
          :class="{ selected: sameTarget(selected, { kind: 'salvage', slot }) }"
          :data-drop="`salvage:${slot}`"
          @click="salvageClick($event, slot)"
          @pointerdown="onPress($event, { kind: 'salvage', slot })"
          @pointerenter="hover($event, { kind: 'salvage', slot })"
          @pointerleave="hover($event, null)"
        >
          <ItemCell :entry="entry" />
        </button>
      </div>
    </section>

    <section>
      <div class="grid" :style="{ gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))` }">
        <button
          v-for="(entry, cell) in view.cells"
          :key="cell"
          type="button"
          class="cell"
          :class="{ selected: sameTarget(selected, { kind: 'cell', cell }) }"
          :data-drop="`cell:${cell}`"
          @click="clickCell($event, cell)"
          @contextmenu.prevent="removeCore({ kind: 'cell', cell })"
          @pointerdown="onPress($event, { kind: 'cell', cell })"
          @pointerenter="hover($event, { kind: 'cell', cell })"
          @pointerleave="hover($event, null)"
        >
          <ItemCell :entry="entry" />
        </button>
      </div>
      <p v-if="touch" class="hint">點一下看內容 · 長按拿起，拖到格子、裝備欄或商人放下 · 商人鍛造 / 融合頁點兩下直接放入</p>
      <p v-else-if="shopOpen" class="hint shop">Ctrl（Mac：⌘）+ 點擊：賣給商人 · 或拿起物品放到商人的「賣出」區</p>
      <p v-else class="hint">點擊拿起 · 再點背包格或裝備欄放下 · 拿著物品點地面可丟棄 · 拿著熔核點有空孔的裝備鑲入，右鍵裝備取下熔核</p>
    </section>
  </aside>
</template>

<style scoped>
.sort {
  margin-left: auto;
  padding: 1px 10px;
  font: 12px/1.6 sans-serif;
  color: #d8cbb4;
  cursor: pointer;
  background: #2a231d;
  border: 1px solid #5a4c3e;
}
.sort:hover {
  border-color: #e8c47a;
}
.hint.shop {
  color: #c8a25a;
}
.panel {
  position: absolute;
  top: 12px;
  right: 12px;
  /* 背包格約 46px（10 欄） */
  width: min(510px, calc(100vw - 32px));
  max-height: calc(100vh - 170px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: #5c5045 #1a1612;
  scrollbar-width: thin;
  pointer-events: auto;
  font: 13px/1.5 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 94%);
  border: 1px solid #5c5045;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #e8c47a;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.close {
  font-size: 18px;
  line-height: 1;
  color: #b8ab94;
  background: none;
  border: 0;
  cursor: pointer;
}
section {
  padding: 10px 12px;
  border-bottom: 1px solid #2a2420;
}
.doll {
  display: grid;
  gap: 6px;
  grid-template-areas:
    '.      helmet helmet amulet'
    'weapon armor  armor  shield'
    'gloves ring1  ring2  boots';
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: 58px 76px 56px;
}
.equip,
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font: inherit;
  color: inherit;
  background: #15120f;
  border: 1px solid #3d342c;
  cursor: pointer;
}
.equip:hover,
.cell:hover {
  border-color: #c8a25a;
}
/* 觸控：選取中的格子 */
.equip.selected,
.cell.selected {
  border-color: #f0e2c0;
  box-shadow: 0 0 0 1px #f0e2c0;
}
/* 觸控：面板高度要放得下整個背包（格子上不能捲動），裝備欄與數值並排 */
.panel.touch {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-content: start;
}
.panel.touch > * {
  grid-column: 1 / -1;
}
.panel.touch > .doll {
  grid-column: 1;
  grid-template-rows: 48px 60px 48px;
  border-right: 1px solid #2a2420;
}
.panel.touch > .stats {
  grid-column: 2;
  padding-left: 8px;
}
.panel.touch .stats dl {
  grid-template-columns: auto 1fr;
  font-size: 11px;
  line-height: 1.35;
}
/* 觸控：格子上不捲動、不跳出系統選單（長按要拿起物品） */
.panel.touch .equip,
.panel.touch .cell {
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.slot-label {
  font-size: 11px;
  color: #5a4e40;
}
.stats dl {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 2px 10px;
  margin: 0;
  font-size: 12px;
}
dt {
  color: #8a7c68;
}
dd {
  margin: 0;
  text-align: right;
  font-family: ui-monospace, Menlo, monospace;
}
.gold {
  color: #e8c47a;
}
.material {
  color: #7ad8ff;
}
.salvage-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}
.salvage-preview {
  flex: 1;
  font-size: 11px;
  color: #7ad8ff;
}
.salvage-go {
  padding: 2px 12px;
  font: inherit;
  color: #ffb08a;
  cursor: pointer;
  background: #2a1a14;
  border: 1px solid #8a3a2a;
}
.salvage-go:disabled {
  cursor: default;
  opacity: 0.4;
}
.salvage-grid {
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(10, minmax(0, 1fr));
}
.grid {
  display: grid;
  gap: 2px;
}
.cell {
  aspect-ratio: 1;
}
.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #6a5e4e;
}
</style>
