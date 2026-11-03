/** What the first month costs in version C, the first step of the price ladder. */
export const VIDEO_FIRST_MONTH_PRICE = 47;

/** The basics Gigi says one could set up alone, in the order he names them. */
export type DiyKey = 'seo' | 'analytics' | 'blog' | 'console' | 'profile' | 'consistent' | 'tool';

/** What each basic costs done alone, in euros: once, or each month. */
export const DIY_COSTS: Record<DiyKey, { once?: number; monthly?: number }> = {
  seo: { once: 1000 },
  analytics: { once: 200 },
  blog: { monthly: 150 },
  console: { once: 100 },
  profile: { once: 150 },
  consistent: {},
  tool: { monthly: 100 },
};

/**
 * Works out the first year: everything done alone against Girhouse, 47 € the first month
 * and the monthly price after.
 * @param price Girhouse's monthly price.
 * @returns Both totals and what the business keeps, rounded down to the hundred.
 */
export const firstYearSaving = (price: number) => {
  const costs = Object.values(DIY_COSTS);
  const alone =
    costs.reduce((sum, cost) => sum + (cost.once ?? 0), 0) +
    12 * costs.reduce((sum, cost) => sum + (cost.monthly ?? 0), 0);
  const withUs = VIDEO_FIRST_MONTH_PRICE + 11 * price;

  return { alone, withUs, saving: Math.floor((alone - withUs) / 100) * 100 };
};
