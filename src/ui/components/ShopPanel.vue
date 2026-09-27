<script setup lang="ts">
import { ref } from 'vue';
import type { EquipSlot } from '../../data/schema/item';
import { gameBridge } from '../bridge/GameBridge';
import type { EntryView } from '../bridge/InventoryView';
import type { ShopView } from '../bridge/ShopView';
import ItemCell from './ItemCell.vue';
import ItemTooltip from './ItemTooltip.vue';

defineProps<{ view: ShopView }>();
const emit = defineEmits<{ close: [] }>();

const tab = ref<'buy' | 'gamble'>('buy');
const hovered = ref<{ entry: EntryView; price: number; compare: EntryView[]; top: number } | null>(null);

function blur(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
}
function buy(e: MouseEvent, index: number) {
  blur(e);
  gameBridge.send({ type: 'ShopBuy', index });
}
function buyPotion(e: MouseEvent, count: number) {
  blur(e);
  gameBridge.send({ type: 'ShopBuyPotion', count });
}
function gamble(e: MouseEvent, slot: EquipSlot) {
  blur(e);
  gameBridge.send({ type: 'ShopGamble', slot });
}
function sellHeld(e: MouseEvent) {
  blur(e);
  gameBridge.send({ type: 'ShopSellHeld' });
}
function sellNormals(e: MouseEvent, count: number, gold: number) {
  blur(e);
  if (window.confirm(`賣出背包裡 ${count} 件普通（白色）裝備，得到 ${gold} 金幣？`)) gameBridge.send({ type: 'ShopSellNormals' });
}
function hover(e: PointerEvent, entry: EntryView, price: number, compare: EntryView[]) {
  const top = Math.min((e.currentTarget as HTMLElement).getBoundingClientRect().top, window.innerHeight - 300);
  hovered.value = { entry, price, compare, top };
}
</script>

<template>
  <aside class="panel" @pointerdown.stop @contextmenu.prevent>
    <header>
      <span>商人</span>
      <span class="gold">● {{ view.gold }}</span>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>

    <!-- 賣出：拿著物品點這裡，或在背包 Ctrl + 點擊 -->
    <button type="button" class="sell-zone" :class="{ ready: view.heldSellPrice !== null }" :disabled="view.heldSellPrice === null" @click="sellHeld">
      <template v-if="view.heldSellPrice !== null">賣出手上的物品：+{{ view.heldSellPrice }} 金幣</template>
      <template v-else>賣出：從背包拿起物品後點這裡（或 Ctrl + 點擊背包物品）</template>
    </button>
    <button
      v-if="view.normals.count > 0"
      type="button"
      class="sell-normals"
      @click="sellNormals($event, view.normals.count, view.normals.gold)"
    >
      賣出所有普通裝備（{{ view.normals.count }} 件，+{{ view.normals.gold }}）
    </button>

    <nav class="tabs">
      <button type="button" :class="{ on: tab === 'buy' }" @click="tab = 'buy'">購買</button>
      <button type="button" :class="{ on: tab === 'gamble' }" @click="tab = 'gamble'">賭博</button>
    </nav>

    <section v-if="tab === 'buy'" class="list">
      <div class="row potion-row">
        <span class="name">回復藥水</span>
        <span class="price">{{ view.potionPrice }} / 瓶</span>
        <button type="button" :disabled="view.gold < view.potionPrice" @click="buyPotion($event, 1)">買 1</button>
        <button type="button" :disabled="view.gold < view.potionPrice * 5" @click="buyPotion($event, 5)">買 5</button>
      </div>
      <p v-if="view.stock.length === 0" class="empty">貨架已經賣完了（下一層會補貨）</p>
      <div class="stock">
        <button
          v-for="s in view.stock"
          :key="s.index"
          type="button"
          class="card"
          :class="[`r-${s.entry.rarity}`, { poor: !s.affordable }]"
          @click="buy($event, s.index)"
          @pointerenter="hover($event, s.entry, s.price, s.compare)"
          @pointerleave="hovered = null"
        >
          <span class="icon"><ItemCell :entry="s.entry" size="slot" /></span>
          <span class="card-name" :class="`t-${s.entry.rarity}`">{{ s.entry.name }}</span>
          <span class="card-price">● {{ s.price }}</span>
        </button>
      </div>
      <p class="note">點擊購買 · 滑鼠移上可與目前裝備比較</p>
    </section>

    <section v-else class="list">
      <p class="note">選一種裝備，付 {{ view.gamblePrice }} 金幣換一件隨機物品：可能是普通、魔法或稀有。</p>
      <div class="gamble-grid">
        <button
          v-for="g in view.gambleSlots"
          :key="g.slot"
          type="button"
          class="gamble"
          :disabled="view.gold < view.gamblePrice"
          @click="gamble($event, g.slot)"
        >
          <span class="gamble-glyph">{{ g.glyph }}</span>
          <span>{{ g.label }}</span>
        </button>
      </div>
      <p class="odds">普通 15% · 魔法 60% · 稀有 25%</p>
    </section>

    <div v-if="hovered" class="tooltip-anchor" :style="{ top: `${hovered.top}px` }">
      <ItemTooltip :entry="hovered.entry" :price="hovered.price" />
      <ItemTooltip v-for="(c, i) in hovered.compare" :key="i" :entry="c" caption="目前裝備" />
    </div>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  left: 12px;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  pointer-events: auto;
  font: 13px/1.5 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 95%);
  border: 1px solid #8a6a3a;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #e8c47a;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.gold {
  margin-left: auto;
  font-family: ui-monospace, Menlo, monospace;
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
button {
  font: inherit;
  color: #d8cbb4;
  cursor: pointer;
  background: #2a231d;
  border: 1px solid #5a4c3e;
}
button:hover:not(:disabled) {
  border-color: #e8c47a;
}
button:disabled {
  cursor: default;
  opacity: 0.45;
}
.sell-zone {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px 4px;
  padding: 10px 8px;
  font-size: 12px;
  color: #8a7c68;
  border-style: dashed;
}
.sell-zone.ready {
  color: #f2e2b8;
  border-color: #c8a25a;
  background: #3a2c18;
}
.sell-normals {
  display: block;
  width: calc(100% - 24px);
  margin: 0 12px 6px;
  padding: 4px;
  font-size: 12px;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 6px 12px 0;
  border-bottom: 1px solid #3d342c;
}
.tabs button {
  padding: 3px 14px;
  border-bottom: 0;
}
.tabs button.on {
  color: #f2e2b8;
  border-color: #c8a25a;
  background: #3a2c18;
}
.list {
  padding: 8px 12px 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  margin-bottom: 4px;
  text-align: left;
}
.potion-row {
  background: transparent;
  border: 0;
}
.potion-row button {
  padding: 1px 8px;
}
.name {
  flex: 1;
}
.price {
  font-family: ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.r-normal {
  color: #e8e2d4;
}
.r-magic {
  color: #8aa2ff;
}
.r-rare {
  color: #f2d24b;
}
.r-legendary {
  color: #d8843a;
}
.note,
.empty {
  margin: 0 0 8px;
  font-size: 12px;
  color: #8a7c68;
}
.gamble-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.gamble-grid button {
  padding: 8px 0;
}
.tooltip-anchor {
  position: fixed;
  left: min(340px, calc(100vw - 480px));
  display: flex;
  gap: 6px;
  align-items: flex-start;
  pointer-events: none;
}
.stock {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 6px;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  background: #1c1713;
}
.card .icon {
  width: 38px;
  height: 38px;
}
.card.r-magic {
  border-color: #3e56b0;
}
.card.r-rare {
  border-color: #a8902a;
}
.card.r-legendary {
  border-color: #a8602a;
}
.card-name {
  font-size: 11px;
  line-height: 1.3;
  text-align: center;
}
.card-price {
  font: 12px/1 ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.card.poor .card-price {
  color: #b85a4a;
}
.t-normal {
  color: #e8e2d4;
}
.t-magic {
  color: #8aa2ff;
}
.t-rare {
  color: #f2d24b;
}
.t-legendary {
  color: #d8843a;
}
.gamble {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.gamble-glyph {
  font: 20px/1.2 serif;
  color: #c8a25a;
}
.odds {
  margin: 8px 0 0;
  font-size: 11px;
  color: #8a7c68;
  text-align: center;
}
</style>
