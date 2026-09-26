<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** 唯一 ID（SVG clipPath 用） */
  id: string;
  label: string;
  value: number;
  max: number;
  /** 液體顏色 */
  color: string;
  /** 外框與高光顏色 */
  rim: string;
}>();

/** 0～1；100% 全滿，0% 只剩空心圓框 */
const ratio = computed(() => (props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0));
const R = 46;
const liquidTop = computed(() => 50 + R - 2 * R * ratio.value);
</script>

<template>
  <div class="orb">
    <svg viewBox="0 0 100 100" role="img" :aria-label="`${label} ${Math.ceil(value)} / ${Math.ceil(max)}`">
      <defs>
        <clipPath :id="`${id}-clip`">
          <circle cx="50" cy="50" :r="R" />
        </clipPath>
        <radialGradient :id="`${id}-shade`" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35" />
          <stop offset="45%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.45" />
        </radialGradient>
      </defs>
      <g :clip-path="`url(#${id}-clip)`">
        <rect class="liquid" x="0" :y="liquidTop" width="100" height="100" :fill="color" />
        <rect class="liquid" x="0" :y="liquidTop" width="100" height="100" :fill="`url(#${id}-shade)`" />
        <line v-if="ratio > 0 && ratio < 1" class="surface" x1="0" x2="100" :y1="liquidTop" :y2="liquidTop" :stroke="rim" />
      </g>
      <circle cx="50" cy="50" :r="R" fill="none" :stroke="rim" stroke-width="3" />
    </svg>
    <div class="text">{{ label }} {{ Math.ceil(value) }} / {{ Math.ceil(max) }}</div>
  </div>
</template>

<style scoped>
.orb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 112px;
}
svg {
  width: 112px;
  height: 112px;
  filter: drop-shadow(0 2px 6px rgb(0 0 0 / 70%));
}
.liquid,
.surface {
  transition:
    y 0.2s ease-out,
    y1 0.2s ease-out,
    y2 0.2s ease-out;
}
.surface {
  stroke-width: 1.5;
  opacity: 0.8;
}
.text {
  font: 12px/1 ui-monospace, Menlo, monospace;
  color: #d8cbb4;
  text-shadow: 0 1px 3px #000;
}
</style>
