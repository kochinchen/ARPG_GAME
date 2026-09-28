<script setup lang="ts">
import { computed, ref } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { ComboKey, SkillCategory, SkillNodeView, SkillTreeView } from '../bridge/SkillTreeView';

const props = defineProps<{ view: SkillTreeView }>();
const emit = defineEmits<{ close: [] }>();

/** 技能分頁或「組合表」 */
const active = ref<SkillCategory | 'codex'>('melee');
const selectedId = ref<string | null>(null);

const category = computed(() => props.view.categories.find((c) => c.category === active.value));
const showCodex = computed(() => active.value === 'codex');
const allNodes = computed(() => props.view.categories.flatMap((c) => c.tiers.flatMap((t) => t.nodes)));
const selected = computed(() => allNodes.value.find((n) => n.id === selectedId.value) ?? null);
/** 已選取、可放進連段 / Support 欄位的技能 */
const placeable = computed(() => (selected.value && selected.value.rank > 0 ? selected.value : null));

const DRAG_TYPE = 'application/x-arpg-skill';

function onDragStart(e: DragEvent, node: SkillNodeView) {
  if (node.rank <= 0 || !e.dataTransfer) return e.preventDefault();
  selectedId.value = node.id;
  e.dataTransfer.setData(DRAG_TYPE, node.id);
  e.dataTransfer.effectAllowed = 'copy';
}

function draggedId(e: DragEvent): string | null {
  return e.dataTransfer?.getData(DRAG_TYPE) || null;
}

function placeCombo(combo: ComboKey, step: 0 | 1 | 2, skillId: string | null) {
  if (skillId === null) return;
  const node = allNodes.value.find((n) => n.id === skillId);
  if (node?.kind !== 'active' || node.rank <= 0) return;
  gameBridge.send({ type: 'SetComboSlot', combo, step, skillId });
}

function placeSupport(slot: 0 | 1 | 2, skillId: string | null) {
  if (skillId === null) return;
  const node = allNodes.value.find((n) => n.id === skillId);
  if (node?.kind !== 'passive' || node.rank <= 0) return;
  gameBridge.send({ type: 'SetSupportSlot', slot, skillId });
}

function toggleSupport(node: SkillNodeView) {
  if (node.equippedSupport) {
    const slot = props.view.supports.findIndex((s) => s?.id === node.id);
    if (slot >= 0) gameBridge.send({ type: 'SetSupportSlot', slot: slot as 0 | 1 | 2, skillId: null });
    return;
  }
  const empty = props.view.supports.findIndex((s) => s === null);
  if (empty >= 0) gameBridge.send({ type: 'SetSupportSlot', slot: empty as 0 | 1 | 2, skillId: node.id });
}

const STEPS = [0, 1, 2] as const;
</script>

<template>
  <aside class="panel" @pointerdown.stop @contextmenu.prevent>
    <header>
      <span>技能</span>
      <span class="summary">
        等級 <b>{{ view.level }}</b> · 技能點 <b class="points">{{ view.skillPoints }}</b>
        <template v-if="view.mastery"> · T4 開通次數 <b class="points">{{ view.t4Charges }}</b></template>
      </span>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>

    <nav class="tabs" role="tablist">
      <button
        v-for="c in view.categories"
        :key="c.category"
        type="button"
        role="tab"
        :aria-selected="c.category === active"
        :class="{ active: c.category === active }"
        @click="active = c.category"
      >
        {{ c.label }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="showCodex"
        :class="{ active: showCodex }"
        @click="active = 'codex'"
      >
        組合表
      </button>
    </nav>

    <section v-if="showCodex" class="codex">
      <p v-if="view.codex.length === 0" class="hint">尚未發現任何組合。在 Q / W / E 放入三個技能，實戰施放成功後就會記錄在這裡。</p>
      <article v-for="entry in view.codex" :key="entry.comboId" class="entry">
        <div class="entry-head">
          <b>{{ entry.name }}</b>
          <small>使用 {{ entry.timesUsed }} 次</small>
        </div>
        <div class="entry-skills">{{ entry.skills.join(' → ') }}</div>
        <ul>
          <li v-for="line in entry.description" :key="line">{{ line }}</li>
        </ul>
      </article>
    </section>

    <div v-if="category" class="body">
      <section class="tree">
        <div v-if="view.mastery" class="t4-status">
          <span class="mastery">已精通：其他類別 T1～T3 開放</span>
          <template v-if="category.t4Open"> · 第四層已開放</template>
          <template v-else>
            · 第四層未開通
            <button
              type="button"
              class="unlock"
              :disabled="!category.canUnlock"
              @click="gameBridge.send({ type: 'UnlockT4', category: category.category })"
            >
              開通
            </button>
          </template>
        </div>

        <div class="routes">
          <span />
          <span v-for="r in category.routes" :key="r">{{ r }}</span>
        </div>
        <div v-for="row in category.tiers" :key="row.tier" class="tier">
          <div class="tier-label">
            <b>T{{ row.tier }}</b>
            <small>Lv {{ row.levelReq }}</small>
          </div>
          <div
            v-for="node in row.nodes"
            :key="node.id"
            class="node"
            :class="{
              learned: node.rank > 0,
              learnable: node.canLearn,
              selected: node.id === selectedId,
              equipped: node.equippedSupport,
            }"
            role="button"
            tabindex="0"
            :draggable="node.rank > 0"
            @click="selectedId = node.id"
            @keydown.enter="selectedId = node.id"
            @dragstart="onDragStart($event, node)"
          >
            <span class="name">{{ node.name }}</span>
            <span class="rank">{{ node.rank }} / {{ node.maxRank }}</span>
            <span class="tags">
              <span v-for="u in node.usedIn" :key="u" class="tag">{{ u }}</span>
              <span v-if="node.equippedSupport" class="tag">裝備中</span>
            </span>
            <button
              v-if="node.kind === 'active' && node.rank > 0"
              type="button"
              class="left-btn"
              :class="{ on: node.isLeft }"
              aria-label="設為左鍵技能"
              @click.stop="gameBridge.send({ type: 'AssignLeft', skillId: node.id })"
            >
              左
            </button>
          </div>
        </div>
      </section>

      <section v-if="selected" class="info">
        <div class="info-head">
          <b>{{ selected.name }}</b>
          <span class="rank">Lv {{ selected.rank }} / {{ selected.maxRank }}</span>
        </div>
        <p class="desc">{{ selected.description }}</p>
        <div class="cols">
          <div>
            <h4>{{ selected.rank > 0 ? '目前' : 'Lv 1' }}</h4>
            <ul>
              <li v-for="l in selected.now" :key="l">{{ l }}</li>
            </ul>
          </div>
          <div v-if="selected.next">
            <h4>下一級</h4>
            <ul class="next">
              <!-- 只有數值改變的行以亮色顯示，一眼看出升級差異 -->
              <li v-for="l in selected.next" :key="l" :class="{ same: selected.now.includes(l) }">{{ l }}</li>
            </ul>
          </div>
        </div>
        <div class="actions">
          <button
            type="button"
            :disabled="!selected.canLearn"
            @click="gameBridge.send({ type: 'LearnSkill', skillId: selected.id })"
          >
            {{ selected.rank > 0 ? '升級（1 點）' : '學習（1 點）' }}
          </button>
          <button v-if="selected.kind === 'passive' && selected.rank > 0" type="button" @click="toggleSupport(selected)">
            {{ selected.equippedSupport ? '卸下' : '裝備' }}
          </button>
          <span v-if="selected.blocked" class="blocked">{{ selected.blocked }}</span>
        </div>
        <p v-if="placeable && placeable.kind === 'active'" class="hint">拖曳技能，或直接點下方連段格子放入</p>
        <p v-if="placeable && placeable.kind === 'passive'" class="hint">拖曳技能，或直接點下方 Support 格子裝備</p>
      </section>

      <section v-if="category.kind === 'active'" class="loadout">
        <div class="left-slot">
          <h3>左鍵 <small>點技能格上的「左」指定</small></h3>
          <span class="slot left-current">{{ view.left?.name ?? '—' }}</span>
        </div>
        <h3>Q / W / E 連段 <small>右鍵依序施放 · 右鍵點格子清空</small></h3>
        <div v-for="combo in view.combos" :key="combo.key" class="combo-block">
          <div class="combo" :class="{ active: combo.active }">
            <span class="key">{{ combo.label }}</span>
            <template v-for="step in STEPS" :key="step">
              <span v-if="step > 0" class="arrow">→</span>
              <button
                v-if="combo.unlocked[step]"
                type="button"
                class="slot"
                :class="{ empty: !combo.steps[step], target: placeable?.kind === 'active' }"
                @click="placeCombo(combo.key, step, placeable?.id ?? null)"
                @contextmenu.prevent="gameBridge.send({ type: 'SetComboSlot', combo: combo.key, step, skillId: null })"
                @dragover.prevent
                @drop.prevent="placeCombo(combo.key, step, draggedId($event))"
              >
                {{ combo.steps[step]?.name ?? '＋' }}
              </button>
              <span v-else class="slot locked">🔒 Lv {{ combo.unlockLevels[step] }}</span>
            </template>
          </div>
          <div class="combo-status" :class="combo.status">
            <template v-if="combo.status === 'known'">
              ✦ {{ combo.name }}<span class="combo-effects"> · {{ combo.description.join('；') }}</span>
            </template>
            <template v-else-if="combo.status === 'unknown'">Combo：???</template>
            <template v-else>—</template>
          </div>
        </div>
      </section>

      <section v-else class="loadout">
        <h3>Support <small>最多 3 個，常駐生效 · 右鍵點格子卸下</small></h3>
        <div class="supports">
          <button
            v-for="(s, i) in view.supports"
            :key="i"
            type="button"
            class="slot"
            :class="{ empty: !s, target: placeable?.kind === 'passive' }"
            @click="placeSupport(i as 0 | 1 | 2, placeable?.id ?? null)"
            @contextmenu.prevent="gameBridge.send({ type: 'SetSupportSlot', slot: i as 0 | 1 | 2, skillId: null })"
            @dragover.prevent
            @drop.prevent="placeSupport(i as 0 | 1 | 2, draggedId($event))"
          >
            {{ s?.name ?? '＋' }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  /* 位置由 App 的左側欄（left-dock）決定：只開技能頁時靠左，與角色頁一起開時排在角色頁右邊 */
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 150px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: #5c5045 #1a1612;
  scrollbar-width: thin;
  pointer-events: auto;
  font: 13px/1.4 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 95%);
  border: 1px solid #5c5045;
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
.summary {
  flex: 1;
  font-size: 12px;
  color: #b8ab94;
}
.points {
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
.tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-bottom: 1px solid #3d342c;
}
.tabs button {
  padding: 7px 0;
  font: inherit;
  color: #8a7c68;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tabs button.active {
  color: #e8c47a;
  border-bottom-color: #c8a25a;
}
section {
  padding: 8px 12px;
  border-bottom: 1px solid #2a2420;
}
.t4-status {
  margin-bottom: 6px;
  font-size: 12px;
  color: #8a7c68;
}
.mastery {
  color: #8aa2ff;
}
.unlock {
  margin-left: 4px;
  padding: 1px 8px;
  font: inherit;
  color: #e8c47a;
  background: #221d19;
  border: 1px solid #c8a25a;
  cursor: pointer;
}
.unlock:disabled {
  color: #5a4e40;
  border-color: #3d342c;
  cursor: default;
}
.routes,
.tier {
  display: grid;
  grid-template-columns: 40px repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.routes {
  margin-bottom: 4px;
  font-size: 11px;
  text-align: center;
  color: #8a7c68;
}
.tier {
  margin-bottom: 6px;
}
.tier-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #8a7c68;
}
.tier-label small {
  font-size: 10px;
}
.node {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 52px;
  padding: 5px 6px;
  background: #15120f;
  border: 1px solid #3d342c;
  cursor: pointer;
  user-select: none;
}
.node.learned {
  border-color: #6e5a3a;
}
.node.learnable {
  border-color: #c8a25a;
  box-shadow: inset 0 0 8px rgb(200 162 90 / 20%);
}
.node.selected {
  outline: 2px solid #e8c47a;
  outline-offset: -1px;
}
.node.equipped {
  background: #1b2030;
}
.name {
  font-size: 12px;
  color: #8a7c68;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.learned .name {
  color: #f0e2c0;
}
.rank {
  font: 11px/1.2 ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.tag {
  padding: 0 3px;
  font-size: 9px;
  color: #0b0a09;
  background: #8a7c68;
}
.left-btn {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 0 5px;
  font: 10px/1.5 sans-serif;
  color: #8a7c68;
  background: #0b0a09;
  border: 1px solid #3d342c;
  cursor: pointer;
}
.left-btn.on {
  color: #0b0a09;
  background: #c8a25a;
  border-color: #c8a25a;
}
.info-head {
  display: flex;
  justify-content: space-between;
  color: #f0e2c0;
}
.desc {
  margin: 4px 0 6px;
  font-size: 12px;
  color: #b8ab94;
}
.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
h4 {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: normal;
  color: #8a7c68;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11px;
}
.next {
  color: #8aa2ff;
}
.next .same {
  color: #5e5648;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.actions button {
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  color: #e8c47a;
  background: #221d19;
  border: 1px solid #c8a25a;
  cursor: pointer;
}
.actions button:disabled {
  color: #5a4e40;
  border-color: #3d342c;
  cursor: default;
}
.blocked {
  font-size: 11px;
  color: #b0776a;
}
.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #6a5e4e;
}
h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: normal;
  color: #8a7c68;
}
small {
  margin-left: 6px;
  color: #6a5e4e;
}
.combo {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 5px;
}
.combo.active .key {
  color: #0b0a09;
  background: #c8a25a;
}
.key {
  width: 22px;
  text-align: center;
  font-weight: bold;
  color: #e8c47a;
  border: 1px solid #5c5045;
}
.arrow {
  color: #5a4e40;
}
.slot {
  flex: 1;
  min-width: 0;
  height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 12px;
  color: #f0e2c0;
  background: #15120f;
  border: 1px solid #5c5045;
  cursor: pointer;
}
.slot.empty {
  color: #5a4e40;
  border-style: dashed;
}
.slot.target {
  border-color: #c8a25a;
  box-shadow: inset 0 0 6px rgb(200 162 90 / 30%);
}
.combo-block {
  margin-bottom: 6px;
}
.left-slot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.left-slot h3 {
  flex-basis: 100%;
}
.left-current {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}
.combo {
  margin-bottom: 2px;
}
.slot.locked {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a4034;
  border-style: dotted;
  cursor: default;
}
.combo-status {
  padding-left: 30px;
  font-size: 11px;
  color: #4a4034;
}
.combo-status.unknown {
  color: #8a7c68;
  letter-spacing: 0.05em;
}
.combo-status.known {
  color: #ffb347;
}
.combo-effects {
  color: #b8ab94;
}
.codex .entry {
  padding: 6px 0;
  border-bottom: 1px solid #2a2420;
}
.entry-head {
  display: flex;
  justify-content: space-between;
  color: #ffb347;
}
.entry-skills {
  font-size: 12px;
  color: #b8ab94;
}
.supports {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
</style>
