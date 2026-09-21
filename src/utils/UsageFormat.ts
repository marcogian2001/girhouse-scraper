/** Number format for estimated spend: every list price the app knows is in US dollars. */
export const USD_FORMAT = {
  style: 'currency',
  currency: 'USD',
  // "3,40 $" rather than "3,40 USD" in Italian
  currencyDisplay: 'narrowSymbol',
} as const;

/** Number format for token counts, short enough for the sidebar. */
export const COMPACT_FORMAT = { notation: 'compact' } as const;

/**
 * Converts a stored cost to dollars.
 * @param micros The cost in millionths of a US dollar.
 * @returns The cost in US dollars.
 */
export const microsToUsd = (micros: number) => micros / 1_000_000;
