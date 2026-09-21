import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shows one headline number with its label and icon.
 * @param props Component props.
 * @param props.label What the number counts.
 * @param props.value The number itself, raw or already formatted.
 * @param props.icon The glyph shown in the tinted tile.
 * @param props.description Optional detail shown under the number.
 * @returns A compact statistic card.
 */
export const StatCard = (props: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}) => (
  <Card size="sm">
    <CardHeader>
      <CardTitle className="text-sm font-normal text-muted-foreground">{props.label}</CardTitle>

      <CardAction>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {props.icon}
        </span>
      </CardAction>
    </CardHeader>

    <CardContent>
      <p className="text-3xl font-semibold tabular-nums">{props.value}</p>
      {props.description && (
        <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
      )}
    </CardContent>
  </Card>
);
