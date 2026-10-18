<script setup lang="ts">
import type { ShopView } from '../bridge/ShopView';
import { sparklePath } from '../../render/icons/CoreIcons';

/**
 * 融合結果的揭曉動畫（SPEC §2.5）：白色六角寶石 → 外框轉成核色 → 刻面依角度掃過亮起 → 星芒 → 最後頂點亮點決定印記。
 * key 用熔核 uid：每次融合重新播放。
 */
defineProps<{ result: NonNullable<ShopView['fusion']['result']> }>();
const emit = defineEmits<{ dismiss: [] }>();

const FACET_DELAY = 0.18;
const FACET_START = 0.6;
</script>

<template>
  <div :key="result.uid" class="reveal">
    <svg viewBox="0 0 100 100" class="gem" aria-hidden="true">
      <defs>
        <radialGradient :id="`hl-${result.uid}`" cx="0.34" cy="0.3" r="0.55">
          <stop offset="0" stop-color="#fff" stop-opacity="0.28" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <polygon :points="result.gem.frame.points" class="white" />
      <polygon
        v-for="(f, i) in result.gem.facets"
        :key="i"
        :points="f.points"
        :fill="f.color"
        :stroke="result.gem.edge"
        class="facet"
        :style="{ animationDelay: `${FACET_START + f.order * FACET_DELAY}s` }"
      />
      <polygon :points="result.gem.frame.points" :fill="`url(#hl-${result.uid})`" class="shine" />
      <path :d="result.gem.glyph.d" class="glyph" :class="{ fill: result.gem.glyph.fill }" />
      <polygon :points="result.gem.frame.points" class="frame" :style="{ '--frame': result.gem.frame.color }" />
      <path v-for="(s, i) in result.gem.sparkles" :key="`s${i}`" :d="sparklePath(s.x, s.y, s.r)" class="sparkle" :style="{ animationDelay: `${2.1 + i * 0.12}s` }" />
      <template v-if="result.gem.brand">
        <circle :cx="result.gem.brand[0]" :cy="result.gem.brand[1]" r="8" class="brand-glow" />
        <path :d="sparklePath(result.gem.brand[0], result.gem.brand[1], 11)" class="brand" />
      </template>
    </svg>
    <div class="text">
      <b :class="`t-${result.entry.rarity}`">{{ result.entry.name }}</b>
      <span>{{ result.entry.slotLabel }}</span>
      <span v-if="result.branded" class="brand-text">✦ {{ result.brand }}</span>
      <span v-else class="no-brand">沒有印記</span>
    </div>
    <button type="button" class="ok" @click="emit('dismiss')">收下（已放進背包）</button>
  </div>
</template>

<style scoped>
.reveal {
  display: grid;
  justify-items: center;
  gap: 6px;
  margin: 8px 0;
  padding: 10px;
  background: radial-gradient(circle at 50% 35%, rgb(255 240 200 / 10%), transparent 70%);
  border: 1px solid #5a4c3e;
}
.gem {
  width: 110px;
  height: 110px;
  overflow: visible;
}
.white {
  fill: #fffaf0;
  animation: fade-white 0.7s ease-out forwards;
}
.facet {
  opacity: 0;
  stroke-width: 0.45;
  stroke-opacity: 0.55;
  stroke-linejoin: round;
  animation: facet 0.45s ease-out forwards;
}
.shine {
  opacity: 0;
  animation: facet 0.6s ease-out 1.7s forwards;
}
.sparkle {
  fill: #fff;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: brand 0.5s ease-out forwards;
}
.frame {
  fill: none;
  stroke: #fffaf0;
  stroke-width: 4.2;
  stroke-linejoin: round;
  animation: frame 0.7s ease-out 0.3s forwards;
}
.glyph {
  fill: none;
  stroke: #fff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
  animation: glyph 0.4s ease-out 1.9s forwards;
}
.glyph.fill {
  fill: #fff;
  stroke: none;
}
@keyframes glyph {
  to {
    opacity: 0.35;
  }
}
.brand,
.brand-glow {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: brand 0.6s ease-out 2.9s forwards;
}
.brand {
  fill: #fffbe8;
}
.brand-glow {
  fill: #fff6d0;
}
@keyframes fade-white {
  to {
    fill: #0c0a09;
  }
}
@keyframes frame {
  to {
    stroke: var(--frame);
  }
}
@keyframes facet {
  from {
    opacity: 0;
    filter: brightness(2.4);
  }
  to {
    opacity: 1;
    filter: brightness(1);
  }
}
@keyframes brand {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  60% {
    opacity: 1;
    transform: scale(1.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.brand-glow {
  animation-name: brand-glow;
}
@keyframes brand-glow {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  60% {
    opacity: 0.6;
    transform: scale(2.2);
  }
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
}
.text {
  display: grid;
  justify-items: center;
  font-size: 12px;
  opacity: 0;
  animation: facet 0.4s ease-out 2.6s forwards;
}
.text b {
  font-size: 14px;
}
.brand-text {
  color: #ffe9a8;
}
.no-brand {
  color: #6a5e4e;
}
.ok {
  margin-top: 2px;
  padding: 4px 14px;
}
.t-normal {
  color: #e8e2d4;
}
.t-magic {
  color: #8aa2ff;
}
.t-rare {
  color: #f2d24b;
}
.t-epic {
  color: #b98cff;
}
.t-legendary {
  color: #ff9a3c;
}
@media (prefers-reduced-motion: reduce) {
  .white,
  .facet,
  .shine,
  .sparkle,
  .frame,
  .glyph,
  .brand,
  .brand-glow,
  .text {
    animation-duration: 0.01s;
    animation-delay: 0s;
  }
}
</style>
