import { cn } from 'cn';

/**
 * Frames a table, or the row list that replaces it on phones, with a border.
 * @param props Component props.
 * @param props.className Extra classes, typically a responsive `hidden`/`block` pair.
 * @param props.children The table or list.
 * @returns The bordered container.
 */
export const TableFrame = (props: { className?: string; children: React.ReactNode }) => (
  <div className={cn('overflow-hidden rounded-lg border bg-card', props.className)}>
    {props.children}
  </div>
);
