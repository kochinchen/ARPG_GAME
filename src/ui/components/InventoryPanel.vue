<script setup lang="ts">
import { computed } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { EquipmentSlot, HoverTarget, InventoryView } from '../bridge/InventoryView';
import ItemCell from './ItemCell.vue';

const props = defineProps<{ view: InventoryView; gold: number }>();
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
      </dl>
    </section>

    <section>
      <div class="grid" :style="{ gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))` }">
        <button
          v-for="(entry, cell) in view.cells"
          :key="cell"
          type="button"
          class="cell"
          @click="gameBridge.send({ type: 'InventoryClick', cell })"
          @pointerenter="emit('hover', { kind: 'cell', cell })"
          @pointerleave="emit('hover', null)"
        >
          <ItemCell :entry="entry" />
        </button>
      </div>
      <p class="hint">點擊拿起 · 再點背包格或裝備欄放下 · 拿著物品點地面可丟棄</p>
    </section>
  </aside>
</template>

<style scoped>
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
