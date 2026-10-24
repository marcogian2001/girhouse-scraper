import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type {
  campaignSchema,
  contactSchema,
  leadSchema,
  leadSearchSchema,
  outboundEmailSchema,
} from '@/models/Schema';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import type { ReplyStatus } from '@/utils/ReplyStatus';

type CampaignStatus = (typeof campaignSchema.$inferSelect)['status'];
type ContactStatus = (typeof contactSchema.$inferSelect)['status'];
type LeadSearchStatus = (typeof leadSearchSchema.$inferSelect)['status'];
type LeadStatus = (typeof leadSchema.$inferSelect)['status'];

type OutboundStatus = (typeof outboundEmailSchema.$inferSelect)['status'];

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

const LEAD_SEARCH_TONE: Record<LeadSearchStatus, Tone> = {
  searching: 'info',
  qualifying: 'info',
  done: 'success',
  failed: 'danger',
};

const LEAD_TONE: Record<LeadStatus, Tone> = {
  found: 'neutral',
  researching: 'info',
  finding_email: 'info',
  ready: 'success',
  reserve: 'neutral',
  filtered_out: 'neutral',
  no_email: 'warning',
  failed: 'danger',
};

const REPLY_STATUS_TONE: Record<ReplyStatus, Tone> = {
  pending: 'info',
  interested: 'success',
  question: 'info',
  objection: 'warning',
  not_now: 'neutral',
  not_interested: 'neutral',
  manual_review: 'warning',
  demo_sent: 'info',
  demo_viewed: 'info',
  follow_up: 'info',
  whatsapp: 'info',
  call_booked: 'success',
  nurturing: 'neutral',
  out_of_office: 'neutral',
  auto_reply: 'neutral',
  no_reply: 'neutral',
  stop: 'danger',
  wrong_person: 'neutral',
};

const REPLY_CATEGORY_TONE: Record<ReplyCategory, Tone> = {
  interested: 'success',
  question: 'info',
  objection: 'warning',
  not_now: 'neutral',
  not_interested: 'neutral',
  stop: 'danger',
  out_of_office: 'neutral',
  auto_reply: 'neutral',
  wrong_person: 'neutral',
  other: 'warning',
};

const OUTBOUND_TONE: Record<OutboundStatus, Tone> = {
  draft: 'warning',
  scheduled: 'info',
  sent: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};

// A tinted dot carries the tone; the label stays readable foreground text
const DOT_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/60',
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-destructive',
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info/8 text-foreground',
  warning: 'bg-warning/10 text-foreground',
  success: 'bg-success/10 text-foreground',
  danger: 'bg-destructive/8 text-destructive',
};

type StatusBadgeProps =
  | { kind: 'campaign'; status: CampaignStatus }
  | { kind: 'contact'; status: ContactStatus }
  | { kind: 'leadSearch'; status: LeadSearchStatus }
  | { kind: 'lead'; status: LeadStatus }
  | { kind: 'replyStatus'; status: ReplyStatus }
  | { kind: 'replyCategory'; status: ReplyCategory }
  | { kind: 'outbound'; status: OutboundStatus };

/**
 * Resolves the tone of a status within its vocabulary.
 * @param props The status and the vocabulary it belongs to.
 * @returns The tone to tint the badge with.
 */
const toneOf = (props: StatusBadgeProps) => {
  if (props.kind === 'campaign') {
    return CAMPAIGN_TONE[props.status];
  }

  if (props.kind === 'contact') {
    return CONTACT_TONE[props.status];
  }

  if (props.kind === 'leadSearch') {
    return LEAD_SEARCH_TONE[props.status];
  }

  if (props.kind === 'replyStatus') {
    return REPLY_STATUS_TONE[props.status];
  }

  if (props.kind === 'replyCategory') {
    return REPLY_CATEGORY_TONE[props.status];
  }

  if (props.kind === 'outbound') {
    return OUTBOUND_TONE[props.status];
  }

  return LEAD_TONE[props.status];
};

/**
 * Shows only the colored dot of a status, for places where its label is already written out.
 * @param props The status and the vocabulary it belongs to.
 * @returns A small dot tinted with the status tone.
 */
export const StatusDot = (props: StatusBadgeProps) => (
  <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[toneOf(props)])} />
);

/**
 * Shows a campaign, contact, lead search, lead, conversation, reply or email status as a pill
 * with a colored dot.
 * @param props Component props.
 * @param props.kind Which status vocabulary the value belongs to.
 * @param props.status The status to label.
 * @returns A badge carrying the translated status and its tone.
 */
export const StatusBadge = (props: StatusBadgeProps) => {
  const campaignT = useTranslations('CampaignStatus');
  const contactT = useTranslations('ContactStatus');
  const leadSearchT = useTranslations('LeadSearchStatus');
  const leadT = useTranslations('LeadStatus');
  const replyStatusT = useTranslations('ReplyStatus');
  const categoryT = useTranslations('ReplyCategory');
  const outboundT = useTranslations('OutboundStatus');

  const labelOf = () => {
    if (props.kind === 'campaign') {
      return campaignT(`status_${props.status}`);
    }

    if (props.kind === 'contact') {
      return contactT(`status_${props.status}`);
    }

    if (props.kind === 'leadSearch') {
      return leadSearchT(`status_${props.status}`);
    }

    if (props.kind === 'replyStatus') {
      return replyStatusT(`status_${props.status}`);
    }

    if (props.kind === 'replyCategory') {
      return categoryT(`category_${props.status}`);
    }

    if (props.kind === 'outbound') {
      return outboundT(`status_${props.status}`);
    }

    return leadT(`status_${props.status}`);
  };

  const tone = toneOf(props);
  const label = labelOf();

  return (
    <Badge variant="ghost" className={cn('gap-1.5 rounded-full pl-1.5', TONE_CLASS[tone])}>
      <StatusDot {...props} />
      {label}
    </Badge>
  );
};
