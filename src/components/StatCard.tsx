import { Card, CardContent } from '@/components/ui/card';

/**
 * Shows one headline number with its label and an optional glyph.
 * @param props Component props.
 * @param props.label What the number counts.
 * @param props.value The number itself, raw or already formatted.
 * @param props.icon Optional glyph shown in muted gray next to the label.
 * @param props.description Optional detail shown under the number.
 * @returns A compact statistic card.
 */
export const StatCard = (props: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
}) => (
  <Card size="sm">
    <CardContent className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {props.icon}
        {props.label}
      </p>

      <p className="text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>

      {props.description && <p className="text-xs text-muted-foreground">{props.description}</p>}
    </CardContent>
  </Card>
);
