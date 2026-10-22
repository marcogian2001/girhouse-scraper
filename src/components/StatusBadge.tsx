import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type {
  campaignSchema,
  contactSchema,
  leadSchema,
  leadSearchSchema,
  outboundEmailSchema,
} from '@/models/Schema';
import type { ConversationState, ReplyCategory } from '@/utils/ReplyRouting';

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

const CONVERSATION_TONE: Record<ConversationState, Tone> = {
  replied: 'info',
  classified: 'info',
  demo_sent: 'info',
  demo_viewed: 'info',
  follow_up: 'info',
  whatsapp: 'info',
  call_booked: 'success',
  nurturing: 'neutral',
  out_of_office: 'neutral',
  auto_reply: 'neutral',
  paused: 'warning',
  manual_review: 'warning',
  closed_not_interested: 'neutral',
  closed_no_reply: 'neutral',
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
  | { kind: 'contact'; status: ContactStatus }
  | { kind: 'leadSearch'; status: LeadSearchStatus }
  | { kind: 'lead'; status: LeadStatus }
  | { kind: 'conversation'; status: ConversationState }
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

  if (props.kind === 'conversation') {
    return CONVERSATION_TONE[props.status];
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
 * Shows a campaign, contact, lead search, lead, conversation, reply or email status as a tinted pill.
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
  const conversationT = useTranslations('ConversationState');
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

    if (props.kind === 'conversation') {
      return conversationT(`status_${props.status}`);
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
    <Badge variant="ghost" className={TONE_CLASS[tone]}>
      {label}
    </Badge>
  );
};
