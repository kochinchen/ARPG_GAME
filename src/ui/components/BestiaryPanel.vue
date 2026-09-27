<script setup lang="ts">
import { computed, ref } from 'vue';
import { bestiaryBridge, FAMILY_LABELS, type BestiaryEntry } from '../bridge/BestiaryView';

/**
 * 怪物圖鑑：分類列出所有怪物。玩家只看得到擊敗過的（其他顯示剪影與「？？？」）；
 * 開發版可以切換「顯示全部」。右側顯示介紹、技能、階段與各樓層的數值。
 */
const props = defineProps<{ kills: Record<string, number>; devAvailable: boolean }>();
const emit = defineEmits<{ close: []; items: [] }>();

const entries = bestiaryBridge.entries;
const showAll = ref(props.devAvailable);
const known = (e: BestiaryEntry) => showAll.value || (props.kills[e.id] ?? 0) > 0;
const collected = computed(() => entries.filter((e) => (props.kills[e.id] ?? 0) > 0).length);

const groups = computed(() =>
  (Object.keys(FAMILY_LABELS) as (keyof typeof FAMILY_LABELS)[])
    .map((family) => ({ family, label: FAMILY_LABELS[family], entries: entries.filter((e) => e.family === family) }))
    .filter((g) => g.entries.length > 0),
);

const selectedId = ref(entries.find((e) => known(e))?.id ?? entries[0]?.id ?? '');
const selected = computed(() => entries.find((e) => e.id === selectedId.value) ?? null);
const floor = ref(selected.value?.firstFloor ?? 1);
function select(e: BestiaryEntry) {
  selectedId.value = e.id;
  floor.value = e.firstFloor;
}

/** 各樓層的數值：第一次出現的樓層起，每 5 層一列 */
const table = computed(() => {
  const e = selected.value;
  if (!e) return [];
  const floors = [0, 5, 10, 15, 20].map((d) => e.firstFloor + d);
  return floors.map((f) => ({ floor: f, ...bestiaryBridge.statsAt(e, f) }));
});
const custom = computed(() => (selected.value ? bestiaryBridge.statsAt(selected.value, floor.value) : null));
const portrait = (id: string) => bestiaryBridge.portrait(id);
</script>

<template>
  <div class="backdrop" @pointerdown.stop @contextmenu.prevent>
    <section class="bestiary" role="dialog" aria-label="怪物圖鑑">
      <header>
        <span class="title">怪物圖鑑</span>
        <button type="button" class="book" @click="emit('items')">裝備圖鑑</button>
        <span class="progress">已擊敗 {{ collected }} / {{ entries.length }} 種</span>
        <span class="spacer" />
        <label v-if="devAvailable" class="dev"><input v-model="showAll" type="checkbox" /> 顯示全部（開發）</label>
        <button type="button" class="close" title="關閉（Esc）" @click="emit('close')">×</button>
      </header>

      <div class="columns">
        <nav class="list">
          <template v-for="g in groups" :key="g.family">
            <h4>{{ g.label }}</h4>
            <button
              v-for="e in g.entries"
              :key="e.id"
              type="button"
              class="item"
              :class="{ on: e.id === selectedId, locked: !known(e), boss: e.boss }"
              @click="select(e)"
            >
              <img :src="portrait(e.id)" alt="" />
              <span class="name">{{ known(e) ? e.name : '？？？' }}</span>
              <span v-if="(kills[e.id] ?? 0) > 0" class="kills">×{{ kills[e.id] }}</span>
            </button>
          </template>
        </nav>

        <article v-if="selected && known(selected)" class="detail">
          <div class="top">
            <img class="portrait" :src="portrait(selected.id)" alt="" />
            <div>
              <h2 :class="{ boss: selected.boss }">{{ selected.name }}</h2>
              <p class="tags">{{ FAMILY_LABELS[selected.family] }} · {{ selected.style }} · {{ selected.appears }}</p>
              <p class="lore">{{ selected.lore }}</p>
              <p class="meta">
                體型：{{ selected.size }}<br />
                移動速度 {{ selected.moveSpeed }} · 攻擊速度 {{ selected.attackSpeed }} / 秒 · 已擊敗 {{ kills[selected.id] ?? 0 }} 次
              </p>
            </div>
          </div>

          <h3>各樓層數值（一般體型、非精英）</h3>
          <table>
            <thead>
              <tr><th>樓層</th><th>HP</th><th>傷害</th><th>防禦</th><th>經驗</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in table" :key="row.floor">
                <th>{{ row.floor }}F</th>
                <td>{{ row.hp }}</td>
                <td>{{ row.damage[0] }}～{{ row.damage[1] }}</td>
                <td>{{ row.defense }}</td>
                <td>{{ row.xp }}</td>
              </tr>
              <tr v-if="custom" class="custom">
                <th><input v-model.number="floor" type="number" min="1" max="99" />F</th>
                <td>{{ custom.hp }}</td>
                <td>{{ custom.damage[0] }}～{{ custom.damage[1] }}</td>
                <td>{{ custom.defense }}</td>
                <td>{{ custom.xp }}</td>
              </tr>
            </tbody>
          </table>
          <p class="hint">精英怪：HP ×3、傷害 ×1.3、經驗 ×3。召喚物不給經驗、不掉寶。</p>

          <template v-if="selected.phases.length > 0">
            <h3>階段變化</h3>
            <ul class="phases">
              <li v-for="(p, i) in selected.phases" :key="i">HP {{ Math.round(p.hpBelow * 100) }}% 以下：第 {{ i + 2 }} 階段「{{ p.label }}」</li>
            </ul>
          </template>

          <template v-if="selected.skills.length > 0">
            <h3>技能</h3>
            <dl class="skills">
              <template v-for="s in selected.skills" :key="s.name + s.description">
                <dt>{{ s.name }}</dt>
                <dd>{{ s.description }}</dd>
              </template>
            </dl>
          </template>
        </article>

        <article v-else class="detail empty">
          <img v-if="selected" class="portrait locked" :src="portrait(selected.id)" alt="" />
          <p>尚未擊敗這種怪物。</p>
          <p class="hint">擊敗一次後，就能在圖鑑中查看牠的介紹、技能與數值。</p>
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
.bestiary {
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
  gap: 16px;
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
.book {
  padding: 3px 10px;
  font: inherit;
  color: #b8ab94;
  cursor: pointer;
  background: #1f1a15;
  border: 1px solid #3d342c;
}
.progress {
  color: #9a8c76;
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
  font: 18px/1 sans-serif;
  color: #d8cbb4;
  cursor: pointer;
  background: none;
  border: 1px solid #5a4c3e;
}
.columns {
  display: flex;
  flex: 1;
  min-height: 0;
}
.list,
.detail {
  scrollbar-color: #5a4c3e #120f0d;
}
.list {
  flex: 0 0 240px;
  overflow-y: auto;
  padding: 6px 8px 12px;
  border-right: 1px solid #3d342c;
}
h4 {
  margin: 10px 4px 4px;
  font: 12px/1.4 sans-serif;
  letter-spacing: 0.08em;
  color: #c8a25a;
}
.item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 2px 6px;
  font: inherit;
  color: #d8cbb4;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 1px solid transparent;
}
.item:hover {
  border-color: #5a4c3e;
}
.item.on {
  background: #2a231d;
  border-color: #e8c47a;
}
.item img {
  width: 34px;
  height: 34px;
}
.item.locked img,
.portrait.locked {
  filter: brightness(0) opacity(0.55);
}
.item.locked .name {
  color: #6a5e50;
}
.item.boss .name {
  color: #ff9b6b;
}
.kills {
  margin-left: auto;
  font: 11px ui-monospace, Menlo, monospace;
  color: #8a7c66;
}
.detail {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px 20px;
}
.detail.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9a8c76;
}
.top {
  display: flex;
  gap: 16px;
}
.portrait {
  flex: 0 0 160px;
  width: 160px;
  height: 160px;
  background: radial-gradient(circle at 50% 60%, #2a2219, #0c0a09 70%);
  border: 1px solid #3d342c;
}
h2 {
  margin: 0;
  font: 22px/1.3 serif;
  letter-spacing: 0.1em;
  color: #f0e2c0;
}
h2.boss {
  color: #ff9b6b;
}
.tags {
  margin: 2px 0 6px;
  color: #c8a25a;
}
.lore {
  margin: 0 0 6px;
}
.meta {
  margin: 0;
  font-size: 12px;
  color: #9a8c76;
}
h3 {
  margin: 16px 0 6px;
  font: 14px/1.4 serif;
  letter-spacing: 0.08em;
  color: #e8c47a;
}
table {
  width: 100%;
  border-collapse: collapse;
  font: 12px/1.8 ui-monospace, Menlo, monospace;
}
th,
td {
  padding: 0 8px;
  text-align: right;
  border-bottom: 1px solid #2a231d;
}
thead th {
  color: #9a8c76;
  font-family: sans-serif;
}
tbody th {
  color: #c8a25a;
}
tr.custom th input {
  width: 44px;
  font: inherit;
  color: #f0e2c0;
  text-align: right;
  background: #2a231d;
  border: 1px solid #5a4c3e;
}
.hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #8a7c66;
}
.phases {
  margin: 0;
  padding-left: 18px;
}
.skills {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0;
}
dt {
  color: #f0e2c0;
}
dd {
  margin: 0;
  color: #b8ab94;
}
</style>
