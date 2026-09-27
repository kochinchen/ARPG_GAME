<script setup lang="ts">
import { computed } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { EquipmentSlot, HoverTarget, InventoryView } from '../bridge/InventoryView';
import ItemCell from './ItemCell.vue';

const props = defineProps<{ view: InventoryView; gold: number; shopOpen?: boolean }>();

/** 商店開啟時 Ctrl + 點擊 = 賣出；否則拿起 / 放下 */
function clickCell(e: MouseEvent, cell: number) {
  (e.currentTarget as HTMLElement).blur();
  if (props.shopOpen && (e.ctrlKey || e.metaKey) && props.view.cells[cell]) gameBridge.send({ type: 'ShopSell', cell });
  else gameBridge.send({ type: 'InventoryClick', cell });
}

function salvageClick(e: MouseEvent, slot: number) {
  (e.currentTarget as HTMLElement).blur();
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
}>();

/** 裝備欄排列（紙娃娃式簡化版） */
const LAYOUT: { slot: EquipmentSlot; area: string }[] = [
  { slot: 'helmet', area: 'helmet' },
  { slot: 'amulet', area: 'amulet' },
  { slot: 'weapon', area: 'weapon' },
  { slot: 'armor', area: 'armor' },
  { slot: 'gloves', area: 'gloves' },
  { slot: 'ring1', area: 'ring1' },
  { slot: 'ring2', area: 'ring2' },
  { slot: 'boots', area: 'boots' },
];

const bySlot = computed(() => new Map(props.view.equipment.map((e) => [e.slot, e])));
</script>

<template>
  <aside class="panel" @pointerdown.stop @contextmenu.prevent @pointerleave="emit('hover', null)">
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
        :style="{ gridArea: area }"
        :aria-label="bySlot.get(slot)?.label"
        @click="gameBridge.send({ type: 'EquipmentClick', slot })"
        @pointerenter="emit('hover', { kind: 'slot', slot })"
        @pointerleave="emit('hover', null)"
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
          @click="salvageClick($event, slot)"
          @pointerenter="emit('hover', { kind: 'salvage', slot })"
          @pointerleave="emit('hover', null)"
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
          @click="clickCell($event, cell)"
          @pointerenter="emit('hover', { kind: 'cell', cell })"
          @pointerleave="emit('hover', null)"
        >
          <ItemCell :entry="entry" />
        </button>
      </div>
      <p v-if="shopOpen" class="hint shop">Ctrl（Mac：⌘）+ 點擊：賣給商人 · 或拿起物品放到商人的「賣出」區</p>
      <p v-else class="hint">點擊拿起 · 再點背包格或裝備欄放下 · 拿著物品點地面可丟棄</p>
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
  width: min(340px, calc(100vw - 32px));
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
    'weapon armor  armor  .'
    'gloves ring1  ring2  boots';
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: 42px 56px 40px;
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
