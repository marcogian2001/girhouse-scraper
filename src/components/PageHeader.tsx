/**
 * Opens a dashboard page with its title, an optional one-line description and its actions.
 * @param props Component props.
 * @param props.title The page title, rendered as the page's only `h1`.
 * @param props.description Optional supporting line under the title.
 * @param props.actions Optional buttons, aligned to the right on wide screens.
 * @returns The page header row.
 */
export const PageHeader = (props: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
    <div className="min-w-0 space-y-1">
      <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
      {props.description && <p className="text-sm text-muted-foreground">{props.description}</p>}
    </div>

    {props.actions && <div className="flex flex-wrap items-center gap-2">{props.actions}</div>}
  </div>
);
