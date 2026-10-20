/** The navy of the giraffe's suit, used when a business has no colour of its own. */
export const DEFAULT_BRAND_COLOR = '#24336b';

/**
 * Normalises a CSS hex colour.
 * @param value A colour such as `#abc` or `#AABBCC`.
 * @returns The colour as lowercase six-digit hex, or null when it is not a hex colour.
 */
export const normalizeHex = (value: string | null | undefined) => {
  const match = value?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);

  if (!match?.[1]) {
    return null;
  }

  const digits =
    match[1].length === 3 ? match[1].replaceAll(/./gu, (digit) => digit + digit) : match[1];

  return `#${digits.toLowerCase()}`;
};

/**
 * Writes red, green and blue channels as a hex colour.
 * @param rgb The channels, from 0 to 255.
 * @param rgb.r Red.
 * @param rgb.g Green.
 * @param rgb.b Blue.
 * @returns The lowercase six-digit hex colour.
 */
export const rgbToHex = (rgb: { r: number; g: number; b: number }) =>
  `#${[rgb.r, rgb.g, rgb.b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

/**
 * Reads a hex colour's channels.
 * @param hex A six-digit hex colour.
 * @returns The channels, from 0 to 1.
 */
const toChannels = (hex: string) =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);

/**
 * Tells whether a colour can tint a page: not near white, near black or grey.
 * @param hex A six-digit hex colour.
 * @returns True for a colour with enough presence.
 */
export const isUsableBrandColor = (hex: string) => {
  const channels = toChannels(hex);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));

  return lightness > 0.12 && lightness < 0.88 && saturation > 0.2;
};

/**
 * Picks the text colour that reads on a background.
 * @param hex The six-digit hex background.
 * @returns Near-black on light backgrounds, white on dark ones.
 */
export const readableTextColor = (hex: string) => {
  const [r = 0, g = 0, b = 0] = toChannels(hex).map((channel) =>
    channel <= 0.04 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#ffffff';
};
