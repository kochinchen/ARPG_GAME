<script setup lang="ts">
import { ref } from 'vue';
import type { GameView } from '../bridge/GameViewStore';
import { systemBridge } from '../bridge/SystemBridge';
import { audioBridge, volume, type VolumeState } from '../bridge/AudioBridge';
import Dialog from './Dialog.vue';

defineProps<{ save: GameView['save']; devAvailable: boolean; devEnabled: boolean }>();
const emit = defineEmits<{ close: []; toggleDev: []; bestiary: []; items: [] }>();

const page = ref<'main' | 'controls'>('main');
const importInput = ref<HTMLInputElement | null>(null);

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) systemBridge.importSave(file);
}

const saving = ref(false);
const savedMessage = ref('');
async function saveNow() {
  saving.value = true;
  const ok = await systemBridge.saveNow();
  saving.value = false;
  savedMessage.value = ok ? '已儲存' : '現在無法存檔（倒地中），稍後再試';
  window.setTimeout(() => (savedMessage.value = ''), 2500);
}

function returnToTitle() {
  if (!window.confirm('儲存並返回標題畫面？')) return;
  systemBridge.returnToTitle();
}

function quitGame() {
  if (!window.confirm('儲存並離開遊戲？')) return;
  systemBridge.quitGame();
}

type Channel = Exclude<keyof VolumeState, 'muted'>;
const CHANNELS: [Channel, string][] = [
  ['master', '主音量'],
  ['music', '背景音樂'],
  ['sfx', '音效'],
];
function onVolume(channel: Channel, e: Event) {
  audioBridge.set({ [channel]: Number((e.target as HTMLInputElement).value) / 100 });
}

const CONTROLS: [string, string][] = [
  ['左鍵', '移動 / 攻擊 / 撿取 / 開寶箱；按住持續'],
  ['右鍵', '依序施放目前選中的連段；按住連續施放'],
  ['Shift', '按住時原地施放：左鍵 / 右鍵朝游標出手，不會移動'],
  ['Q / W / E', '切換右鍵要施放的連段'],
  ['Space', '喝藥水（同時回復 HP 與 MP）'],
  ['C', '角色（屬性點）'],
  ['K', '怪物圖鑑（擊敗過的怪物與各樓層數值）'],
  ['O', '裝備圖鑑（白色基底、橘・傳奇、紅・神話）'],
  ['T', '技能樹、連段與 Support 設定'],
  ['I', '背包與裝備（「整理」依類別、等級排列）'],
  ['Tab', '小地圖 / 全地圖（走過的地方才會顯示）'],
  ['Ctrl + 點擊', '商店開啟時：把背包物品賣給商人'],
  ['拆解區', '背包中：拿著裝備點拆解區的格子放進去，按「拆掉」換成精華（飛昇用）'],
  ['Esc', '關閉面板 / 選單（暫停）'],
];
</script>

<template>
  <Dialog :title="page === 'main' ? '選單（已暫停）' : '操作說明'">
    <template v-if="page === 'main'">
      <div class="stack">
        <button type="button" class="primary" @click="emit('close')">繼續遊戲</button>
        <button type="button" @click="emit('bestiary')">怪物圖鑑</button>
        <button type="button" @click="emit('items')">裝備圖鑑</button>
        <button type="button" @click="page = 'controls'">操作說明</button>
      </div>

      <h3>音量</h3>
      <div v-for="[key, label] in CHANNELS" :key="key" class="volume">
        <span class="volume-label">{{ label }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="Math.round(volume[key] * 100)"
          :disabled="volume.muted"
          :aria-label="label"
          @input="onVolume(key, $event)"
          @change="key !== 'music' && audioBridge.preview()"
        />
        <span class="volume-value">{{ Math.round(volume[key] * 100) }}</span>
      </div>
      <label class="check"><input type="checkbox" :checked="volume.muted" @change="audioBridge.set({ muted: !volume.muted })" /> 靜音</label>

      <h3>存檔（欄位 {{ save.slot }}）</h3>
      <p class="save-status">
        <span v-if="save.error" class="error" :title="save.error">自動存檔失敗：{{ save.error }}</span>
        <span v-else-if="save.lastSavedAt">自動存檔：{{ save.lastSavedAt }}</span>
        <span v-else>尚未存檔</span>
      </p>
      <div class="row">
        <button type="button" class="primary" :disabled="saving" @click="saveNow">儲存遊戲</button>
        <span v-if="savedMessage" class="saved">{{ savedMessage }}</span>
      </div>
      <div class="row">
        <button type="button" @click="systemBridge.exportSave()">匯出存檔</button>
        <button type="button" @click="importInput?.click()">匯入存檔</button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
      </div>
      <p class="hint">遊戲會自動存檔。匯出的檔案可以在別台電腦或瀏覽器匯入。</p>

      <h3>遊戲</h3>
      <div class="row">
        <button type="button" @click="returnToTitle">返回標題畫面</button>
        <button type="button" class="danger" @click="quitGame">離開遊戲</button>
      </div>

      <template v-if="devAvailable">
        <h3>開發</h3>
        <label class="check"><input type="checkbox" :checked="devEnabled" @change="emit('toggleDev')" /> 顯示除錯資訊（F3）</label>
        <p class="hint">B 重置 · N 升一級 · M 生成寶箱 · J 下一層 · L 各稀有度裝備 · Shift+L 橘紅裝</p>
      </template>
    </template>

    <template v-else>
      <table>
        <tr v-for="[key, action] in CONTROLS" :key="key">
          <th>{{ key }}</th>
          <td>{{ action }}</td>
        </tr>
      </table>
      <p class="hint">也可以直接點畫面上的技能欄、藥水與右下角的按鈕。</p>
      <button type="button" @click="page = 'main'">返回</button>
    </template>
  </Dialog>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
h3 {
  margin: 16px 0 6px;
  font: 12px/1.4 sans-serif;
  letter-spacing: 0.1em;
  color: #8a7c68;
  border-bottom: 1px solid #2a231d;
}
.row {
  display: flex;
  gap: 8px;
}
.row + .row {
  margin-top: 6px;
}
.saved {
  align-self: center;
  font-size: 12px;
  color: #7fe07f;
}
.save-status {
  margin: 0 0 6px;
}
.error {
  color: #ff7b6b;
}
.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #8a7c68;
}
.volume {
  display: grid;
  grid-template-columns: 72px 1fr 32px;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.volume input {
  width: 100%;
  accent-color: #c89a4a;
  cursor: pointer;
}
.volume-value {
  font-size: 12px;
  color: #8a7c68;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
table {
  width: 100%;
  margin-bottom: 10px;
  border-collapse: collapse;
}
th {
  width: 84px;
  padding: 3px 8px 3px 0;
  color: #e8c47a;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}
td {
  padding: 3px 0;
}
</style>
