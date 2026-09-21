import { cn } from 'cn';
import Image from 'next/image';

/**
 * Renders the product mark from the favicon artwork in `public`.
 * @param props Component props.
 * @param props.className Extra classes, typically a `size-*` utility.
 * @returns The brand mark as an image.
 */
export const BrandMark = (props: { className?: string }) => (
  <Image
    src="/Favicon.svg"
    alt=""
    width={32}
    height={32}
    className={cn('size-8 shrink-0', props.className)}
  />
);
