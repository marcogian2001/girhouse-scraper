/**
 * The label over an example scene, always on one line: smaller on a phone, cut short if
 * it still does not fit.
 * @param props Component props.
 * @param props.children The label.
 * @param props.toneClassName Its colours, the demo's own unless given.
 * @returns The label.
 */
export const SceneLabel = (props: { children: React.ReactNode; toneClassName?: string }) => (
  <p
    className={`mx-auto w-fit max-w-full truncate rounded-full px-3 py-1 text-center text-[11px] font-semibold whitespace-nowrap shadow transition-colors sm:px-4 sm:py-1.5 sm:text-sm ${props.toneClassName ?? 'bg-(--demo-primary) text-(--demo-on-primary)'}`}
  >
    {props.children}
  </p>
);
