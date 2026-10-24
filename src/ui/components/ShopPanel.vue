<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gameBridge } from '../bridge/GameBridge';
import { statDiff, type EntryView } from '../bridge/InventoryView';
import { isFinger } from '../bridge/TouchPress';
import type { ShopView } from '../bridge/ShopView';
import ItemCell from './ItemCell.vue';
import ItemTooltip from './ItemTooltip.vue';
import CoreReveal from './CoreReveal.vue';

const props = defineProps<{ view: ShopView }>();
export type ShopTab = 'buy' | 'gamble' | 'ascend' | 'fusion';
/** tab：目前分頁（觸控在鍛造 / 融合頁點兩下背包物品時，App 依分頁放進對應的格子） */
const emit = defineEmits<{ close: []; tab: [tab: ShopTab] }>();

const tab = ref<ShopTab>('buy');
watch(tab, (t) => emit('tab', t), { immediate: true });
const slotTab = ref(0);
const hovered = ref<{ entry: EntryView; price: number; compare: EntryView[]; top: number } | null>(null);

function blur(e: MouseEvent) {
  (e.currentTarget as HTMLElement).blur();
}
/**
 * 觸控：手指點貨架只選取（顯示說明、比較與差異），按說明裡的「購買」才買。滑鼠照舊點一下就買。
 * 記住貨架索引，買走或補貨後自動取消選取。
 */
const picked = ref<number | null>(null);
let fingerDown = false;
const pickedStock = computed(() => props.view.stock.find((s) => s.index === picked.value) ?? null);
const pickedDiffs = computed(() =>
  (pickedStock.value?.compare ?? []).map((c) => ({ caption: `換上後（與「${c.name}」相比，不含熔核與特殊效果）`, lines: statDiff(pickedStock.value!.entry, c) })),
);
function onPointerDown(e: PointerEvent) {
  fingerDown = isFinger(e);
}
function buy(e: MouseEvent, index: number) {
  blur(e);
  // 手指點的：已在 pointerup 選取，瀏覽器補發的 click 不買
  if (fingerDown) return;
  gameBridge.send({ type: 'ShopBuy', index });
}
function pickCard(e: PointerEvent, index: number) {
  if (isFinger(e)) picked.value = index;
}
function buyPicked() {
  if (pickedStock.value) gameBridge.send({ type: 'ShopBuy', index: pickedStock.value.index });
  picked.value = null;
}
function buyPotion(e: MouseEvent, count: number) {
  blur(e);
  gameBridge.send({ type: 'ShopBuyPotion', count });
}
function gamble(e: MouseEvent, kind: ShopView['gambleKinds'][number]['kind']) {
  blur(e);
  gameBridge.send({ type: 'ShopGamble', kind });
}
function ascend(e: MouseEvent) {
  blur(e);
  gameBridge.send({ type: 'ShopAscend' });
}
function ascendSlot(e: MouseEvent) {
  blur(e);
  gameBridge.send({ type: 'ShopAscendSlotClick' });
}
function sellHeld(e: MouseEvent) {
  blur(e);
  gameBridge.send({ type: 'ShopSellHeld' });
}
function sellTier(e: MouseEvent, t: ShopView['sellTiers'][number]) {
  blur(e);
  if (window.confirm(`賣出背包裡 ${t.count} 件${t.label}裝備，得到 ${t.gold} 金幣？`)) gameBridge.send({ type: 'ShopSellUpTo', rarity: t.rarity });
}
function reroll(e: MouseEvent, index: number) {
  blur(e);
  gameBridge.send({ type: 'ShopReroll', index });
}
function drill(e: MouseEvent) {
  blur(e);
  gameBridge.send({ type: 'ShopDrill' });
}
function fusionSlot(e: MouseEvent, zone: 'inputs' | 'jewelry', index: number) {
  blur(e);
  gameBridge.send({ type: 'ShopFusionSlotClick', zone, index });
}
function fuse(e: MouseEvent, view: ShopView) {
  blur(e);
  const p = view.fusion.preview;
  if (!p) return;
  const confirm = p.needsConfirm ? window.confirm('投入了傳奇 / 神話裝備，融合後無法復原。確定要融合嗎？') : false;
  if (p.needsConfirm && !confirm) return;
  gameBridge.send({ type: 'ShopFuse', confirm });
}
function hover(e: PointerEvent, entry: EntryView, price: number, compare: EntryView[]) {
  // 手指按下也會觸發 pointerenter：觸控改用選取，不顯示一閃即逝的說明
  if (isFinger(e)) return;
  const top = Math.min((e.currentTarget as HTMLElement).getBoundingClientRect().top, window.innerHeight - 300);
  hovered.value = { entry, price, compare, top };
}
</script>

<template>
  <aside class="panel" @pointerdown.stop="onPointerDown" @contextmenu.prevent>
    <header>
      <span>商人</span>
      <span class="gold">● {{ view.gold }}</span>
      <button type="button" class="close" aria-label="關閉" @click="emit('close')">×</button>
    </header>

    <!-- 賣出：拿著物品點這裡，或在背包 Ctrl + 點擊 -->
    <button type="button" class="sell-zone" data-drop="sell" :class="{ ready: view.heldSellPrice !== null }" :disabled="view.heldSellPrice === null" @click="sellHeld">
      <template v-if="view.heldSellPrice !== null">賣出手上的物品：+{{ view.heldSellPrice }} 金幣</template>
      <template v-else>賣出：從背包拿起物品後點這裡（或 Ctrl + 點擊背包物品）</template>
    </button>
    <div class="sell-tiers">
      <span>一鍵賣出</span>
      <button
        v-for="t in view.sellTiers"
        :key="t.rarity"
        type="button"
        class="sell-tier"
        :class="`tier-${t.rarity}`"
        :disabled="t.count === 0"
        :title="`賣出背包裡所有${t.label}裝備（${t.count} 件，+${t.gold} 金幣）`"
        @click="sellTier($event, t)"
      >
        {{ t.label }}<small>{{ t.count }} 件</small>
      </button>
    </div>

    <nav class="tabs">
      <button type="button" :class="{ on: tab === 'buy' }" @click="tab = 'buy'">購買</button>
      <button type="button" :class="{ on: tab === 'gamble' }" @click="tab = 'gamble'">賭博</button>
      <button type="button" :class="{ on: tab === 'ascend' }" @click="tab = 'ascend'">鍛造</button>
      <button type="button" :class="{ on: tab === 'fusion' }" @click="tab = 'fusion'">融合</button>
    </nav>

    <section v-if="tab === 'buy'" class="list">
      <div class="row potion-row">
        <span class="name">回復藥水</span>
        <span class="price">{{ view.potionPrice }} / 瓶</span>
        <span class="carry" :class="{ full: view.potions.count >= view.potions.max }">{{ view.potions.count }} / {{ view.potions.max }}</span>
        <button type="button" :disabled="view.gold < view.potionPrice || view.potions.count >= view.potions.max" @click="buyPotion($event, 1)">買 1</button>
        <button type="button" :disabled="view.gold < view.potionPrice * 5 || view.potions.count >= view.potions.max" @click="buyPotion($event, 5)">買 5</button>
      </div>
      <p v-if="view.stock.length === 0" class="empty">貨架已經賣完了（下一層會補貨）</p>
      <div class="stock">
        <button
          v-for="s in view.stock"
          :key="s.index"
          type="button"
          class="card"
          :class="[`r-${s.entry.rarity}`, { poor: !s.affordable, picked: picked === s.index }]"
          @click="buy($event, s.index)"
          @pointerup="pickCard($event, s.index)"
          @pointerenter="hover($event, s.entry, s.price, s.compare)"
          @pointerleave="hovered = null"
        >
          <span class="icon"><ItemCell :entry="s.entry" size="slot" /></span>
          <span class="card-name" :class="`t-${s.entry.rarity}`">{{ s.entry.name }}</span>
          <span class="card-price">● {{ s.price }}</span>
        </button>
      </div>
      <p class="note">點擊購買 · 滑鼠移上可與目前裝備比較（觸控：點一下看說明，按「購買」才買）</p>
    </section>

    <section v-else-if="tab === 'ascend'" class="list">
      <p class="note">把裝備放進鍛造格：飛昇（基底升到下一階，名稱、詞綴、主倍率與傳奇效果保留）、重鑄其中一條詞綴，或鑿孔、鑲嵌熔核。</p>
      <div class="ascend-slot-row">
        <button
          type="button"
          class="ascend-slot"
          :class="{ filled: view.ascendSlot }"
          title="拿著裝備點這裡放進去；空手點這裡拿回來"
          data-drop="ascend"
          @click="ascendSlot"
          @pointerenter="view.ascendSlot && hover($event, view.ascendSlot, 0, [])"
          @pointerleave="hovered = null"
        >
          <ItemCell v-if="view.ascendSlot" :entry="view.ascendSlot" size="slot" />
          <span v-else>鍛造格</span>
        </button>
        <span class="slot-hint">{{ view.ascendSlot ? '點鍛造格拿回裝備' : '從背包拿起裝備，點鍛造格放進去' }}</span>
      </div>
      <template v-if="view.ascend">
        <div class="ascend">
          <div class="from">
            <b>{{ view.ascend.from }}</b>
            <span>{{ view.ascend.fromStat }}</span>
          </div>
          <span class="arrow">→</span>
          <div class="to" :class="{ none: !view.ascend.to }">
            <b>{{ view.ascend.to ?? '—' }}</b>
            <span>{{ view.ascend.toStat ?? '' }}</span>
          </div>
        </div>
        <p class="note">{{ view.ascend.note }}</p>
        <ul v-if="view.ascend.to" class="costs">
          <li :class="{ short: view.gold < view.ascend.price }">金幣 {{ view.ascend.price }}（持有 {{ view.gold }}）</li>
          <li v-for="m in view.ascend.materials" :key="m.label" :class="{ short: m.have < m.need }">{{ m.label }} {{ m.need }}（持有 {{ m.have }}）</li>
        </ul>
        <button type="button" class="ascend-go" :disabled="!view.ascend.canAscend || !view.ascend.affordable" @click="ascend">飛昇</button>
        <p v-if="view.ascend.canAscend && !view.ascend.affordable" class="odds">金幣或材料不足（精華：在背包的拆解區拆裝備；飛昇碎片：擊敗樓層魔王）</p>
      </template>
      <template v-if="view.reroll">
        <h4 class="sub">詞綴重鑄<small v-if="view.reroll.rerolls > 0">（已重鑄 {{ view.reroll.rerolls }} 次）</small></h4>
        <p class="note">{{ view.reroll.note }}</p>
        <ul class="reroll">
          <li v-for="l in view.reroll.lines" :key="l.index" :class="{ strong: l.strong }">
            <span class="line">{{ l.strong ? '◆ ' : '' }}{{ l.text }}</span>
            <span v-if="l.locked" class="locked" title="紫裝名稱決定的強屬性">固定</span>
            <button v-else type="button" :disabled="!l.affordable" :title="`重鑄這一條：${l.price} 金幣`" @click="reroll($event, l.index)">● {{ l.price }}</button>
          </li>
        </ul>
      </template>
      <template v-if="view.sockets">
        <h4 class="sub">鑲嵌<small>{{ view.sockets.holes }} / {{ view.sockets.limit }} 孔</small></h4>
        <p class="note">{{ view.sockets.note }}</p>
        <ul class="sockets">
          <li v-for="c in view.sockets.cores" :key="c.index" @pointerenter="hover($event, c.entry, 0, [])" @pointerleave="hovered = null">
            <span class="line" :class="`t-${c.entry.rarity}`">◆ {{ c.entry.name }} T{{ c.entry.tier }}</span>
          </li>
          <li v-for="n in view.sockets.holes - view.sockets.cores.length" :key="`e-${n}`" class="empty-hole"><span class="line">◇ 空孔</span></li>
        </ul>
        <button v-if="view.sockets.drill" type="button" class="ascend-go" :disabled="!view.sockets.drill.affordable" @click="drill">
          鑿孔：● {{ view.sockets.drill.gold }}・防具精華 {{ view.sockets.drill.essence }}
        </button>
      </template>

    </section>

    <section v-else-if="tab === 'fusion'" class="list">
      <p class="note">把用不到的裝備（2～4 件，飾品以外）熔成熔核：武器 → 攻核、防具與盾牌 → 護核；四件同一類 = 純核（屬性多一條）。飾品區的戒指 / 護身符只提高印記機率。投入的物品會消失。</p>
      <CoreReveal v-if="view.fusion.result" :result="view.fusion.result" @dismiss="gameBridge.send({ type: 'ShopDismissFused' })" />
      <div class="fusion-grid">
        <div class="fusion-inputs">
          <button
            v-for="(f, i) in view.fusion.inputs"
            :key="i"
            type="button"
            class="ascend-slot"
            :class="{ filled: f }"
            title="拿著裝備（飾品以外）點這裡放進去；空手點這裡拿回來"
            :data-drop="`fusion:${i}`"
            @click="fusionSlot($event, 'inputs', i)"
            @pointerenter="f && hover($event, f, 0, [])"
            @pointerleave="hovered = null"
          >
            <ItemCell v-if="f" :entry="f" size="slot" />
            <span v-else>裝備</span>
          </button>
        </div>
        <div class="fusion-jewelry">
          <button
            v-for="(f, i) in view.fusion.jewelry"
            :key="i"
            type="button"
            class="ascend-slot jewel"
            :class="{ filled: f }"
            title="戒指或護身符（藍以上）：提高印記機率"
            :data-drop="`jewel:${i}`"
            @click="fusionSlot($event, 'jewelry', i)"
            @pointerenter="f && hover($event, f, 0, [])"
            @pointerleave="hovered = null"
          >
            <ItemCell v-if="f" :entry="f" size="slot" />
            <span v-else>飾品</span>
          </button>
        </div>
      </div>
      <template v-if="view.fusion.preview">
        <ul v-if="view.fusion.preview.problems.length" class="warn">
          <li v-for="p in view.fusion.preview.problems" :key="p">{{ p }}</li>
        </ul>
        <template v-if="view.fusion.preview.certain.length">
          <h4 class="sub">一定會是</h4>
          <ul class="fusion-lines">
            <li v-for="l in view.fusion.preview.certain" :key="l">{{ l }}</li>
          </ul>
          <h4 class="sub">有機會</h4>
          <ul class="fusion-lines">
            <li v-for="l in view.fusion.preview.chance" :key="l">{{ l }}</li>
          </ul>
          <h4 class="sub">鑲在哪裡（主屬性範圍）</h4>
          <nav class="slot-tabs">
            <button v-for="(s, i) in view.fusion.preview.slots" :key="s.label" type="button" :class="{ on: slotTab === i }" @click="slotTab = i">{{ s.label.replace('鑲', '') }}</button>
          </nav>
          <ul class="fusion-lines">
            <li v-for="l in view.fusion.preview.slots[slotTab]?.lines ?? []" :key="l">{{ l }}</li>
          </ul>
        </template>
        <ul v-if="view.fusion.preview.warnings.length" class="warn">
          <li v-for="w in view.fusion.preview.warnings" :key="w">⚠ {{ w }}</li>
        </ul>
        <ul class="costs">
          <li :class="{ short: view.fusion.preview.cost.haveGold < view.fusion.preview.cost.gold }">金幣 {{ view.fusion.preview.cost.gold }}（持有 {{ view.fusion.preview.cost.haveGold }}）</li>
          <li v-for="m in view.fusion.preview.cost.materials" :key="m.label" :class="{ short: m.have < m.need }">{{ m.label }} {{ m.need }}（持有 {{ m.have }}）</li>
        </ul>
        <button type="button" class="ascend-go" :disabled="!view.fusion.preview.canFuse" @click="fuse($event, view)">融合</button>
      </template>
      <p v-else class="empty">從背包拿起裝備（飾品以外），點上面的格子放進去。</p>
    </section>

    <section v-else class="list">
      <p class="note">選一種裝備，付 {{ view.gamblePrice }} 金幣換一件隨機稀有度的物品（武器可以指定劍、斧、弓或法杖）。</p>
      <div class="gamble-grid">
        <button
          v-for="g in view.gambleKinds"
          :key="g.kind"
          type="button"
          class="gamble"
          :disabled="view.gold < view.gamblePrice"
          @click="gamble($event, g.kind)"
        >
          <span class="gamble-glyph">{{ g.glyph }}</span>
          <span>{{ g.label }}</span>
        </button>
      </div>
      <p class="odds">{{ view.gambleOdds }}</p>
    </section>

    <!-- 觸控：選取的貨架物品，顯示在右欄（蓋在背包上），按「購買」才買 -->
    <div v-if="pickedStock && tab === 'buy'" class="picked-tips" @pointerdown.stop>
      <ItemTooltip v-for="(c, i) in pickedStock.compare" :key="i" :entry="c" caption="目前裝備" />
      <ItemTooltip :entry="pickedStock.entry" :price="pickedStock.price" :diffs="pickedDiffs" />
      <div class="picked-actions">
        <button type="button" class="buy-go" :disabled="!pickedStock.affordable" @click="buyPicked">
          {{ pickedStock.affordable ? `購買 ● ${pickedStock.price}` : `金幣不足（● ${pickedStock.price}）` }}
        </button>
        <button type="button" class="buy-cancel" @click="picked = null">取消</button>
      </div>
    </div>

    <div v-if="hovered" class="tooltip-anchor" :style="{ top: `${hovered.top}px` }">
      <ItemTooltip :entry="hovered.entry" :price="hovered.price" />
      <ItemTooltip v-for="(c, i) in hovered.compare" :key="i" :entry="c" caption="目前裝備" />
    </div>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  left: 12px;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  pointer-events: auto;
  font: 13px/1.5 sans-serif;
  color: #d8cbb4;
  background: rgb(12 10 9 / 95%);
  border: 1px solid #8a6a3a;
  box-shadow: 0 6px 24px rgb(0 0 0 / 60%);
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #e8c47a;
  background: #1a1612;
  border-bottom: 1px solid #3d342c;
}
.gold {
  margin-left: auto;
  font-family: ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.close {
  font-size: 18px;
  line-height: 1;
  color: #b8ab94;
  background: none;
  border: 0;
  cursor: pointer;
}
button {
  font: inherit;
  color: #d8cbb4;
  cursor: pointer;
  background: #2a231d;
  border: 1px solid #5a4c3e;
}
button:hover:not(:disabled) {
  border-color: #e8c47a;
}
button:disabled {
  cursor: default;
  opacity: 0.45;
}
.sell-zone {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px 4px;
  padding: 10px 8px;
  font-size: 12px;
  color: #8a7c68;
  border-style: dashed;
}
.sell-zone.ready {
  color: #f2e2b8;
  border-color: #c8a25a;
  background: #3a2c18;
}
.ascend {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 4px 0 8px;
}
.ascend .from,
.ascend .to {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 6px 8px;
  font-size: 12px;
  background: #1c1713;
  border: 1px solid #3d342c;
}
.ascend .to {
  border-color: #c8a25a;
}
.ascend .to.none {
  border-color: #3d342c;
  opacity: 0.5;
}
.ascend b {
  color: #f0e2c0;
}
.arrow {
  color: #e8c47a;
}
.ascend-slot-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 6px 0 8px;
}
.ascend-slot {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  justify-content: center;
  height: 52px;
  font-size: 11px;
  color: #8a7c68;
  cursor: pointer;
  background: #15120f;
  border: 1px dashed #c8a25a;
}
.ascend-slot.filled {
  border-style: solid;
}
.slot-hint {
  font-size: 11px;
  color: #8a7c68;
}
.costs {
  margin: 0 0 8px;
  padding: 0 0 0 16px;
  font-size: 12px;
  color: #7ad8ff;
}
.costs li.short {
  color: #ff8a7a;
}
.ascend-go {
  width: 100%;
  padding: 8px;
  color: #f2e2b8;
  border-color: #c8a25a;
}
.sell-tiers {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 8px;
  font-size: 12px;
  color: #a89880;
}
.sell-tier {
  flex: 1;
  display: grid;
  padding: 4px 2px;
  font: inherit;
  font-size: 12px;
  color: #d8cbb4;
  cursor: pointer;
  background: #1f1a15;
  border: 1px solid #5a4632;
}
.sell-tier small {
  color: #a89880;
  font-size: 11px;
}
.sell-tier.tier-magic {
  border-color: #6f8dff;
}
.sell-tier.tier-rare {
  border-color: #f2d24b;
}
.sell-tier:disabled {
  opacity: 0.4;
  cursor: default;
}
.sub {
  margin: 14px 0 2px;
  font-size: 13px;
  color: #e8c47a;
}
.sub small {
  margin-left: 6px;
  font-weight: normal;
  color: #a89880;
}
.reroll {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}
.reroll li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.reroll .line {
  flex: 1;
}
.reroll li.strong .line {
  color: #e8a050;
}
.reroll button {
  font: inherit;
  font-size: 12px;
  padding: 2px 8px;
  color: #e8c47a;
  cursor: pointer;
  background: #2a2016;
  border: 1px solid #8a6a3a;
}
.reroll button:disabled {
  opacity: 0.45;
  cursor: default;
}
.reroll .locked {
  font-size: 11px;
  color: #7d6e5c;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 6px 12px 0;
  border-bottom: 1px solid #3d342c;
}
.tabs button {
  padding: 3px 14px;
  border-bottom: 0;
}
.tabs button.on {
  color: #f2e2b8;
  border-color: #c8a25a;
  background: #3a2c18;
}
.list {
  padding: 8px 12px 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  margin-bottom: 4px;
  text-align: left;
}
.potion-row {
  background: transparent;
  border: 0;
}
.carry {
  font-size: 11px;
  color: #8a7c68;
}
.carry.full {
  color: #e8a05a;
}
.potion-row button {
  padding: 1px 8px;
}
.name {
  flex: 1;
}
.price {
  font-family: ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.r-normal {
  color: #e8e2d4;
}
.r-magic {
  color: #8aa2ff;
}
.r-rare {
  color: #f2d24b;
}
.r-epic {
  color: #b98cff;
}
.r-legendary {
  color: #ff9a3c;
}
.r-mythic {
  color: #ff4d4d;
}
.note,
.empty {
  margin: 0 0 8px;
  font-size: 12px;
  color: #8a7c68;
}
.gamble-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.gamble-grid button {
  padding: 8px 0;
}
.sockets {
  margin: 4px 0 8px;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}
.sockets li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sockets .line {
  flex: 1;
}
.sockets button {
  font-size: 11px;
  padding: 1px 6px;
}
.empty-hole {
  color: #6a5e4e;
}
.core-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.core-glyph {
  font-size: 22px;
  line-height: 1;
}
.fusion-grid {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
.fusion-inputs {
  display: grid;
  grid-template-columns: repeat(2, 52px);
  gap: 6px;
}
.fusion-jewelry {
  display: grid;
  gap: 6px;
}
.ascend-slot.jewel {
  border-color: #7ad8ff;
}
.fusion-lines {
  margin: 2px 0 6px;
  padding: 0 0 0 16px;
  font-size: 12px;
}
.warn {
  margin: 6px 0;
  padding: 0 0 0 16px;
  font-size: 12px;
  color: #ff9a7a;
}
.slot-tabs {
  display: flex;
  gap: 3px;
  margin: 2px 0 4px;
}
.slot-tabs button {
  flex: 1;
  padding: 1px 0;
  font-size: 11px;
}
.slot-tabs button.on {
  color: #f2e2b8;
  border-color: #c8a25a;
  background: #3a2c18;
}
.card.picked {
  outline: 2px solid #f0e2c0;
  outline-offset: -2px;
}
/* 觸控：右欄（背包的位置，右邊讓出選單列） */
.picked-tips {
  position: fixed;
  top: 12px;
  right: 88px;
  z-index: 2;
  width: calc((100vw - 108px) / 2);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  padding: 8px;
  background: rgb(0 0 0 / 70%);
  border: 1px solid #5c5045;
}
.picked-tips :deep(.tooltip) {
  flex: 1 1 0;
  min-width: 180px;
  max-width: none;
}
.picked-actions {
  display: flex;
  flex: 1 1 100%;
  gap: 8px;
}
.buy-go,
.buy-cancel {
  height: 44px;
  font: 15px/1 sans-serif;
  cursor: pointer;
  border: 1px solid #5a4c3e;
}
.buy-go {
  flex: 2;
  color: #f2e2b8;
  background: #3a2c18;
  border-color: #c8a25a;
}
.buy-go:disabled {
  color: #8a7c68;
  background: #1c1713;
  border-color: #3d342c;
}
.buy-cancel {
  flex: 1;
  color: #b8ab94;
  background: #1c1713;
}
.tooltip-anchor {
  position: fixed;
  left: min(340px, calc(100vw - 480px));
  display: flex;
  gap: 6px;
  align-items: flex-start;
  pointer-events: none;
}
.stock {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 6px;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  background: #1c1713;
}
.card .icon {
  width: 38px;
  height: 38px;
}
.card.r-magic {
  border-color: #3e56b0;
}
.card.r-rare {
  border-color: #a8902a;
}
.card.r-epic {
  border-color: #6a3cb0;
}
.card.r-legendary {
  border-color: #b0621e;
}
.card.r-mythic {
  border-color: #b02a2a;
}
.card-name {
  font-size: 11px;
  line-height: 1.3;
  text-align: center;
}
.card-price {
  font: 12px/1 ui-monospace, Menlo, monospace;
  color: #e8c47a;
}
.card.poor .card-price {
  color: #b85a4a;
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
.t-mythic {
  color: #ff4d4d;
}
.gamble {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.gamble-glyph {
  font: 20px/1.2 serif;
  color: #c8a25a;
}
.odds {
  margin: 8px 0 0;
  font-size: 11px;
  color: #8a7c68;
  text-align: center;
}
</style>
