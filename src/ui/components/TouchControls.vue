<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { ComboBarView, GameView } from '../bridge/GameViewStore';
import { touchBridge } from '../bridge/TouchBridge';

/**
 * iPad 觸控操作：左下浮動搖桿；右下攻擊（= 左鍵）、拿取、Q / W / E / R（按下 = 對最近的敵人施放那一組連段）、藥水。
 * 平常半透明，按下時才亮起。只送 Command，不碰遊戲狀態。
 */
const props = defineProps<{ skillBar: GameView['skillBar']; potions: number }>();

/** 按住時重送指令的間隔（毫秒），與滑鼠按住一致 */
const REPEAT_MS = 100;
/** 搖桿頭最多離中心多遠（px） */
const STICK_RADIUS = 56;
/** 推不到這個比例視為沒推（避免手指輕微晃動就走） */
const DEAD_ZONE = 0.2;
/** 在搖桿區內輕點（時間短、幾乎沒移動）當作點地面：撿東西、開寶箱 */
const TAP_MS = 250;
const TAP_MOVE_PX = 10;

/** 手指滑出按鈕也繼續算按住（不支援時忽略） */
function capture(e: PointerEvent) {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    // 無法捕捉時照常運作，只是手指滑出範圍後收不到移動
  }
}

// ---- 搖桿 ----
const stick = reactive({ active: false, pointerId: -1, originX: 0, originY: 0, dx: 0, dy: 0, startTime: 0, moved: false });
let stickTimer = 0;

function onStickDown(e: PointerEvent) {
  if (stick.active) return;
  capture(e);
  Object.assign(stick, { active: true, pointerId: e.pointerId, originX: e.clientX, originY: e.clientY, dx: 0, dy: 0, startTime: e.timeStamp, moved: false });
  stickTimer = window.setInterval(sendStick, REPEAT_MS);
}

function onStickMove(e: PointerEvent) {
  if (!stick.active || e.pointerId !== stick.pointerId) return;
  let dx = e.clientX - stick.originX;
  let dy = e.clientY - stick.originY;
  const len = Math.hypot(dx, dy);
  if (len > TAP_MOVE_PX) stick.moved = true;
  if (len > STICK_RADIUS) {
    dx = (dx / len) * STICK_RADIUS;
    dy = (dy / len) * STICK_RADIUS;
  }
  stick.dx = dx;
  stick.dy = dy;
  if (!stick.moved) return;
  sendStick();
}

function onStickUp(e: PointerEvent) {
  if (!stick.active || e.pointerId !== stick.pointerId) return;
  window.clearInterval(stickTimer);
  stick.active = false;
  stick.dx = stick.dy = 0;
  lastStickSent = false;
  gameBridge.send({ type: 'MoveDirection', dir: null });
  if (!stick.moved && e.timeStamp - stick.startTime < TAP_MS) tapGround(e.clientX, e.clientY);
}

let lastStickSent = false;
function sendStick() {
  const push = Math.hypot(stick.dx, stick.dy) / STICK_RADIUS;
  if (push < DEAD_ZONE) {
    if (lastStickSent) gameBridge.send({ type: 'MoveDirection', dir: null });
    lastStickSent = false;
    return;
  }
  lastStickSent = true;
  gameBridge.send({ type: 'MoveDirection', dir: touchBridge.screenDirToWorld(stick.dx, stick.dy) });
}

/** 把輕點轉交給遊戲畫面（和直接點地面一樣：撿物品、開寶箱、點敵人） */
function tapGround(x: number, y: number) {
  const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
  if (!canvas) return;
  const init = { clientX: x, clientY: y, button: 0, pointerId: 9999, pointerType: 'touch', bubbles: true };
  canvas.dispatchEvent(new PointerEvent('pointerdown', init));
  canvas.dispatchEvent(new PointerEvent('pointerup', init));
}

const stickStyle = computed(() =>
  stick.active ? { left: `${stick.originX}px`, top: `${stick.originY}px`, bottom: 'auto' } : {},
);
const knobStyle = computed(() => ({ transform: `translate(${stick.dx}px, ${stick.dy}px)` }));

// ---- 按鈕 ----
const pressed = reactive({ attack: false, combo: -1 });
let attackTimer = 0;
let comboTimer = 0;

function holdAttack(e: PointerEvent) {
  capture(e);
  pressed.attack = true;
  gameBridge.send({ type: 'AutoAttack', held: false });
  attackTimer = window.setInterval(() => gameBridge.send({ type: 'AutoAttack', held: true }), REPEAT_MS);
}

function releaseAttack() {
  if (!pressed.attack) return;
  pressed.attack = false;
  window.clearInterval(attackTimer);
  gameBridge.send({ type: 'PrimaryRelease' });
}

/** Q / W / E / R：選這一組並對最近的敵人施放；按住則這組結束後再施放 */
function holdCombo(e: PointerEvent, combo: ComboBarView) {
  if (combo.unlockLevel !== null) return;
  capture(e);
  pressed.combo = combo.index;
  gameBridge.send({ type: 'SelectRightSlot', slot: combo.index });
  gameBridge.send({ type: 'AutoCastRight' });
  window.clearInterval(comboTimer);
  comboTimer = window.setInterval(() => gameBridge.send({ type: 'AutoCastRight' }), REPEAT_MS);
}

function releaseCombo() {
  pressed.combo = -1;
  window.clearInterval(comboTimer);
}

/** 手機版只放 Q / W / E / R 四個按鈕（A / S / D 在小螢幕放不下，暫不提供） */
const TOUCH_COMBOS = 4;
const touchCombos = computed(() => props.skillBar.combos.slice(0, TOUCH_COMBOS));
/** 連段按鈕上的小字：這組的第一招 */
const comboLabel = (combo: ComboBarView) => combo.steps.find((step) => step.skill)?.skill?.name ?? '—';

const picking = ref(false);
function pick() {
  gameBridge.send({ type: 'AutoInteract' });
  picking.value = true;
  window.setTimeout(() => (picking.value = false), 150);
}

const flash = ref(false);
function drink() {
  gameBridge.send({ type: 'UsePotion' });
  flash.value = true;
  window.setTimeout(() => (flash.value = false), 150);
}

onBeforeUnmount(() => {
  window.clearInterval(stickTimer);
  window.clearInterval(attackTimer);
  window.clearInterval(comboTimer);
});
</script>

<template>
  <div class="touch-controls">
    <!-- 左：搖桿區（手指放下的位置就是搖桿中心） -->
    <div
      class="stick-zone"
      @pointerdown="onStickDown"
      @pointermove="onStickMove"
      @pointerup="onStickUp"
      @pointercancel="onStickUp"
    >
      <div class="stick" :class="{ active: stick.active }" :style="stickStyle">
        <div class="knob" :style="knobStyle" />
      </div>
    </div>

    <!-- 右下：攻擊（大）；Q / W / E / R 圍成弧形；拿取在左、藥水在上 -->
    <button
      type="button"
      class="btn attack"
      :class="{ on: pressed.attack, dim: skillBar.left && !skillBar.left.affordable }"
      @pointerdown.stop.prevent="holdAttack"
      @pointerup="releaseAttack"
      @pointercancel="releaseAttack"
    >
      <span class="big">攻擊</span>
      <span class="small">{{ skillBar.left?.name ?? '—' }}</span>
    </button>
    <button
      v-for="combo in touchCombos"
      :key="combo.key"
      type="button"
      class="btn combo"
      :class="[`slot-${combo.index}`, { on: pressed.combo === combo.index, active: combo.active, locked: combo.unlockLevel !== null }]"
      @pointerdown.stop.prevent="holdCombo($event, combo)"
      @pointerup="releaseCombo"
      @pointercancel="releaseCombo"
    >
      <span class="big">{{ combo.key }}</span>
      <span v-if="combo.unlockLevel !== null" class="small">Lv{{ combo.unlockLevel }}</span>
      <span v-else class="small">{{ comboLabel(combo) }}</span>
    </button>
    <button type="button" class="btn pick" :class="{ on: picking }" @pointerdown.stop.prevent="pick">
      <span class="big">拿取</span>
    </button>
    <button
      type="button"
      class="btn potion"
      :class="{ on: flash, empty: potions === 0 }"
      @pointerdown.stop.prevent="drink"
    >
      <span class="flask" />
      <span class="count">{{ potions }}</span>
    </button>
  </div>
</template>

<style scoped>
.touch-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.touch-controls * {
  touch-action: none;
}

/* 搖桿區：左半邊下方，避開左上角的 HP 球 */
.stick-zone {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 42%;
  height: 62%;
  pointer-events: auto;
}
.stick {
  position: fixed;
  left: 150px;
  bottom: 150px;
  width: 128px;
  height: 128px;
  margin: -64px 0 -64px -64px;
  pointer-events: none;
  background: radial-gradient(circle, rgb(255 255 255 / 6%) 40%, rgb(255 255 255 / 12%));
  border: 2px solid rgb(232 196 122 / 35%);
  border-radius: 50%;
  opacity: 0.45;
  transition: opacity 0.15s;
}
.stick.active {
  opacity: 0.9;
}
.knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 56px;
  height: 56px;
  margin: -28px;
  background: radial-gradient(circle at 40% 35%, rgb(240 226 192 / 55%), rgb(120 100 70 / 55%));
  border: 1px solid rgb(232 196 122 / 60%);
  border-radius: 50%;
}

.btn {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #f0e2c0;
  pointer-events: auto;
  background: rgb(0 0 0 / 55%);
  border: 2px solid rgb(232 196 122 / 45%);
  border-radius: 50%;
  opacity: 0.55;
  transition:
    opacity 0.1s,
    transform 0.1s;
  font: 12px/1.2 sans-serif;
  text-shadow: 0 1px 2px #000;
}
.btn.on {
  opacity: 0.95;
  transform: scale(0.94);
  border-color: #e8c47a;
  box-shadow: 0 0 12px rgb(232 196 122 / 55%);
}
.btn.dim .small {
  color: #7a8aaa;
}
.big {
  font-size: 17px;
  font-weight: bold;
}
.small {
  max-width: 90%;
  overflow: hidden;
  font-size: 10px;
  color: #b8ab94;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * 位置：攻擊鈕在右下角（中心距右、下各 74px）；Q / W / E / R 在半徑 130px 的弧上（R 在左、E 在正上方），
 * 拿取在更外圈的左邊、藥水在正上方。右上方的選單列直排在這些按鈕上面。
 */
.attack {
  right: 24px;
  bottom: 24px;
  width: 100px;
  height: 100px;
  background: rgb(90 30 20 / 55%);
}
.combo {
  width: 58px;
  height: 58px;
}
.combo .big {
  font-size: 16px;
}
.combo.active {
  border-color: rgb(120 160 255 / 80%);
}
.combo.slot-3 {
  right: 175px;
  bottom: 45px;
}
.combo.slot-0 {
  right: 158px;
  bottom: 110px;
}
.combo.slot-1 {
  right: 110px;
  bottom: 158px;
}
.combo.slot-2 {
  right: 45px;
  bottom: 175px;
}
.combo.locked {
  opacity: 0.3;
}
.pick {
  right: 262px;
  bottom: 42px;
  width: 64px;
  height: 64px;
  background: rgb(60 50 20 / 55%);
}
.pick .big {
  font-size: 15px;
}
.potion {
  right: 46px;
  bottom: 262px;
  width: 56px;
  height: 56px;
}
.potion.empty {
  opacity: 0.25;
}
.flask {
  width: 12px;
  height: 18px;
  background: linear-gradient(90deg, #d0453a 50%, #3a6fd0 50%);
  border-radius: 3px 3px 6px 6px;
}
.count {
  margin-top: 3px;
  font: 12px/1 ui-monospace, Menlo, monospace;
}
</style>
