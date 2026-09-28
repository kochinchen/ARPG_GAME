<script setup lang="ts">
import { gameBridge } from '../bridge/GameBridge';
import type { CharacterView } from '../bridge/CharacterView';

defineProps<{ view: CharacterView }>();
const emit = defineEmits<{ close: [] }>();

/** 點一下 +1；按住 Shift 一次 +5 */
function add(e: MouseEvent, attribute: string) {
  (e.currentTarget as HTMLElement).blur();
  gameBridge.send({ type: 'AllocateAttribute', attribute, count: e.shiftKey ? 5 : 1 });
}
</script>

<template>
  <aside class="panel" @pointerdown.stop @contextmenu.prevent>
    <header>
      <span>角色 · Lv {{ view.level }}</span>
      <span class="points" :class="{ has: view.unspent > 0 }">屬性點 {{ view.unspent }}</span>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>

    <div class="columns">
    <div class="col">
    <section class="attributes">
      <div v-for="a in view.attributes" :key="a.id" class="row">
        <div class="name">{{ a.name }}</div>
        <div class="count">
          {{ a.points }}<span v-if="a.maxPoints !== null" class="max"> / {{ a.maxPoints }}</span>
        </div>
        <div class="effect">
          <div v-for="e in a.effects" :key="e.total">
            {{ e.total }} <span class="per">（{{ e.perPoint }}）</span>
          </div>
        </div>
        <button type="button" class="add" :disabled="!a.canAdd" :title="`加 1 點（Shift：加 5 點）`" @click="add($event, a.id)">+</button>
      </div>
      <p class="hint">每升一級得到 {{ view.pointsPerLevel }} 點。分配後無法退回。Shift + 點擊一次加 5 點。</p>
    </section>

    <section class="attack">
      <h4>攻擊力（每擊，技能倍率 100%，已含所有加成）</h4>
      <div v-for="s in view.attack" :key="s.label" class="stat">
        <span>{{ s.label }}</span>
        <span class="value big">{{ s.value }}</span>
      </div>
    </section>

    <section class="stats">
      <div v-for="s in view.stats" :key="s.label" class="stat" :class="{ sub: s.sub }">
        <span>{{ s.label }}</span>
        <span class="value">{{ s.value }}</span>
      </div>
    </section>

    </div>

    <!-- 右欄：抗性與特殊屬性（左右兩欄，不用往下捲） -->
    <div class="col side">
      <section v-for="g in view.groups" :key="g.title" class="group">
        <h4>{{ g.title }}</h4>
        <div v-for="r in g.rows" :key="r.label" class="stat" :class="{ zero: r.zero }">
          <span>{{ r.label }}</span>
          <span class="value">{{ r.value }}</span>
        </div>
      </section>
    </div>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  /* 位置由 App 的左側欄（left-dock）決定，與技能頁並排 */
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  pointer-events: auto;
  font: 13px/1.5 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 95%);
  border: 1px solid #5c5045;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #e8c47a;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.points {
  margin-left: auto;
  color: #8a7c68;
}
.points.has {
  color: #7fe07f;
}
.close {
  font-size: 18px;
  line-height: 1;
  color: #b8ab94;
  background: none;
  border: 0;
  cursor: pointer;
}
.attributes {
  padding: 8px 12px;
}
.row {
  display: grid;
  grid-template-columns: 44px 58px 1fr 28px;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #2a231d;
}
.name {
  color: #e8c47a;
}
.count {
  font-variant-numeric: tabular-nums;
}
.max,
.per {
  color: #8a7c68;
  font-size: 11px;
}
.add {
  width: 26px;
  height: 26px;
  font-size: 16px;
  color: #d8cbb4;
  cursor: pointer;
  background: #2a3a22;
  border: 1px solid #5a7a45;
}
.add:hover:not(:disabled) {
  border-color: #9fe07f;
}
.add:disabled {
  cursor: default;
  opacity: 0.35;
}
.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #8a7c68;
}
.attack {
  padding: 8px 12px;
  border-top: 1px solid #3d342c;
}
h4 {
  margin: 0 0 4px;
  font: 11px/1.4 sans-serif;
  color: #8a7c68;
}
.value.big {
  font-size: 14px;
  color: #ffd27a;
}
.stats {
  padding: 8px 12px 12px;
  border-top: 1px solid #3d342c;
}
.stat {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.stat.sub {
  padding-left: 12px;
  font-size: 11px;
  color: #9a8c76;
}
.stat.sub .value {
  color: #c8b89a;
}
.value {
  color: #f2e2b8;
  font-variant-numeric: tabular-nums;
}
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
}
.col.side {
  border-left: 1px solid #3d342c;
}
.group {
  padding: 6px 12px 10px;
}
.group + .group {
  border-top: 1px solid #3d342c;
}
.group .stat {
  font-size: 12px;
}
/* 沒有加成的屬性仍顯示（例如抗性 0%），但變暗 */
.group .stat.zero,
.group .stat.zero .value {
  color: #6a5e4e;
}
</style>
