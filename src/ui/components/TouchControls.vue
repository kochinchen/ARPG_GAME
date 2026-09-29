<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { GameView } from '../bridge/GameViewStore';
import { touchBridge } from '../bridge/TouchBridge';

/**
 * iPad 觸控操作：左邊浮動搖桿，右邊攻擊（= 左鍵）、招式（= 右鍵）、Q / W / E、藥水。
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
const pressed = reactive({ attack: false, cast: false });
const timers: Partial<Record<'attack' | 'cast', number>> = {};

function hold(e: PointerEvent, which: 'attack' | 'cast') {
  capture(e);
  pressed[which] = true;
  if (which === 'attack') {
    gameBridge.send({ type: 'AutoAttack', held: false });
    timers.attack = window.setInterval(() => gameBridge.send({ type: 'AutoAttack', held: true }), REPEAT_MS);
  } else {
    gameBridge.send({ type: 'AutoCastRight' });
    timers.cast = window.setInterval(() => gameBridge.send({ type: 'AutoCastRight' }), REPEAT_MS);
  }
}

function release(which: 'attack' | 'cast') {
  if (!pressed[which]) return;
  pressed[which] = false;
  window.clearInterval(timers[which]);
  if (which === 'attack') gameBridge.send({ type: 'PrimaryRelease' });
}

function selectCombo(slot: 0 | 1 | 2) {
  gameBridge.send({ type: 'SelectRightSlot', slot });
}

const flash = ref(false);
function drink() {
  gameBridge.send({ type: 'UsePotion' });
  flash.value = true;
  window.setTimeout(() => (flash.value = false), 150);
}

const activeCombo = computed(() => props.skillBar.combos.find((c) => c.active) ?? null);
const castLabel = computed(() => activeCombo.value?.steps.find((s) => s.skill)?.skill?.name ?? '—');

onBeforeUnmount(() => {
  window.clearInterval(stickTimer);
  window.clearInterval(timers.attack);
  window.clearInterval(timers.cast);
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

    <!-- 右：攻擊、招式、Q / W / E、藥水 -->
    <button
      type="button"
      class="btn attack"
      :class="{ on: pressed.attack, dim: skillBar.left && !skillBar.left.affordable }"
      @pointerdown.stop.prevent="hold($event, 'attack')"
      @pointerup="release('attack')"
      @pointercancel="release('attack')"
    >
      <span class="big">攻擊</span>
      <span class="small">{{ skillBar.left?.name ?? '—' }}</span>
    </button>
    <button
      type="button"
      class="btn cast"
      :class="{ on: pressed.cast }"
      @pointerdown.stop.prevent="hold($event, 'cast')"
      @pointerup="release('cast')"
      @pointercancel="release('cast')"
    >
      <span class="big">{{ activeCombo?.key ?? '招式' }}</span>
      <span class="small">{{ castLabel }}</span>
    </button>
    <button
      v-for="combo in skillBar.combos"
      :key="combo.key"
      type="button"
      class="btn combo"
      :class="[`slot-${combo.index}`, { on: combo.active }]"
      @pointerdown.stop.prevent="selectCombo(combo.index)"
    >
      {{ combo.key }}
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

/* 搖桿區：左半邊下方，避開頂端的樓層資訊 */
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
  bottom: 230px;
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

/* 位置：避開右下角的 MP 球與選單列（約 150px 高） */
.attack {
  right: 28px;
  bottom: 176px;
  width: 96px;
  height: 96px;
  background: rgb(90 30 20 / 55%);
}
.cast {
  right: 134px;
  bottom: 160px;
  width: 74px;
  height: 74px;
  background: rgb(20 40 90 / 55%);
}
.combo {
  width: 50px;
  height: 50px;
  font-size: 16px;
  font-weight: bold;
}
.combo.on {
  transform: none;
}
.combo.slot-0 {
  right: 140px;
  bottom: 248px;
}
.combo.slot-1 {
  right: 92px;
  bottom: 290px;
}
.combo.slot-2 {
  right: 30px;
  bottom: 292px;
}
.potion {
  right: 222px;
  bottom: 172px;
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
