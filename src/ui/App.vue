<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { gameBridge } from './bridge/GameBridge';
import { gameView } from './bridge/GameViewStore';
import { resolveHover, statDiff, type CoreHost, type HoverTarget } from './bridge/InventoryView';
import { displayBridge } from './bridge/DisplayBridge';
import { createPress } from './bridge/TouchPress';
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
import ChallengePrompt from './components/ChallengePrompt.vue';
import MenuBar, { type PanelName } from './components/MenuBar.vue';
import Notices from './components/Notices.vue';
import PauseMenu from './components/PauseMenu.vue';
import SkillTreePanel from './components/SkillTreePanel.vue';
import ShopPanel from './components/ShopPanel.vue';
import TouchControls from './components/TouchControls.vue';
import { isTouchDevice, touchOverride } from './bridge/TouchBridge';

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
// 不論用哪種方式關閉商人面板（×、Esc、離開商人、開其他面板），都讓遊戲把鍛造格裡的裝備放回背包
watch(shopOpen, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen) gameBridge.send({ type: 'ShopClosed' });
});
/** iPad 等觸控裝置才顯示搖桿與按鈕、改用觸控版面；偵測不到但第一次用手指點畫面時也打開 */
const touchMode = ref(isTouchDevice());
// 觸控版 MP 球在右上角：小地圖往左讓出位置
watch(touchMode, (touch) => displayBridge.setMapInset(touch ? 96 : 0), { immediate: true });

/**
 * 觸控版畫面放不下：角色、技能、背包、商人最多同時開兩個（商人＋背包、技能＋背包、角色＋技能、角色＋背包），
 * 開第三個時關掉最早開的。左右兩欄：背包固定在右邊，其他依角色 → 技能 → 商人的順序排。
 */
type DockPanel = 'character' | 'skills' | 'inventory' | 'shop';
const DOCK_PANELS: DockPanel[] = ['character', 'skills', 'inventory', 'shop'];
const dockOrder: DockPanel[] = [];
const isDockOpen = (panel: DockPanel) => (panel === 'shop' ? shopOpen.value : open[panel]);
function closeDock(panel: DockPanel) {
  if (panel === 'shop') shopOpen.value = false;
  else open[panel] = false;
}
for (const panel of DOCK_PANELS) {
  watch(
    () => isDockOpen(panel),
    (isOpen) => {
      const i = dockOrder.indexOf(panel);
      if (i >= 0) dockOrder.splice(i, 1);
      if (!isOpen) return;
      dockOrder.push(panel);
      if (!touchMode.value) return;
      while (dockOrder.filter(isDockOpen).length > 2) closeDock(dockOrder.find(isDockOpen)!);
    },
  );
}
const dockOpen = computed(() => DOCK_PANELS.some(isDockOpen));

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
      else if (gameView.challengePrompt) gameView.challengePrompt = null;
      else if (open.bestiary) open.bestiary = false;
      else if (itemCodexOpen.value) itemCodexOpen.value = false;
      else if (open.menu) open.menu = false;
      else if (open.character || open.skills || open.inventory || shopOpen.value) closeAll();
      else open.menu = true;
      break;
  }
}
function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch' && e.isTrusted && touchOverride() === null) touchMode.value = true;
  // 面板會擋下 pointerdown：會到這裡的是遊戲畫面或觸控按鈕，取消背包的選取
  selected.value = null;
}
function onPointerMove(e: PointerEvent) {
  pointer.value = { x: e.clientX, y: e.clientY };
}

// ---- 觸控背包：點一下選取（顯示說明）、選取後長按拿起並拖到別處放下 ----
const selected = ref<HoverTarget | null>(null);
const selectedInfo = computed(() => resolveHover(gameView.inventory, selected.value));
watch(
  () => open.inventory,
  (isOpen) => {
    if (!isOpen) selected.value = null;
  },
);
/** 與目前裝備的差異（戒指可能和兩只比較） */
const selectedDiffs = computed(() => {
  const info = selectedInfo.value;
  if (!info || info.entry.kind !== 'item') return [];
  return info.compare.map((c) => ({ caption: `換上後（與「${c.name}」相比，不含熔核與特殊效果）`, lines: statDiff(info.entry, c) }));
});
/** 選取中裝備上的第幾顆熔核（顯示熔核內容） */
const selectedSocket = ref<number | null>(null);
watch(selected, () => (selectedSocket.value = null));
const selectedCore = computed(() => (selectedSocket.value === null ? null : (selectedInfo.value?.entry.sockets?.[selectedSocket.value]?.core ?? null)));
const selectedHost = computed<CoreHost | null>(() => {
  const t = selected.value;
  return t?.kind === 'cell' ? { kind: 'cell', cell: t.cell } : t?.kind === 'slot' ? { kind: 'slot', slot: t.slot } : null;
});
const socketPress = createPress();
/** 點熔核 = 看內容；選取後長按 = 取下這一顆 */
function onSocketPress(e: PointerEvent, index: number) {
  socketPress.down(
    e,
    () => (selectedSocket.value = index),
    () => {
      const host = selectedHost.value;
      if (selectedSocket.value !== index || !host) {
        selectedSocket.value = index;
        return;
      }
      gameBridge.send({ type: 'RemoveCore', from: host, index });
      selectedSocket.value = null;
    },
  );
}

/** 長按拿起的那一格：手指放開時放到手指下的格子；放到無效位置則放回這一格 */
const dragOrigin = ref<HTMLElement | null>(null);
function onGrab(origin: HTMLElement) {
  const r = origin.getBoundingClientRect();
  pointer.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  dragOrigin.value = origin;
  selected.value = null;
}
function onPointerUp(e: PointerEvent) {
  const origin = dragOrigin.value;
  if (!origin) return;
  dragOrigin.value = null;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLButtonElement>('[data-drop]');
  // 背包格、裝備欄、拆解區、商人的賣出區 / 鍛造格 / 融合格；遊戲畫面或按不下去的位置：放回原位
  (el && !el.disabled ? el : origin).click();
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
const heldHint = computed(() => {
  if (dragOrigin.value) return '放到背包格、裝備欄、拆解區或商人';
  if (gameView.inventory.held?.kind === 'core') return '點有空孔的裝備鑲入 · 點背包放下 · 點地面丟棄';
  return '點背包 / 裝備欄放下 · 點地面丟棄';
});

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});
</script>

<template>
  <!-- 放在最前面：HUD、面板都蓋在觸控按鈕上面 -->
  <TouchControls
    v-if="touchMode && !open.menu && !open.bestiary && !itemCodexOpen"
    :skill-bar="gameView.skillBar"
    :potions="gameView.hud.potions"
  />
  <FloorHud :floor="gameView.floor" />
  <BossBar v-if="gameView.boss" :boss="gameView.boss" />
  <DevOverlay v-if="gameView.dev.enabled" :dev="gameView.dev" />
  <Notices :view="gameView" />

  <Hud :hud="gameView.hud" :skill-bar="gameView.skillBar" :touch="touchMode" />
  <MenuBar
    :open="open"
    :skill-points="gameView.hud.skillPoints"
    :attribute-points="gameView.hud.attributePoints"
    :touch="touchMode"
    @toggle="(panel) => (panel === 'menu' ? (open.menu = !open.menu) : toggle(panel))"
    @map="displayBridge.toggleMap()"
  />

  <!--
    桌面：左側欄放角色頁與技能頁（可以同時開，角色在左、技能在右；只開技能頁時靠左），商人在左、背包 / 裝備在右。
    觸控：所有面板排成左右兩欄（最多兩個），右邊讓出選單列。
  -->
  <div v-if="dockOpen" class="dock" :class="{ 'touch-dock': touchMode }">
    <div v-if="open.character || open.skills" class="left-dock" :class="{ 'beside-inventory': open.inventory }">
      <CharacterPanel v-if="open.character" :view="gameView.character" @close="open.character = false" />
      <SkillTreePanel v-if="open.skills" :view="gameView.skillTree" @close="open.skills = false" />
    </div>
    <ShopPanel v-if="shopOpen" :view="gameView.shop" @close="shopOpen = false" />
    <InventoryPanel
      v-if="open.inventory"
      :view="gameView.inventory"
      :gold="gameView.hud.gold"
      :shop-open="shopOpen"
      :touch="touchMode"
      :selected="selected"
      @close="toggle('inventory', false)"
      @hover="onHover"
      @select="(target) => (selected = target)"
      @grab="onGrab"
    />
  </div>

  <!-- 背包物品對應的裝備欄已有物品時，並排顯示以便比較 -->
  <div v-if="hovered && !gameView.inventory.held" class="tooltips" :style="tooltipStyle">
    <ItemTooltip v-for="(item, i) in hovered.compare" :key="i" :entry="item" caption="目前裝備" />
    <ItemTooltip :entry="hovered.entry" />
  </div>

  <!-- 觸控：選取的物品（點熔核看內容、選取後長按取下），顯示在背包左邊 -->
  <div
    v-if="touchMode && selectedInfo && !gameView.inventory.held"
    class="touch-tips"
    @pointerdown.stop
    @pointermove="socketPress.move"
    @pointerup="socketPress.up"
    @pointercancel="socketPress.cancel"
  >
    <ItemTooltip v-for="(item, i) in selectedInfo.compare" :key="i" :entry="item" caption="目前裝備" />
    <ItemTooltip
      :entry="selectedInfo.entry"
      :socket-touch="selectedHost !== null"
      :selected-socket="selectedSocket"
      :diffs="selectedDiffs"
      @socket-press="onSocketPress"
    />
    <ItemTooltip v-if="selectedCore" :entry="selectedCore" caption="熔核 · 長按取下" />
    <button type="button" class="tips-close" aria-label="關閉" @click="selected = null">×</button>
  </div>

  <!-- 拿在滑鼠 / 手指上的物品 -->
  <div v-if="gameView.inventory.held" class="held" :class="{ touch: touchMode }" :style="heldStyle">
    <ItemCell :entry="gameView.inventory.held" size="slot" />
    <span class="held-hint">{{ heldHint }}</span>
  </div>

  <LeavePrompt v-if="gameView.leavePrompt" :prompt="gameView.leavePrompt" @close="gameView.leavePrompt = null" />
  <ChallengePrompt v-if="gameView.challengePrompt" :prompt="gameView.challengePrompt" @close="gameView.challengePrompt = null" />
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
/* 桌面：外框不產生方塊，面板照各自的位置擺放 */
.dock {
  display: contents;
}
/* 觸控：左右兩欄，右邊讓出選單列（66px + 邊距） */
.dock.touch-dock {
  position: absolute;
  top: 12px;
  right: 88px;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}
.touch-dock .left-dock {
  display: contents;
}
.touch-dock :deep(.panel) {
  position: relative;
  inset: auto;
  flex: 0 0 calc(50% - 4px);
  width: auto;
  max-width: none;
  max-height: calc(100vh - 24px);
}
/* 背包固定在右欄 */
.touch-dock :deep(.panel.touch) {
  margin-left: auto;
}
.touch-tips {
  position: absolute;
  top: 12px;
  left: 12px;
  /* 左欄的寬度（背包在右欄） */
  width: calc((100vw - 108px) / 2);
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  pointer-events: auto;
}
.touch-tips :deep(.tooltip) {
  flex: 1 1 0;
  min-width: 180px;
  max-width: none;
}
.tips-close {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 32px;
  height: 32px;
  font-size: 20px;
  line-height: 1;
  color: #b8ab94;
  background: rgb(0 0 0 / 60%);
  border: 1px solid #3d342c;
}
/* 左側欄：角色頁與技能頁並排；空白處不擋滑鼠（點得到遊戲畫面） */
.left-dock {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: calc(100vw - 24px);
  pointer-events: none;
}
/* 背包開著時讓出右側（背包寬 340 + 邊距） */
.left-dock.beside-inventory {
  max-width: calc(100vw - 376px);
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
  pointer-events: none;
  border: 1px solid #c8a25a;
  box-shadow: 0 2px 10px rgb(0 0 0 / 70%);
  transform: translate(-50%, -50%);
}
.held.touch {
  width: 56px;
  height: 56px;
  /* 放在手指上方，不被手指擋住 */
  transform: translate(-50%, -130%);
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
