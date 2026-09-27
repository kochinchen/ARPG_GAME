<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { gameView } from './bridge/GameViewStore';
import { resolveHover, type HoverTarget } from './bridge/InventoryView';
import { systemBridge } from './bridge/SystemBridge';
import BestiaryPanel from './components/BestiaryPanel.vue';
import BossBar from './components/BossBar.vue';
import ItemCodexPanel from './components/ItemCodexPanel.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import DevOverlay from './components/DevOverlay.vue';
import FloorHud from './components/FloorHud.vue';
import Hud from './components/Hud.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import ItemCell from './components/ItemCell.vue';
import ItemTooltip from './components/ItemTooltip.vue';
import LeavePrompt from './components/LeavePrompt.vue';
import MenuBar, { type PanelName } from './components/MenuBar.vue';
import Notices from './components/Notices.vue';
import PauseMenu from './components/PauseMenu.vue';
import SkillTreePanel from './components/SkillTreePanel.vue';
import ShopPanel from './components/ShopPanel.vue';

const props = defineProps<{ devAvailable: boolean }>();

// 以下都是 UI 自己的狀態（面板開關、游標位置、hover），不經過遊戲
const open = reactive<Record<PanelName, boolean>>({ character: false, skills: false, inventory: false, bestiary: false, menu: false });
const pointer = ref({ x: 0, y: 0 });
const hoverTarget = ref<HoverTarget | null>(null);
/** 商店：點商人時開啟（同時打開背包），離開商人附近自動關閉 */
const shopOpen = ref(false);
watch(
  () => gameView.shopRequest,
  () => {
    shopOpen.value = true;
    open.inventory = true;
    open.character = open.skills = false;
  },
);
watch(
  () => gameView.shop.near,
  (near) => {
    if (!near) shopOpen.value = false;
  },
);
/** 依最新快照計算，穿脫或交換後 Tooltip 立即更新 */
const hovered = computed(() => resolveHover(gameView.inventory, hoverTarget.value));

const DEV_KEY = 'arpg.devOverlay';
function readDevPref(): boolean {
  try {
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}
gameView.dev.enabled = props.devAvailable && readDevPref();
function toggleDev() {
  if (!props.devAvailable) return;
  gameView.dev.enabled = !gameView.dev.enabled;
  try {
    localStorage.setItem(DEV_KEY, gameView.dev.enabled ? '1' : '0');
  } catch {
    // 無法儲存偏好時忽略
  }
}

/** 裝備圖鑑（與怪物圖鑑可以互相切換） */
const itemCodexOpen = ref(false);
function openCodex(which: 'monsters' | 'items') {
  open.bestiary = which === 'monsters';
  itemCodexOpen.value = which === 'items';
}

/** 開關面板。角色與技能樹都在左側，一次只開一個；選單與圖鑑開啟時遊戲暫停 */
function toggle(panel: PanelName, value = !open[panel]) {
  if (panel === 'bestiary') {
    // 圖鑑可以從選單打開（蓋在選單上，關閉後回到選單）
    open.bestiary = value;
    return;
  }
  if (open.menu && panel !== 'menu') return;
  open[panel] = value;
  if (value && panel === 'character') open.skills = false;
  if (value && panel === 'skills') open.character = false;
  // 商店也在左側
  if (value && (panel === 'character' || panel === 'skills')) shopOpen.value = false;
  if (!open.inventory) hoverTarget.value = null;
}
watch(
  () => open.menu || open.bestiary || itemCodexOpen.value,
  (paused) => systemBridge.setPaused(paused),
);

function closeAll() {
  open.character = open.skills = open.inventory = false;
  shopOpen.value = false;
  hoverTarget.value = null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyI':
      toggle('inventory');
      break;
    case 'KeyT':
      toggle('skills');
      break;
    case 'KeyC':
      toggle('character');
      break;
    case 'KeyK':
      toggle('bestiary');
      itemCodexOpen.value = false;
      break;
    case 'KeyO':
      itemCodexOpen.value = !itemCodexOpen.value;
      open.bestiary = false;
      break;
    case 'F3':
      e.preventDefault();
      toggleDev();
      break;
    case 'Escape':
      // 依序：確認對話框 → 選單 → 面板 → 開啟選單
      if (gameView.leavePrompt) gameView.leavePrompt = null;
      else if (open.bestiary) open.bestiary = false;
      else if (itemCodexOpen.value) itemCodexOpen.value = false;
      else if (open.menu) open.menu = false;
      else if (open.character || open.skills || open.inventory || shopOpen.value) closeAll();
      else open.menu = true;
      break;
  }
}
function onPointerMove(e: PointerEvent) {
  pointer.value = { x: e.clientX, y: e.clientY };
}
function onHover(target: HoverTarget | null) {
  hoverTarget.value = target;
}

/** Tooltip 放在游標左側（背包在右邊），並保持在畫面內 */
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
  <FloorHud :floor="gameView.floor" />
  <BossBar v-if="gameView.boss" :boss="gameView.boss" />
  <DevOverlay v-if="gameView.dev.enabled" :dev="gameView.dev" />
  <Notices :view="gameView" />

  <Hud :hud="gameView.hud" :skill-bar="gameView.skillBar" />
  <MenuBar
    :open="open"
    :skill-points="gameView.hud.skillPoints"
    :attribute-points="gameView.hud.attributePoints"
    @toggle="(panel) => (panel === 'menu' ? (open.menu = !open.menu) : toggle(panel))"
  />

  <SkillTreePanel v-if="open.skills" :view="gameView.skillTree" @close="open.skills = false" />
  <CharacterPanel v-if="open.character" :view="gameView.character" @close="open.character = false" />
  <ShopPanel v-if="shopOpen" :view="gameView.shop" @close="shopOpen = false" />
  <InventoryPanel
    v-if="open.inventory"
    :view="gameView.inventory"
    :gold="gameView.hud.gold"
    :shop-open="shopOpen"
    @close="toggle('inventory', false)"
    @hover="onHover"
  />

  <!-- 背包物品對應的裝備欄已有物品時，並排顯示以便比較 -->
  <div v-if="hovered && !gameView.inventory.held" class="tooltips" :style="tooltipStyle">
    <ItemTooltip v-for="(item, i) in hovered.compare" :key="i" :entry="item" caption="目前裝備" />
    <ItemTooltip :entry="hovered.entry" />
  </div>

  <!-- 拿在滑鼠上的物品 -->
  <div v-if="gameView.inventory.held" class="held" :style="heldStyle">
    <ItemCell :entry="gameView.inventory.held" size="slot" />
    <span class="held-hint">點背包 / 裝備欄放下 · 點地面丟棄</span>
  </div>

  <LeavePrompt v-if="gameView.leavePrompt" :prompt="gameView.leavePrompt" @close="gameView.leavePrompt = null" />
  <PauseMenu
    v-if="open.menu"
    :save="gameView.save"
    :dev-available="devAvailable"
    :dev-enabled="gameView.dev.enabled"
    @close="open.menu = false"
    @toggle-dev="toggleDev"
    @bestiary="openCodex('monsters')"
    @items="openCodex('items')"
  />
  <BestiaryPanel v-if="open.bestiary" :kills="gameView.bestiary" :dev-available="devAvailable" @close="open.bestiary = false" @items="openCodex('items')" />
  <ItemCodexPanel
    v-if="itemCodexOpen"
    :collection="gameView.collection"
    :dev-available="devAvailable"
    @close="itemCodexOpen = false"
    @monsters="openCodex('monsters')"
  />
</template>

<style scoped>
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
  pointer-events: none;
  border: 1px solid #c8a25a;
  box-shadow: 0 2px 10px rgb(0 0 0 / 70%);
  transform: translate(-50%, -50%);
}
.held-hint {
  position: absolute;
  top: 40px;
  left: 50%;
  font: 11px/1 sans-serif;
  color: #b8ab94;
  white-space: nowrap;
  text-shadow: 0 1px 3px #000;
  transform: translateX(-50%);
}
</style>
