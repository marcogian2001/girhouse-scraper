import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/**
 * Explains why a list is empty and offers the next step.
 * @param props Component props.
 * @param props.icon A glyph for what the list holds, shown in a neutral tile.
 * @param props.title What is missing.
 * @param props.description Why it matters or how to get started.
 * @param props.action Optional call to action, usually a button.
 * @returns A bordered empty block.
 */
export const EmptyState = (props: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <Empty className="rounded-lg border bg-card">
    <EmptyHeader>
      <EmptyMedia variant="icon" className="size-10 border bg-background text-muted-foreground">
        {props.icon}
      </EmptyMedia>

      <EmptyTitle>{props.title}</EmptyTitle>
      {props.description && <EmptyDescription>{props.description}</EmptyDescription>}
    </EmptyHeader>

    {props.action && <EmptyContent>{props.action}</EmptyContent>}
  </Empty>
);
