import { cn } from 'cn';

// A single static gradient id is safe here: every instance paints the same
// ramp, so a duplicate reference resolves to an identical definition.
const GRADIENT_ID = 'brand-mark-gradient';

/**
 * Renders the product mark: a rounded tile carrying a send glyph.
 * @param props Component props.
 * @param props.className Extra classes, typically a `size-*` utility.
 * @returns The brand mark as inline SVG.
 */
export const BrandMark = (props: { className?: string }) => (
  <svg viewBox="0 0 32 32" role="presentation" className={cn('size-8 shrink-0', props.className)}>
    <defs>
      <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--primary)" />
        <stop offset="100%" stopColor="var(--chart-3)" />
      </linearGradient>
    </defs>

    <rect width="32" height="32" rx="9" fill={`url(#${GRADIENT_ID})`} />

    <path d="M9 16.4 22.5 9.5 17.8 23 15.3 17.9 9 16.4Z" fill="var(--primary-foreground)" />
  </svg>
);
