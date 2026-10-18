import type { GearTheme } from '../GearTheme';

/**
 * 橘 / 紅防具的專屬外觀：基底階級（1～8）、主題（決定染色、寶石、符文與形狀）、
 * extra = 覆寫該部位造型參數的欄位（HelmetSpec / ArmorSpec / GloveSpec / BootSpec / ShieldSpec，見 ArmorPieces.ts；null = 拿掉基底的零件）。
 */
export interface UniqueArmor {
  tier: number;
  themes: GearTheme[];
  extra: Record<string, unknown>;
}
