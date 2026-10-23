import { cn } from 'cn';

/**
 * Frames a table, or the row list that replaces it on phones, with a border.
 * Isolated, so sticky headers and columns inside stack above their rows but never above
 * the sidebar or the top bar.
 * @param props Component props.
 * @param props.className Extra classes, typically a responsive `hidden`/`block` pair.
 * @param props.children The table or list.
 * @returns The bordered container.
 */
export const TableFrame = (props: { className?: string; children: React.ReactNode }) => (
  <div className={cn('isolate overflow-hidden rounded-lg border bg-card', props.className)}>
    {props.children}
  </div>
);
