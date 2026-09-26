import { migrate } from './migrations';
import { SAVE_VERSION, SaveDataSchema, type SaveData } from './schema';
import { sha256 } from './sha256';

/**
 * 存檔外層信封：版本、時間、Checksum 與 JSON 內容。
 * Checksum 只用來偵測損毀與半份寫入，不是防作弊（單機存檔在玩家電腦上，無法真正防止修改）。
 */
export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: string;
  checksum: string;
  payload: string;
}

export function encodeSave(data: SaveData, savedAt: Date): string {
  const payload = JSON.stringify(data);
  const envelope: SaveEnvelope = { schemaVersion: SAVE_VERSION, savedAt: savedAt.toISOString(), checksum: sha256(payload), payload };
  return JSON.stringify(envelope);
}

export type DecodeResult =
  | { ok: true; data: SaveData; savedAt: string; schemaVersion: number }
  | { ok: false; reason: 'format' | 'checksum' | 'migration' | 'schema'; message: string; savedAt?: string };

/** 信封格式 → Checksum → Migration → Schema；任何一步失敗都回傳原因，不丟例外 */
export function decodeSave(text: string): DecodeResult {
  let envelope: SaveEnvelope;
  try {
    envelope = JSON.parse(text) as SaveEnvelope;
  } catch {
    return { ok: false, reason: 'format', message: '不是有效的 JSON' };
  }
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    typeof envelope.payload !== 'string' ||
    typeof envelope.checksum !== 'string' ||
    typeof envelope.schemaVersion !== 'number' ||
    typeof envelope.savedAt !== 'string'
  ) {
    return { ok: false, reason: 'format', message: '缺少存檔信封欄位' };
  }
  const { savedAt } = envelope;
  if (sha256(envelope.payload) !== envelope.checksum) return { ok: false, reason: 'checksum', message: 'Checksum 不符', savedAt };

  let migrated: unknown;
  try {
    migrated = migrate(JSON.parse(envelope.payload), envelope.schemaVersion);
  } catch (error) {
    return { ok: false, reason: 'migration', message: error instanceof Error ? error.message : String(error), savedAt };
  }
  const parsed = SaveDataSchema.safeParse(migrated);
  if (!parsed.success) return { ok: false, reason: 'schema', message: parsed.error.message, savedAt };
  return { ok: true, data: parsed.data, savedAt, schemaVersion: envelope.schemaVersion };
}
