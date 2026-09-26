<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { debugView } from './bridge/DebugView';
import { resolveHover, type HoverTarget } from './bridge/InventoryView';
import InventoryPanel from './components/InventoryPanel.vue';
import ItemCell from './components/ItemCell.vue';
import ItemTooltip from './components/ItemTooltip.vue';
import ResourceOrb from './components/ResourceOrb.vue';
import SkillTreePanel from './components/SkillTreePanel.vue';

// 以下都是 UI 自己的狀態（面板開關、游標位置、hover），不經過遊戲
const inventoryOpen = ref(false);
const skillTreeOpen = ref(false);
const pointer = ref({ x: 0, y: 0 });
const hoverTarget = ref<HoverTarget | null>(null);
/** 依最新快照計算，穿脫或交換後 Tooltip 立即更新 */
const hovered = computed(() => resolveHover(debugView.inventory, hoverTarget.value));

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'KeyI') inventoryOpen.value = !inventoryOpen.value;
  else if (e.code === 'KeyT') skillTreeOpen.value = !skillTreeOpen.value;
  else if (e.code === 'Escape') {
    inventoryOpen.value = false;
    skillTreeOpen.value = false;
  }
  if (!inventoryOpen.value) hoverTarget.value = null;
}
function onPointerMove(e: PointerEvent) {
  pointer.value = { x: e.clientX, y: e.clientY };
}
function onHover(target: HoverTarget | null) {
  hoverTarget.value = target;
}

/** Tooltip 放在游標左側（面板在右邊），並保持在畫面內 */
const tooltipStyle = computed(() => ({
  right: `${Math.max(8, window.innerWidth - pointer.value.x + 16)}px`,
  top: `${Math.min(Math.max(8, pointer.value.y - 20), window.innerHeight - 280)}px`,
}));
const heldStyle = computed(() => ({ left: `${pointer.value.x}px`, top: `${pointer.value.y}px` }));

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointermove', onPointerMove);
});
</script>

<template>
  <div class="debug">
    <div class="title">ARPG · {{ debugView.milestone }}</div>
    <div>Tick {{ debugView.tick }} · {{ debugView.fps }} FPS</div>
    <div>Player ({{ debugView.player.x.toFixed(2) }}, {{ debugView.player.y.toFixed(2) }})</div>
    <div>藥水 {{ debugView.potions }} · 金幣 {{ debugView.gold }} · 敵人 {{ debugView.enemies }}</div>
    <div>Target {{ debugView.target }}</div>
    <div class="hint">左鍵：移動 / 攻擊 / 撿取 · 右鍵：施放連段 · QWE：切換連段 · Space：藥水 · I：背包 · T：技能</div>
    <div v-if="debugView.devKeys" class="dev-hint">測試：B 重置 · N 升一級 · M 生成寶箱</div>
  </div>

  <SkillTreePanel v-if="skillTreeOpen" :view="debugView.skillTree" @close="skillTreeOpen = false" />

  <div class="xp-bar" :title="`經驗 ${debugView.xp.value} / ${debugView.xp.next}`">
    <div class="xp-fill" :style="{ width: `${Math.min(100, (debugView.xp.value / debugView.xp.next) * 100)}%` }" />
    <span class="xp-text">
      Lv {{ debugView.xp.level }} · {{ debugView.xp.value }} / {{ debugView.xp.next }}
      <template v-if="debugView.skillPoints > 0"> · 技能點 {{ debugView.skillPoints }}（T）</template>
    </span>
  </div>

  <div class="orb-left">
    <ResourceOrb id="hp-orb" label="HP" :value="debugView.hp.value" :max="debugView.hp.max" color="#b3261e" rim="#e0574b" />
  </div>
  <div class="orb-right">
    <ResourceOrb id="mp-orb" label="MP" :value="debugView.mp.value" :max="debugView.mp.max" color="#1f4fb8" rim="#5a8cf0" />
  </div>

  <InventoryPanel
    v-if="inventoryOpen"
    :view="debugView.inventory"
    :gold="debugView.gold"
    @close="
      inventoryOpen = false;
      hoverTarget = null;
    "
    @hover="onHover"
  />

  <!-- 背包物品對應的裝備欄已有物品時，並排顯示以便比較 -->
  <div v-if="hovered && !debugView.inventory.held" class="tooltips" :style="tooltipStyle">
    <ItemTooltip v-for="(item, i) in hovered.compare" :key="i" :entry="item" caption="目前裝備" />
    <ItemTooltip :entry="hovered.entry" />
  </div>

  <!-- 拿在滑鼠上的物品 -->
  <div v-if="debugView.inventory.held" class="held" :style="heldStyle">
    <ItemCell :entry="debugView.inventory.held" size="slot" />
    <span class="held-hint">點背包 / 裝備欄放下 · 點地面丟棄</span>
  </div>

  <div class="skill-bar">
    <div class="slot left">
      <span class="key">左</span>
      <span class="name">{{ debugView.leftSkill }}</span>
    </div>
    <div v-for="combo in debugView.combos" :key="combo.key" class="slot combo" :class="{ active: combo.active }">
      <span class="key">{{ combo.key }}</span>
      <span class="steps">
        <span v-for="(step, i) in combo.steps" :key="i" :class="{ running: combo.running === i + 1, empty: !step }">
          {{ step || '—' }}
        </span>
      </span>
    </div>
    <div v-if="debugView.supports.length" class="supports-bar">
      <span v-for="s in debugView.supports" :key="s">{{ s }}</span>
    </div>
  </div>

  <div v-if="debugView.discovery" class="discovery" role="status">
    <div class="discovery-title">COMBO DISCOVERED</div>
    <div class="discovery-name">{{ debugView.discovery.name }}</div>
    <div v-for="line in debugView.discovery.description" :key="line" class="discovery-line">{{ line }}</div>
  </div>

  <div v-if="debugView.respawnIn !== null" class="death">
    <div class="death-title">你倒下了</div>
    <div>{{ Math.ceil(debugView.respawnIn) }} 秒後回到樓梯口</div>
  </div>
</template>

<style scoped>
.debug {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 8px 12px;
  font: 12px/1.6 ui-monospace, Menlo, monospace;
  color: #d8cbb4;
  background: rgb(0 0 0 / 55%);
  border: 1px solid #3d342c;
}
.title {
  color: #e8c47a;
}
.hint {
  margin-top: 4px;
  color: #8a7c68;
}
.dev-hint {
  color: #6fa8ff;
}
.tooltips {
  position: absolute;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}
.held {
  position: absolute;
  width: 36px;
  height: 36px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border: 1px solid #c8a25a;
  box-shadow: 0 2px 10px rgb(0 0 0 / 70%);
}
.held-hint {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font: 11px/1 sans-serif;
  color: #b8ab94;
  text-shadow: 0 1px 3px #000;
}
.orb-left,
.orb-right {
  position: absolute;
  bottom: 12px;
}
.orb-left {
  left: 16px;
}
.orb-right {
  right: 16px;
}
.xp-bar {
  position: absolute;
  bottom: 84px;
  left: 50%;
  width: min(360px, calc(100vw - 300px));
  height: 12px;
  transform: translateX(-50%);
  background: rgb(0 0 0 / 70%);
  border: 1px solid #3d342c;
}
.xp-fill {
  height: 100%;
  background: linear-gradient(#d9b45f, #8a6d38);
  transition: width 0.25s ease-out;
}
.xp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 10px/1 ui-monospace, Menlo, monospace;
  color: #f0e2c0;
  text-shadow: 0 1px 2px #000;
}
.skill-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 58px;
  font: 12px/1.3 sans-serif;
  color: #b8ab94;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #3d342c;
}
.slot.left {
  margin-right: 10px;
}
.slot.combo {
  width: 108px;
}
.steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  line-height: 1.25;
}
.steps .empty {
  color: #4a4034;
}
.steps .running {
  color: #ffb347;
}
.supports-bar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  margin-left: 10px;
  font-size: 10px;
  color: #8aa2ff;
}
.slot.active {
  color: #f0e2c0;
  border-color: #e8c47a;
  box-shadow: 0 0 8px rgb(232 196 122 / 45%);
}
.key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: #8a7c68;
}
.cost {
  font-size: 10px;
  color: #6fa8ff;
}
.cooldown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #fff;
  background: rgb(0 0 0 / 60%);
}
.discovery {
  position: absolute;
  top: 16%;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 28px;
  text-align: center;
  color: #f0e2c0;
  background: linear-gradient(90deg, transparent, rgb(12 10 9 / 90%) 15%, rgb(12 10 9 / 90%) 85%, transparent);
  text-shadow: 0 2px 6px #000;
  animation: discovery-in 0.35s ease-out;
}
.discovery-title {
  font: 11px/1.4 ui-monospace, Menlo, monospace;
  letter-spacing: 0.35em;
  color: #ffb347;
}
.discovery-name {
  font: 24px/1.4 serif;
  color: #ffd27a;
}
.discovery-line {
  font-size: 12px;
  color: #b8ab94;
}
@keyframes discovery-in {
  from {
    opacity: 0;
    transform: translate(-50%, -8px);
  }
}
.death {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font: 16px/1.6 serif;
  color: #d8cbb4;
  text-shadow: 0 2px 6px #000;
}
.death-title {
  font-size: 34px;
  color: #b02a1e;
  letter-spacing: 0.2em;
}
</style>
