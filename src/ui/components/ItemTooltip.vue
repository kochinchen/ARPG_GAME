<script setup lang="ts">
import type { EntryView } from '../bridge/InventoryView';

defineProps<{
  entry: EntryView;
  /** 顯示在標題上方的小標，例如「目前裝備」 */
  caption?: string;
  /** 商人貨架：購買價格 */
  price?: number;
  /** 觸控：孔位可以點（點 = 看熔核內容，選取後長按 = 取下） */
  socketTouch?: boolean;
  /** 觸控：選取中的孔 */
  selectedSocket?: number | null;
  /** 與目前裝備相比的增減（每件目前裝備一組） */
  diffs?: { caption: string; lines: { text: string; up: boolean }[] }[];
}>();
const emit = defineEmits<{ socketPress: [e: PointerEvent, index: number] }>();
</script>

<template>
  <div class="tooltip" :class="[{ equipped: caption }, `t-${entry.rarity}`]">
    <div v-if="caption" class="caption">{{ caption }}</div>
    <div class="name" :class="`r-${entry.rarity}`">{{ entry.name }}</div>
    <div v-if="entry.legendary" class="role" :class="`r-${entry.rarity}`">{{ entry.legendary.role }}</div>
    <div class="slot">{{ entry.slotLabel }}<template v-if="entry.itemLevel > 0"> · 物品等級 {{ entry.itemLevel }} · T{{ entry.tier }}</template></div>
    <div v-if="entry.skillsLine" class="skills">{{ entry.skillsLine }}</div>
    <ul>
      <li v-for="line in entry.baseLines" :key="`b-${line}`" class="base">{{ line }}</li>
      <li v-if="entry.mainLine" class="main" :class="`r-${entry.rarity}`">{{ entry.mainLine }}</li>
      <template v-if="entry.legendary">
        <li
          v-for="(l, i) in entry.legendary.lines"
          :key="`l-${i}`"
          :class="[l.kind === 'normal' ? 'affix' : l.kind, l.kind === 'normal' ? '' : `r-${entry.rarity}`]"
        >
          {{ l.kind === 'unique' ? '✦ ' : l.kind === 'strong' ? '◆ ' : '' }}{{ l.text }}
        </li>
      </template>
      <template v-else>
        <template v-if="entry.coreSlots">
          <li v-for="s in entry.coreSlots" :key="`c-${s.label}`" class="core-slot">
            <span class="core-label">{{ s.label }}</span>{{ s.texts.join('、') }}
          </li>
          <li v-if="entry.affixLines.length" class="core-sub">副屬性（任何部位）</li>
        </template>
        <li v-for="line in entry.strongLines" :key="`s-${line}`" class="strong" :class="`r-${entry.rarity}`">◆ {{ line }}</li>
        <li v-for="line in entry.affixLines" :key="`a-${line}`" class="affix">{{ line }}</li>
      </template>
      <li v-for="(s, i) in entry.socketLines ?? []" :key="`k-${i}`" class="socket" :class="s.rarity ? `r-${s.rarity}` : 'empty'">{{ s.text }}</li>
    </ul>
    <div v-for="(d, i) in diffs ?? []" :key="`d-${i}`" class="diff">
      <div class="diff-caption">{{ d.caption }}</div>
      <div v-for="l in d.lines" :key="l.text" :class="l.up ? 'up' : 'down'">{{ l.text }}</div>
      <div v-if="d.lines.length === 0" class="same">數值相同</div>
    </div>
    <div v-if="entry.legendary" class="lore">「{{ entry.legendary.lore }}」</div>
    <div v-if="entry.kind === 'core'" class="price">不能賣 · 可以拆解成武器精華</div>
    <div v-else class="price">賣出 {{ entry.sellPrice }} 金幣<template v-if="price !== undefined"> · 購買 {{ price }} 金幣</template></div>
    <div v-if="entry.sockets" class="socket-row" :aria-label="`孔位 ${entry.sockets.length}`">
      <span
        v-for="(s, i) in entry.sockets"
        :key="i"
        class="socket"
        :class="{ empty: !s.name, touchable: socketTouch && s.core, picked: socketTouch && selectedSocket === i }"
        :title="s.name ?? '空孔'"
        @pointerdown="socketTouch && s.core && emit('socketPress', $event, i)"
      >
        <img :src="s.icon" alt="" />
      </span>
    </div>
  </div>
</template>

<style scoped>
/* 孔位列：空孔是空心六角，鑲好的孔是熔核圖示 */
.socket-row {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 8px 0 2px;
  padding-top: 6px;
  border-top: 1px solid #3d342c;
}
.socket-row .socket img {
  display: block;
  width: 34px;
  height: 34px;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 80%));
}
.socket-row .socket.empty img {
  opacity: 0.85;
}
/* 與目前裝備相比 */
.diff {
  margin-top: 6px;
  padding-top: 4px;
  font-size: 11px;
  border-top: 1px solid #3d342c;
}
.diff-caption,
.diff .same {
  color: #8a7c68;
}
.diff .up {
  color: #7fe07f;
}
.diff .down {
  color: #ff7b6b;
}
/* 觸控：可以點的熔核（加大點擊範圍）、選取中的熔核 */
.socket-row .socket.touchable {
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  touch-action: none;
  -webkit-touch-callout: none;
}
.socket-row .socket.touchable img {
  width: 40px;
  height: 40px;
}
.socket-row .socket.picked {
  border-color: #f0e2c0;
  background: rgb(240 226 192 / 10%);
}
li.socket {
  font-size: 11px;
}
li.socket.empty {
  color: #6a5e4e;
}
.core-slot {
  text-align: left;
  font-size: 11px;
}
.core-label {
  display: inline-block;
  min-width: 40px;
  margin-right: 4px;
  color: #a89a7e;
}
.core-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #6a5e4e;
}
.tooltip {
  min-width: 170px;
  max-width: 290px;
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
.skills {
  margin-bottom: 4px;
  font-size: 11px;
  color: #a89a7e;
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
.unique {
  margin: 3px 0;
  text-align: left;
  line-height: 1.45;
}
.role {
  font-size: 11px;
  opacity: 0.85;
}
.lore {
  margin-top: 6px;
  font-size: 11px;
  font-style: italic;
  color: #8a7c68;
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
