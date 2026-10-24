<script setup lang="ts">
export type PanelName = 'character' | 'skills' | 'inventory' | 'bestiary' | 'menu';

/** touch：iPad 版面（直排在畫面右側、按鈕加大，多一個「大地圖」） */
defineProps<{ open: Record<PanelName, boolean>; skillPoints: number; attributePoints: number; touch?: boolean }>();
const emit = defineEmits<{ toggle: [panel: PanelName]; map: [] }>();

function click(e: MouseEvent, panel: PanelName) {
  (e.currentTarget as HTMLElement).blur();
  emit('toggle', panel);
}
</script>

<template>
  <nav class="menu-bar" :class="{ touch }" @pointerdown.stop>
    <button type="button" :class="{ on: open.character }" title="角色（C）" @click="click($event, 'character')">
      角色<span v-if="attributePoints > 0" class="badge">{{ attributePoints }}</span>
    </button>
    <button type="button" :class="{ on: open.skills }" title="技能（T）" @click="click($event, 'skills')">
      技能<span v-if="skillPoints > 0" class="badge">{{ skillPoints }}</span>
    </button>
    <button type="button" :class="{ on: open.inventory }" title="背包（I）" @click="click($event, 'inventory')">背包</button>
    <button type="button" :class="{ on: open.bestiary }" title="怪物圖鑑（K）" @click="click($event, 'bestiary')">圖鑑</button>
    <button type="button" :class="{ on: open.menu }" title="選單（Esc）" @click="click($event, 'menu')">選單</button>
    <button v-if="touch" type="button" title="小地圖 / 全地圖（Tab）" @click="emit('map')">大地圖</button>
  </nav>
</template>

<style scoped>
.menu-bar {
  position: absolute;
  right: 130px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: auto;
}
button {
  position: relative;
  width: 52px;
  padding: 3px 0;
  font: 12px/1.3 sans-serif;
  color: #b8ab94;
  cursor: pointer;
  background: rgb(0 0 0 / 65%);
  border: 1px solid #3d342c;
}
button:hover,
button.on {
  color: #f0e2c0;
  border-color: #e8c47a;
}
/* 觸控版：MP 球下方、右下按鈕上方 */
.menu-bar.touch {
  top: 124px;
  right: 10px;
  bottom: auto;
  gap: 5px;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.menu-bar.touch button {
  width: 66px;
  height: 38px;
  padding: 0;
  font-size: 14px;
  touch-action: manipulation;
}
.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 16px;
  padding: 0 3px;
  font: 10px/16px ui-monospace, Menlo, monospace;
  color: #0c0a09;
  background: #7fe07f;
  border-radius: 8px;
}
</style>
