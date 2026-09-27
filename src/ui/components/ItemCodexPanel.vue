<script setup lang="ts">
import { computed, ref } from 'vue';
import { itemCodexBridge, KIND_LABELS, KIND_ORDER, type UniqueCodexEntry } from '../bridge/ItemCodexView';

/**
 * 裝備圖鑑：白色基底（藍黃紫由基底隨機產生，所以只列基底）、橘裝、紅裝。
 * 玩家只看得到拿到過的（其他顯示「？？？」）；開發版可以切換「顯示全部」。
 */
const props = defineProps<{ collection: readonly string[]; devAvailable: boolean }>();
const emit = defineEmits<{ close: []; monsters: [] }>();

type Tab = 'base' | 'legendary' | 'mythic';
const tab = ref<Tab>('base');
const showAll = ref(props.devAvailable);
const owned = computed(() => new Set(props.collection));
const known = (key: string) => showAll.value || owned.value.has(key);

const bases = itemCodexBridge.bases;
const uniques = computed(() => itemCodexBridge.uniques.filter((u) => u.rarity === tab.value));
const baseGroups = computed(() => KIND_ORDER.map((kind) => ({ kind, label: KIND_LABELS[kind], entries: bases.filter((b) => b.kind === kind) })).filter((g) => g.entries.length > 0));
const uniqueGroups = computed(() =>
  KIND_ORDER.map((kind) => ({ kind, label: KIND_LABELS[kind], entries: uniques.value.filter((u) => u.kind === kind) })).filter((g) => g.entries.length > 0),
);

const count = (keys: readonly { key: string }[]) => keys.filter((k) => owned.value.has(k.key)).length;
const progress = computed(() => ({
  base: `${count(bases)} / ${bases.length}`,
  legendary: `${count(itemCodexBridge.uniques.filter((u) => u.rarity === 'legendary'))} / ${itemCodexBridge.uniques.filter((u) => u.rarity === 'legendary').length}`,
  mythic: `${count(itemCodexBridge.uniques.filter((u) => u.rarity === 'mythic'))} / ${itemCodexBridge.uniques.filter((u) => u.rarity === 'mythic').length}`,
}));

const selectedId = ref<string | null>(null);
const selected = computed<UniqueCodexEntry | null>(() => uniques.value.find((u) => u.id === selectedId.value) ?? uniques.value.find((u) => known(u.key)) ?? uniques.value[0] ?? null);
function switchTab(t: Tab) {
  tab.value = t;
  selectedId.value = null;
}
</script>

<template>
  <div class="backdrop" @pointerdown.stop @contextmenu.prevent>
    <section class="codex" role="dialog" aria-label="裝備圖鑑">
      <header>
        <button type="button" class="book" @click="emit('monsters')">怪物圖鑑</button>
        <span class="title">裝備圖鑑</span>
        <nav class="tabs">
          <button type="button" :class="{ on: tab === 'base' }" @click="switchTab('base')">白色基底 <small>{{ progress.base }}</small></button>
          <button type="button" class="r-legendary" :class="{ on: tab === 'legendary' }" @click="switchTab('legendary')">
            橘・傳奇 <small>{{ progress.legendary }}</small>
          </button>
          <button type="button" class="r-mythic" :class="{ on: tab === 'mythic' }" @click="switchTab('mythic')">紅・神話 <small>{{ progress.mythic }}</small></button>
        </nav>
        <span class="spacer" />
        <label v-if="devAvailable" class="dev"><input v-model="showAll" type="checkbox" /> 顯示全部（開發）</label>
        <button type="button" class="close" title="關閉（Esc）" @click="emit('close')">×</button>
      </header>

      <!-- 白色基底：依種類分組的表格 -->
      <div v-if="tab === 'base'" class="bases">
        <p class="hint">藍、黃、紫裝由這些基底隨機產生（主倍率、詞綴、名稱）；橘、紅裝使用該種類中目前等級能用的最高階基底。</p>
        <section v-for="g in baseGroups" :key="g.kind" class="group">
          <h4>{{ g.label }}</h4>
          <table>
            <tbody>
              <tr v-for="b in g.entries" :key="b.id" :class="{ locked: !known(b.key) }">
                <td class="glyph">{{ b.glyph }}</td>
                <td class="name">{{ known(b.key) ? b.name : '？？？' }}</td>
                <td class="req">Lv {{ b.levelReq }}</td>
                <td class="stats">{{ known(b.key) ? b.lines.join('、') || '（無基礎屬性，詞綴決定）' : '尚未取得' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <!-- 橘 / 紅：左側清單、右側詳細 -->
      <div v-else class="columns">
        <nav class="list">
          <template v-for="g in uniqueGroups" :key="g.kind">
            <h4>{{ g.label }}</h4>
            <button
              v-for="u in g.entries"
              :key="u.id"
              type="button"
              class="item"
              :class="[{ on: selected?.id === u.id, locked: !known(u.key) }, `r-${u.rarity}`]"
              @click="selectedId = u.id"
            >
              <span class="glyph">{{ u.glyph }}</span>
              <span class="name">{{ known(u.key) ? u.name : '？？？' }}</span>
              <span v-if="owned.has(u.key)" class="got">✔</span>
            </button>
          </template>
        </nav>
        <article v-if="selected && known(selected.key)" class="detail" :class="`t-${selected.rarity}`">
          <h2 :class="`r-${selected.rarity}`">{{ selected.name }}</h2>
          <p class="sub">
            {{ selected.rarity === 'legendary' ? '傳奇' : '神話' }} {{ KIND_LABELS[selected.kind] }} · {{ selected.role }} · 第 {{ selected.minItemLevel }} 層起
          </p>
          <ul>
            <li v-if="selected.main" class="main" :class="`r-${selected.rarity}`">{{ selected.main }}</li>
            <li v-for="(l, i) in selected.lines" :key="i" :class="[l.kind, l.kind === 'normal' ? '' : `r-${selected.rarity}`]">
              {{ l.kind === 'unique' ? '✦ ' : l.kind === 'strong' ? '◆ ' : '' }}{{ l.text }}
            </li>
          </ul>
          <p class="lore">「{{ selected.lore }}」</p>
          <p class="hint">固定屬性為第 1～9 層（T1）的範圍，每 10 層提高一個階級；特殊效果的數值固定。</p>
        </article>
        <article v-else class="detail empty">
          <p>尚未取得這件裝備。</p>
          <p class="hint">拿到一次後，就能在圖鑑中查看它的屬性與特殊效果。</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  background: rgb(0 0 0 / 55%);
}
.codex {
  display: flex;
  flex-direction: column;
  width: min(980px, calc(100vw - 24px));
  height: min(720px, calc(100vh - 24px));
  font: 13px/1.6 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 97%);
  border: 1px solid #8a6a3a;
  box-shadow: 0 8px 32px rgb(0 0 0 / 70%);
}
header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px 8px 16px;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.title {
  font: 17px/1.4 serif;
  letter-spacing: 0.12em;
  color: #e8c47a;
}
.tabs {
  display: flex;
  gap: 4px;
}
button {
  font: inherit;
  color: #b8ab94;
  cursor: pointer;
  background: #1f1a15;
  border: 1px solid #3d342c;
}
.tabs button,
.book {
  padding: 3px 10px;
}
.tabs button.on {
  color: #f0e2c0;
  border-color: #e8c47a;
}
.tabs small {
  margin-left: 4px;
  color: #8a7c66;
}
.spacer {
  flex: 1;
}
.dev {
  font-size: 12px;
  color: #9a8c76;
}
.close {
  width: 28px;
  height: 28px;
  font-size: 18px;
}
.bases,
.list,
.detail {
  overflow-y: auto;
  scrollbar-color: #5a4c3e #120f0d;
}
.bases {
  flex: 1;
  padding: 8px 16px 16px;
}
.group h4,
.list h4 {
  margin: 10px 0 4px;
  font: 12px/1.4 sans-serif;
  letter-spacing: 0.08em;
  color: #c8a25a;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 2px 8px;
  border-bottom: 1px solid #221c17;
}
td.glyph {
  width: 24px;
  font-family: serif;
  text-align: center;
  color: #e8e2d4;
  background: rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 1px #6a6258;
}
td.name {
  width: 120px;
  color: #e8e2d4;
}
td.req {
  width: 56px;
  font: 12px ui-monospace, Menlo, monospace;
  color: #9a8c76;
}
td.stats {
  color: #b8ab94;
}
tr.locked td {
  color: #5a5046;
}
.columns {
  display: flex;
  flex: 1;
  min-height: 0;
}
.list {
  flex: 0 0 230px;
  padding: 4px 8px 12px;
  border-right: 1px solid #3d342c;
}
.item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 3px 6px;
  text-align: left;
  background: none;
  border-color: transparent;
}
.item.on {
  background: #2a231d;
  border-color: #e8c47a;
}
.item .glyph {
  width: 22px;
  height: 22px;
  font: 13px/22px serif;
  text-align: center;
  background: rgb(255 255 255 / 4%);
}
.item.r-legendary .glyph {
  color: #ff9a3c;
  box-shadow: inset 0 0 0 1px #f08a2a;
}
.item.r-mythic .glyph {
  color: #ff4d4d;
  box-shadow: inset 0 0 0 1px #e83a3a;
}
.item.r-legendary .name {
  color: #ff9a3c;
}
.item.r-mythic .name {
  color: #ff4d4d;
}
.item.locked .name {
  color: #5a5046;
}
.got {
  margin-left: auto;
  font-size: 11px;
  color: #7fe07f;
}
.detail {
  flex: 1;
  padding: 14px 22px 20px;
}
.detail.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9a8c76;
}
h2 {
  margin: 0;
  font: 24px/1.3 serif;
  letter-spacing: 0.12em;
}
.sub {
  margin: 2px 0 10px;
  color: #9a8c76;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  padding: 2px 0;
}
li.normal {
  color: #8aa2ff;
}
li.main,
li.strong {
  font-weight: bold;
}
li.unique {
  margin: 4px 0;
  line-height: 1.5;
}
.lore {
  margin: 12px 0 4px;
  font-style: italic;
  color: #8a7c68;
}
.hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #8a7c66;
}
.r-legendary {
  color: #ff9a3c;
}
.r-mythic {
  color: #ff4d4d;
}
.tabs button.r-legendary {
  color: #ff9a3c;
}
.tabs button.r-mythic {
  color: #ff4d4d;
}
</style>
