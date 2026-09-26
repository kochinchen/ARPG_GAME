<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{
  entry: EntryView;
  /** 顯示在標題上方的小標，例如「目前裝備」 */
  caption?: string;
}>();
</script>

<template>
  <div class="tooltip" :class="{ equipped: caption }">
    <div v-if="caption" class="caption">{{ caption }}</div>
    <div class="name" :class="`r-${entry.rarity}`">{{ entry.name }}</div>
    <div class="slot">{{ entry.slotLabel }}</div>
    <ul>
      <li v-for="line in entry.baseLines" :key="`b-${line}`" class="base">{{ line }}</li>
      <li v-for="line in entry.affixLines" :key="`a-${line}`" class="affix">{{ line }}</li>
    </ul>
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
</style>
