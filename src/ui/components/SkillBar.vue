<script setup lang="ts">
import { gameBridge } from '../bridge/GameBridge';
import type { ComboBarView, GameView } from '../bridge/GameViewStore';

defineProps<{ bar: GameView['skillBar'] }>();

/** 點連段欄 = 按 Q / W / E / R / A / S / D */
function select(e: MouseEvent, combo: ComboBarView) {
  (e.currentTarget as HTMLElement).blur();
  if (combo.unlockLevel !== null) return;
  gameBridge.send({ type: 'SelectRightSlot', slot: combo.index });
}

function comboTitle(combo: ComboBarView): string {
  if (combo.unlockLevel !== null) return `${combo.key} 連段：等級 ${combo.unlockLevel} 解鎖`;
  if (combo.denied) return `${combo.key} 連段無法施放\n${combo.denied}`;
  const steps = combo.steps.map((s, i) => `${i + 1}. ${s.locked ? '（未解鎖）' : (s.skill?.name ?? '（空）')}`).join('\n');
  const name = combo.comboName === null ? '' : `\nCombo：${combo.comboName}`;
  return `${combo.key} 連段（右鍵施放）\n${steps}${name}`;
}
</script>

<template>
  <div class="skill-bar" @pointerdown.stop>
    <div
      class="slot left"
      :class="{ dim: bar.left && !bar.left.affordable, denied: bar.left?.denied }"
      :title="bar.left?.denied ? `左鍵無法使用：${bar.left.denied}` : '左鍵技能（在技能樹 T 更換）'"
    >
      <span class="key">左</span>
      <span class="name">{{ bar.left?.name ?? '—' }}</span>
    </div>
    <button
      v-for="combo in bar.combos"
      :key="combo.key"
      type="button"
      class="slot combo"
      :class="{ active: combo.active, locked: combo.unlockLevel !== null, extra: combo.index >= 4, denied: combo.denied }"
      :title="comboTitle(combo)"
      @click="select($event, combo)"
    >
      <span class="key">{{ combo.key }}</span>
      <span v-if="combo.unlockLevel !== null" class="lock">🔒<br />Lv{{ combo.unlockLevel }}</span>
      <span v-else class="steps">
        <span
          v-for="(step, i) in combo.steps"
          :key="i"
          :class="{ running: combo.running === i + 1, empty: !step.skill, dim: step.skill && (!step.skill.affordable || step.skill.cooldown > 0), 'step-denied': step.skill?.denied }"
        >
          {{ step.locked ? '🔒' : (step.skill?.name ?? '—') }}<template v-if="step.skill && step.skill.cooldown > 0"> {{ Math.ceil(step.skill.cooldown) }}s</template>
        </span>
      </span>
      <span v-if="combo.comboName && combo.unlockLevel === null" class="combo-name">{{ combo.comboName }}</span>
    </button>
    <div v-if="bar.supports.length" class="supports" title="Support 被動">
      <span v-for="s in bar.supports" :key="s">{{ s }}</span>
    </div>
  </div>
</template>

<style scoped>
.skill-bar {
  display: flex;
  gap: 6px;
  pointer-events: auto;
}
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 58px;
  padding: 0;
  font: 12px/1.3 sans-serif;
  color: #b8ab94;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #3d342c;
}
.slot.left {
  margin-right: 6px;
}
.slot.combo {
  width: 92px;
  cursor: pointer;
}
/* 還沒解鎖的按鍵：窄格、顯示解鎖等級 */
.slot.combo.locked {
  width: 44px;
  cursor: default;
  opacity: 0.6;
}
/* 觸控裝置只有 Q / W / E / R 的按鈕，A / S / D 不顯示；窄螢幕縮小格子 */
@media (pointer: coarse) {
  .slot.combo.extra {
    display: none;
  }
}
@media (max-width: 1100px) {
  .slot.combo {
    width: 72px;
  }
  .slot.combo.locked {
    width: 38px;
  }
}
.lock {
  font-size: 10px;
  line-height: 1.3;
  color: #6a5e4e;
  text-align: center;
}
.slot.combo:hover {
  border-color: #8a7c68;
}
.slot.active {
  color: #f0e2c0;
  border-color: #e8c47a;
  box-shadow: 0 0 8px rgb(232 196 122 / 45%);
}
.dim {
  color: #5a6a8a !important;
}
/* 目前的武器禁用：整格變暗，被禁用的那一招劃線 */
.slot.denied {
  opacity: 0.45;
}
.step-denied {
  color: #b0776a !important;
  text-decoration: line-through;
}
.key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: #8a7c68;
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
.combo-name {
  position: absolute;
  top: -15px;
  left: 50%;
  max-width: 130px;
  overflow: hidden;
  font-size: 10px;
  color: #ffb347;
  white-space: nowrap;
  text-overflow: ellipsis;
  transform: translateX(-50%);
  text-shadow: 0 1px 2px #000;
}
.supports {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  margin-left: 4px;
  font-size: 10px;
  color: #8aa2ff;
}
</style>
