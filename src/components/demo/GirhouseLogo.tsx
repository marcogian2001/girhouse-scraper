import Image from 'next/image';

/** The logo files in `public`, black for light backgrounds and white for dark ones. */
const LOGOS = { black: '/Black.png', white: '/White.png' } as const;

/**
 * The Girhouse logo.
 * @param props Component props.
 * @param props.tone Black on light backgrounds, white on dark ones.
 * @param props.className Height classes; the width follows.
 * @returns The logo.
 */
export const GirhouseLogo = (props: { tone: keyof typeof LOGOS; className?: string }) => (
  <Image
    src={LOGOS[props.tone]}
    alt="Girhouse"
    width={2038}
    height={520}
    priority
    className={`w-auto ${props.className ?? 'h-8'}`}
  />
);
