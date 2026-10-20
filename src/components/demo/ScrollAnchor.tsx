/**
 * Scrolls the anchor into view, just enough to clear Gigi's bar at the bottom.
 * @param anchor The anchor, or null when it unmounts.
 */
const scrollToAnchor = (anchor: HTMLSpanElement | null) => {
  anchor?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
};

/**
 * An invisible mark that scrolls itself into view when it mounts, so what a scene just
 * revealed is never left off screen or under Gigi's bar. Give it a new `key` to scroll again.
 * @param props Component props.
 * @param props.className Position and size classes, for a mark placed over the revealed part.
 * @param props.style Inline position, for a mark that follows something moving.
 * @returns The anchor.
 */
export const ScrollAnchor = (props: { className?: string; style?: React.CSSProperties }) => (
  <span
    ref={scrollToAnchor}
    aria-hidden
    className={`pointer-events-none block scroll-mt-16 scroll-mb-[calc(var(--demo-bar-h,12rem)+1rem)] ${props.className ?? ''}`}
    style={props.style}
  />
);
