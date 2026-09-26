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

    <section class="stats">
      <div v-for="s in view.stats" :key="s.label" class="stat">
        <span>{{ s.label }}</span>
        <span class="value">{{ s.value }}</span>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  left: 12px;
  width: min(340px, calc(100vw - 32px));
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
.stats {
  padding: 8px 12px 12px;
  border-top: 1px solid #3d342c;
}
.stat {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.value {
  color: #f2e2b8;
  font-variant-numeric: tabular-nums;
}
</style>
