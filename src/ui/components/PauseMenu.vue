<script setup lang="ts">
import { ref } from 'vue';
import type { GameView } from '../bridge/GameViewStore';
import { systemBridge } from '../bridge/SystemBridge';
import Dialog from './Dialog.vue';

defineProps<{ save: GameView['save']; devAvailable: boolean; devEnabled: boolean }>();
const emit = defineEmits<{ close: []; toggleDev: []; bestiary: [] }>();

const page = ref<'main' | 'controls'>('main');
const importInput = ref<HTMLInputElement | null>(null);

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) systemBridge.importSave(file);
}

function newCharacter() {
  if (!window.confirm('開始新角色？目前的角色與所有存檔都會被刪除，無法復原。\n\n（建議先「匯出存檔」備份）')) return;
  systemBridge.newCharacter();
}

const CONTROLS: [string, string][] = [
  ['左鍵', '移動 / 攻擊 / 撿取 / 開寶箱；按住持續'],
  ['右鍵', '依序施放目前選中的連段；按住連續施放'],
  ['Shift', '按住時原地施放：左鍵 / 右鍵朝游標出手，不會移動'],
  ['Q / W / E', '切換右鍵要施放的連段'],
  ['Space', '喝藥水（同時回復 HP 與 MP）'],
  ['C', '角色（屬性點）'],
  ['K', '怪物圖鑑（擊敗過的怪物與各樓層數值）'],
  ['T', '技能樹、連段與 Support 設定'],
  ['I', '背包與裝備（「整理」依類別、等級排列）'],
  ['Tab', '小地圖 / 全地圖（走過的地方才會顯示）'],
  ['Ctrl + 點擊', '商店開啟時：把背包物品賣給商人'],
  ['Esc', '關閉面板 / 選單（暫停）'],
];
</script>

<template>
  <Dialog :title="page === 'main' ? '選單（已暫停）' : '操作說明'">
    <template v-if="page === 'main'">
      <div class="stack">
        <button type="button" class="primary" @click="emit('close')">繼續遊戲</button>
        <button type="button" @click="emit('bestiary')">怪物圖鑑</button>
        <button type="button" @click="page = 'controls'">操作說明</button>
      </div>

      <h3>存檔</h3>
      <p class="save-status">
        <span v-if="save.error" class="error" :title="save.error">自動存檔失敗：{{ save.error }}</span>
        <span v-else-if="save.lastSavedAt">自動存檔：{{ save.lastSavedAt }}</span>
        <span v-else>尚未存檔</span>
      </p>
      <div class="row">
        <button type="button" @click="systemBridge.exportSave()">匯出存檔</button>
        <button type="button" @click="importInput?.click()">匯入存檔</button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
      </div>
      <p class="hint">遊戲會自動存檔。匯出的檔案可以在別台電腦或瀏覽器匯入。</p>

      <h3>角色</h3>
      <button type="button" class="danger" @click="newCharacter">開始新角色…</button>

      <template v-if="devAvailable">
        <h3>開發</h3>
        <label class="check"><input type="checkbox" :checked="devEnabled" @change="emit('toggleDev')" /> 顯示除錯資訊（F3）</label>
        <p class="hint">B 重置 · N 升一級 · M 生成寶箱 · J 下一層 · L 各稀有度裝備</p>
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
