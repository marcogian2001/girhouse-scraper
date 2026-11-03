/** Where the demo link goes until demo pages exist; an email holding it is never sent. */
export const DEMO_LINK_PLACEHOLDER = '{{link_demo}}';

/** Where the two free call times go; the platform fills them from the calendar, never the writer. */
export const SLOTS_PLACEHOLDER = '{{orari}}';

/** Every rule `checkReply` can report. */
export const REPLY_ISSUES = [
  'too_long',
  'too_short',
  'link',
  'demo_link_missing',
  'slots_missing',
  'unknown_price',
] as const;

/** Greeting and signature lines come on top of the 3 to 6 lines of the body. */
const MAX_LINES = 8;

const MAX_WORDS = 120;

/**
 * Removes the dashes the writing rules forbid: a range keeps a hyphen, anything else becomes a comma.
 * @param body The generated body.
 * @returns The body without em or en dashes.
 */
export const cleanReply = (body: string) =>
  body
    .replaceAll(/(\d)\s*[–—]\s*(\d)/gu, '$1-$2')
    .replaceAll(/\s*[–—]\s*/gu, ', ')
    .trim();

/**
 * Checks a reply against the writing rules a model can get wrong.
 * @param options The check inputs.
 * @param options.body The reply body, already cleaned.
 * @param options.prices The only euro amounts the reply may quote.
 * @param options.allowedLinks Links the reply may contain, such as the lead's demo page.
 * @returns The broken rules, empty when the reply can go out.
 */
export const checkReply = (options: {
  body: string;
  prices: number[];
  allowedLinks?: string[];
}) => {
  const issues = new Set<string>();
  const lines = options.body.split('\n').filter((line) => line.trim());
  const words = options.body.split(/\s+/u).filter(Boolean);

  if (lines.length > MAX_LINES || words.length > MAX_WORDS) {
    issues.add('too_long');
  }

  if (lines.length < 2) {
    issues.add('too_short');
  }

  const links = options.body.match(/(?:https?:\/\/|www\.)\S+/giu) ?? [];
  const allowed = new Set(options.allowedLinks);

  if (links.some((link) => !allowed.has(link.replace(/[.,;:!?)]+$/u, '')))) {
    issues.add('link');
  }

  if (options.body.includes(DEMO_LINK_PLACEHOLDER)) {
    issues.add('demo_link_missing');
  }

  if (options.body.includes(SLOTS_PLACEHOLDER)) {
    issues.add('slots_missing');
  }

  const amounts = [
    ...options.body.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:€|euro)|€\s*(\d+(?:[.,]\d+)?)/giu),
  ].map((match) => Number((match[1] ?? match[2] ?? '').replace(',', '.')));

  if (amounts.some((amount) => !options.prices.includes(amount))) {
    issues.add('unknown_price');
  }

  return [...issues];
};

/**
 * Lists the forms of a demo link an email may carry: the page itself, a step of it, or one
 * of its two versions.
 * @param demoUrl The lead's demo page.
 * @param steps How many steps the demo has.
 * @returns The links.
 */
export const demoLinkVariants = (demoUrl: string, steps: number) => [
  demoUrl,
  ...Array.from({ length: steps }, (_unused, index) => `${demoUrl}?passo=${index + 1}`),
  `${demoUrl}?versione=a`,
  `${demoUrl}?versione=b`,
];

/**
 * Puts the demo link where the writer left the placeholder.
 * @param body The reply body.
 * @param demoUrl The lead's demo page.
 * @returns The body with every placeholder replaced.
 */
export const fillDemoLink = (body: string, demoUrl: string) =>
  body.replaceAll(DEMO_LINK_PLACEHOLDER, demoUrl);

/**
 * Puts the free call times where the writer left their placeholder.
 * @param body The reply body.
 * @param slots The times in words, such as "martedì 20 ottobre alle 9:00 oppure ...".
 * @returns The body with every placeholder replaced.
 */
export const fillSlots = (body: string, slots: string) => body.replaceAll(SLOTS_PLACEHOLDER, slots);
