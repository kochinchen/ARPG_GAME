<script setup lang="ts">
import { computed } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import type { GameView } from '../bridge/GameViewStore';
import ResourceOrb from './ResourceOrb.vue';
import SkillBar from './SkillBar.vue';

const props = defineProps<{ hud: GameView['hud']; skillBar: GameView['skillBar'] }>();

const xpPct = computed(() => Math.min(100, (props.hud.xp.value / Math.max(1, props.hud.xp.next)) * 100));

function usePotion(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
  gameBridge.send({ type: 'UsePotion' });
}
</script>

<template>
  <div class="orb-slot left" @pointerdown.stop>
    <ResourceOrb id="hp-orb" label="HP" :value="hud.hp.value" :max="hud.hp.max" color="#b3261e" rim="#e0574b" />
  </div>
  <div class="orb-slot right" @pointerdown.stop>
    <ResourceOrb id="mp-orb" label="MP" :value="hud.mp.value" :max="hud.mp.max" color="#1f4fb8" rim="#5a8cf0" />
  </div>

  <div class="center">
    <div v-if="hud.buffs.length" class="buffs">
      <span v-for="b in hud.buffs" :key="b.id" class="buff" :title="`${b.label}：${b.stacks} 層，剩 ${Math.ceil(b.remaining)} 秒`">
        {{ b.label }}<b v-if="b.stacks > 1">×{{ b.stacks }}</b><i>{{ Math.ceil(b.remaining) }}</i>
      </span>
    </div>
    <div class="xp-bar" :title="`經驗 ${hud.xp.value} / ${hud.xp.next}`">
      <div class="xp-fill" :style="{ width: `${xpPct}%` }" />
      <span class="xp-text">Lv {{ hud.xp.level }} · {{ hud.xp.value }} / {{ hud.xp.next }}</span>
    </div>
    <div class="row">
      <button
        type="button"
        class="potion"
        :class="{ empty: hud.potions === 0 }"
        :title="hud.potions === 0 ? '沒有藥水（怪物與寶箱會掉落）' : '喝藥水：同時回復 HP 與 MP（Space）'"
        @pointerdown.stop
        @click="usePotion"
      >
        <span class="key">Space</span>
        <span class="flask" />
        <span class="count">{{ hud.potions }}</span>
      </button>
      <SkillBar :bar="skillBar" />
      <div class="gold" title="金幣">{{ hud.gold }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 傳奇 / 神話裝備的增益 */
.buffs {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-bottom: 4px;
}
.buff {
  padding: 1px 6px;
  font: 11px/1.5 sans-serif;
  color: #ffd08a;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #b0621e;
}
.buff b {
  margin-left: 2px;
  color: #fff;
}
.buff i {
  margin-left: 4px;
  font-style: normal;
  color: #9a8c76;
}
.orb-slot {
  position: absolute;
  bottom: 12px;
  pointer-events: auto;
}
.orb-slot.left {
  left: 16px;
}
.orb-slot.right {
  right: 16px;
}
.center {
  position: absolute;
  bottom: 12px;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transform: translateX(-50%);
}
.xp-bar {
  position: relative;
  width: min(420px, calc(100vw - 320px));
  height: 12px;
  pointer-events: auto;
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
.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.potion {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 48px;
  height: 58px;
  padding: 4px 0;
  pointer-events: auto;
  cursor: pointer;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #3d342c;
}
.potion:hover {
  border-color: #c8a25a;
}
.potion.empty {
  opacity: 0.45;
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
  color: #f0e2c0;
}
.key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 9px;
  color: #8a7c68;
}
.gold {
  align-self: center;
  min-width: 48px;
  padding: 2px 6px;
  font: 12px/1.4 ui-monospace, Menlo, monospace;
  color: #e8c47a;
  text-align: center;
  background: rgb(0 0 0 / 55%);
  border: 1px solid #3d342c;
}
.gold::before {
  content: '●';
  margin-right: 4px;
  color: #c8a25a;
}
</style>
