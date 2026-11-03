/**
 * The label over an example scene, always on one line: smaller on a phone, cut short if
 * it still does not fit.
 * @param props Component props.
 * @param props.children The label.
 * @returns The label.
 */
export const SceneLabel = (props: { children: React.ReactNode }) => (
  <p className="mx-auto w-fit max-w-full truncate rounded-full bg-(--demo-primary) px-3 py-1 text-center text-[11px] font-semibold whitespace-nowrap text-(--demo-on-primary) shadow sm:px-4 sm:py-1.5 sm:text-sm">
    {props.children}
  </p>
);
