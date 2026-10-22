/**
 * 女主角的色階（每種材質 3～4 階；各面在前幾階之間交錯，暗面由光線產生）。
 * 光源固定在畫面左上：左上方的面較亮、右下方較暗。
 */
/** 膚色：白皙、偏暖 */
export const SKIN = [0xf3cdb0, 0xe8bc9e, 0xefc4a8, 0xd9a084] as const;
export const SKIN_SHADOW = [0xb87e6c, 0x7a4c42] as const;
export const HAIR = [0x582821, 0x7a3a30, 0x5f2b23, 0x93493b, 0x4a221c] as const;
export const HAIR_DEEP = [0x321b18, 0x40221d] as const;
export const SCARF = [0x932c33, 0xbf4146, 0x7a2429, 0xa8353b] as const;
export const SHIRT = [0xe6ded0, 0xd8cfc0, 0xdfd6c7, 0xc8bfb0] as const;
export const LEATHER = [0x63402f, 0x8a5b42, 0x5a3a2b, 0x74493a] as const;
export const LEATHER_DARK = [0x3f2923, 0x4a3029, 0x352320] as const;
export const METAL = [0xb7bdc0, 0x9aa1a6, 0xa9b0b4, 0x7b8388] as const;
export const METAL_DARK = [0x4c5359, 0x5a6268, 0x30353a] as const;
export const RED_CLOTH = [0x7a2228, 0x932c33, 0x641f24] as const;
export const SKIRT = [0x2e2c38, 0x3a3846, 0x24222c] as const;
export const BOOT = [0x5a3a28, 0x6e4832, 0x4a2f22] as const;
export const GOLD = [0xc8a048, 0xe0bc60, 0xa88438] as const;
export const BLADE = [0xe8ecf0, 0xc4cad2, 0x8e96a0, 0xb0b8c2] as const;
export const EYE = 0x2a1a18;
/** 眼白（偏暖、不要太亮）、虹膜（上緣深藍、下面較亮）、瞳孔、高光 */
export const EYE_WHITE = 0xeee4dc;
export const IRIS_DEEP = 0x274f8a;
export const IRIS = 0x4a86c8;
export const PUPIL = 0x141c34;
export const EYE_SHINE = 0xffffff;
/** 上唇較深、下唇較亮（較飽滿） */
export const LIP = 0xb8605a;
export const LIP_LOWER = 0xd0786c;
