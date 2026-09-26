<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{ entry: EntryView | null; size?: 'cell' | 'slot' }>();
</script>

<template>
  <span v-if="entry" class="glyph" :class="[`r-${entry.rarity}`, entry.kind, size ?? 'cell']">
    {{ entry.glyph }}
    <span v-if="entry.kind === 'potion'" class="count">{{ entry.count }}</span>
  </span>
</template>

<style scoped>
.glyph {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font: 14px/1 serif;
  background: rgb(255 255 255 / 4%);
}
.glyph.slot {
  font-size: 18px;
}
.potion {
  color: #e0574b;
  background: rgb(176 42 30 / 18%);
}
.count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font: 9px/1 ui-monospace, Menlo, monospace;
  color: #f0e2c0;
}
.r-normal {
  color: #e8e2d4;
}
.r-magic {
  color: #8aa2ff;
  background: rgb(111 141 255 / 12%);
}
.r-rare {
  color: #f2d24b;
  background: rgb(242 210 75 / 12%);
}
.r-legendary {
  color: #d8843a;
  background: rgb(216 132 58 / 14%);
}
.potion.r-normal {
  color: #e0574b;
}
</style>
