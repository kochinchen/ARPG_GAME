<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{
  entry: EntryView;
  /** 顯示在標題上方的小標，例如「目前裝備」 */
  caption?: string;
  /** 商人貨架：購買價格 */
  price?: number;
}>();
</script>

<template>
  <div class="tooltip" :class="[{ equipped: caption }, `t-${entry.rarity}`]">
    <div v-if="caption" class="caption">{{ caption }}</div>
    <div class="name" :class="`r-${entry.rarity}`">{{ entry.name }}</div>
    <div class="slot">{{ entry.slotLabel }}<template v-if="entry.itemLevel > 0"> · 物品等級 {{ entry.itemLevel }} · T{{ entry.tier }}</template></div>
    <ul>
      <li v-for="line in entry.baseLines" :key="`b-${line}`" class="base">{{ line }}</li>
      <li v-if="entry.mainLine" class="main" :class="`r-${entry.rarity}`">{{ entry.mainLine }}</li>
      <li v-for="line in entry.strongLines" :key="`s-${line}`" class="strong" :class="`r-${entry.rarity}`">◆ {{ line }}</li>
      <li v-for="line in entry.affixLines" :key="`a-${line}`" class="affix">{{ line }}</li>
    </ul>
    <div class="price">賣出 {{ entry.sellPrice }} 金幣<template v-if="price !== undefined"> · 購買 {{ price }} 金幣</template></div>
  </div>
</template>

<style scoped>
.tooltip {
  min-width: 170px;
  max-width: 230px;
  padding: 8px 10px;
  font: 12px/1.5 sans-serif;
  color: #d8cbb4;
  text-align: center;
  background: rgb(8 7 6 / 95%);
  border: 1px solid #5c5045;
  box-shadow: 0 4px 16px rgb(0 0 0 / 70%);
}
.price {
  margin-top: 4px;
  font-size: 11px;
  color: #c8a25a;
}
.tooltip.equipped {
  border-color: #3d342c;
  opacity: 0.92;
}
.caption {
  margin-bottom: 4px;
  font-size: 11px;
  color: #8a7c68;
}
.name {
  font-size: 14px;
}
.slot {
  margin-bottom: 4px;
  font-size: 11px;
  color: #6a5e4e;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.base {
  color: #d8cbb4;
}
.affix {
  color: #8aa2ff;
}
.main {
  margin: 2px 0;
  font-weight: bold;
}
.strong {
  font-weight: bold;
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
.r-epic {
  color: #b98cff;
}
.r-legendary {
  color: #ff9a3c;
}
.r-mythic {
  color: #ff4d4d;
}
/* 史詩以上：外框跟著稀有度 */
.tooltip.t-epic {
  border-color: #6a3cb0;
}
.tooltip.t-legendary {
  border-color: #b0621e;
  box-shadow: 0 4px 16px rgb(0 0 0 / 70%), 0 0 12px rgb(240 138 42 / 25%);
}
.tooltip.t-mythic {
  border-color: #b02a2a;
  box-shadow: 0 4px 16px rgb(0 0 0 / 70%), 0 0 14px rgb(232 58 58 / 35%);
}
.name {
  letter-spacing: 0.04em;
}
</style>
