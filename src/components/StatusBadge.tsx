import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { campaignSchema, contactSchema } from '@/models/Schema';

type CampaignStatus = (typeof campaignSchema.$inferSelect)['status'];
type ContactStatus = (typeof contactSchema.$inferSelect)['status'];

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  draft: 'neutral',
  enriching: 'info',
  writing: 'info',
  review: 'warning',
  pushing: 'info',
  pushed: 'success',
  failed: 'danger',
};

const CONTACT_TONE: Record<ContactStatus, Tone> = {
  pending: 'neutral',
  enriching: 'info',
  enriched: 'info',
  writing: 'info',
  ready: 'warning',
  approved: 'success',
  failed: 'danger',
};

// Mirrors the `bg-destructive/10 text-destructive` idiom the shadcn components ship with
const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  danger: 'bg-destructive/10 text-destructive',
};

type StatusBadgeProps =
  | { kind: 'campaign'; status: CampaignStatus }
  | { kind: 'contact'; status: ContactStatus };

/**
 * Shows a campaign or contact status as a tinted pill.
 * @param props Component props.
 * @param props.kind Which status vocabulary the value belongs to.
 * @param props.status The status to label.
 * @returns A badge carrying the translated status and its tone.
 */
export const StatusBadge = (props: StatusBadgeProps) => {
  const campaignT = useTranslations('CampaignStatus');
  const contactT = useTranslations('ContactStatus');

  const tone = props.kind === 'campaign' ? CAMPAIGN_TONE[props.status] : CONTACT_TONE[props.status];

  const label =
    props.kind === 'campaign'
      ? campaignT(`status_${props.status}`)
      : contactT(`status_${props.status}`);

  return (
    <Badge variant="ghost" className={TONE_CLASS[tone]}>
      {label}
    </Badge>
  );
};
