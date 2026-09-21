import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shows one headline number with its label and icon.
 * @param props Component props.
 * @param props.label What the number counts.
 * @param props.value The count itself.
 * @param props.icon The glyph shown in the tinted tile.
 * @returns A compact statistic card.
 */
export const StatCard = (props: { label: string; value: number; icon: React.ReactNode }) => (
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
    </CardContent>
  </Card>
);
