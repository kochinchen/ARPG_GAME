/**
 * 女主角的色階（每種材質 3～4 階；各面在前幾階之間交錯，暗面由光線產生）。
 * 光源固定在畫面左上：左上方的面較亮、右下方較暗。
 * 配色照設定圖：深緋紅髮、暖桃膚色、米白短上衣、棕色皮革、藍灰鋼甲、深藍灰短裙、暗紅腰布、金色扣具。
 */
/** 膚色：暖桃色 */
export const SKIN = [0xecbb9d, 0xdfab8e, 0xe6b597, 0xcd9275] as const;
export const SKIN_SHADOW = [0xab7260, 0x70423a] as const;
/** 深緋紅髮：亮面帶一點橘紅 */
export const HAIR = [0x7e2224, 0x982d2b, 0x6a1c1f, 0xb03a33, 0x561618] as const;
export const HAIR_DEEP = [0x3e1012, 0x4c1416] as const;
export const SHIRT = [0xdacbb1, 0xccbb9f, 0xd3c2a7, 0xb9a78c] as const;
export const LEATHER = [0x6e4430, 0x8a5a3c, 0x5e3a29, 0x7a4c35] as const;
export const LEATHER_DARK = [0x3c2620, 0x4a3026, 0x30201b] as const;
/** 鋼甲：偏藍的灰 */
export const METAL = [0x8695a2, 0x71808d, 0x7e8e9b, 0x586672] as const;
export const METAL_DARK = [0x47525c, 0x56626c, 0x2e353c] as const;
export const RED_CLOTH = [0x7c1e22, 0x962a2c, 0x611a1d] as const;
export const SKIRT = [0x2a2c3a, 0x363849, 0x20222c] as const;
export const BOOT = [0x5e3a26, 0x744a30, 0x4a2e1f] as const;
export const GOLD = [0xc49a48, 0xdcb660, 0xa07c34] as const;
export const BLADE = [0xe8ecf0, 0xc4cad2, 0x8e96a0, 0xb0b8c2] as const;
export const EYE = 0x2a1a18;
/** 眼白（偏暖、不要太亮）、虹膜（榛綠色：上緣深、下面較亮）、瞳孔、高光 */
export const EYE_WHITE = 0xeee4dc;
export const IRIS_DEEP = 0x3b4629;
export const IRIS = 0x6d7d45;
export const PUPIL = 0x161a12;
export const EYE_SHINE = 0xffffff;
/** 上唇較深、下唇較亮（較飽滿） */
export const LIP = 0xae5a52;
export const LIP_LOWER = 0xc67266;
