import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Ban,
  CalendarCheck,
  Circle,
  FlaskConical,
  Inbox,
  Mail,
  MailCheck,
  MessageCircle,
  Play,
  Repeat,
  Tag,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { useFormatter } from 'next-intl';
import { AppConfig } from '@/utils/AppConfig';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** One entry of the timeline, already labelled. */
export type TimelineEntry = {
  id: string;
  type: string;
  label: string;
  detail: string | null;
  /** Who did it, such as "by Mario", when a person did. */
  actor: string | null;
  createdAt: Date;
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

/** Events whose outcome is good news, such as a sent email or a booked call. */
const SUCCESS_EVENTS = new Set([
  'reply_sent',
  'demo_completed',
  'demo_phone_left',
  'call_booked',
  'ghl_appointment_booked',
  'whatsapp_started',
  'referral_contact_created',
  'ghl_bot_assigned',
]);

/** Events where something was held back or stopped. */
const STOP_PATTERN = /cancelled|discarded|blocklisted|dnd|held|paused|skipped|inactive|ignored/u;

/** The icon of each family of events, by the start of their type. */
const FAMILY_ICONS: [prefix: string, icon: LucideIcon][] = [
  ['whatsapp', MessageCircle],
  ['demo', Play],
  ['follow_up', Repeat],
  ['referral', UserPlus],
  ['classif', Tag],
  ['state_changed', ArrowRight],
  ['reply_received', Inbox],
  ['reply_simulated', Inbox],
  ['reply_sent', MailCheck],
  ['reply', Mail],
];

/**
 * Picks the icon and colour of an event from its type.
 * @param type The event type.
 * @returns The icon and the tone.
 */
const styleOf = (type: string): { icon: LucideIcon; tone: Tone } => {
  if (type.includes('failed') || type === 'booking_slot_taken') {
    return { icon: TriangleAlert, tone: 'danger' };
  }

  if (type.startsWith('test_skipped')) {
    return { icon: FlaskConical, tone: 'neutral' };
  }

  if (type === 'call_booked' || type === 'ghl_appointment_booked') {
    return { icon: CalendarCheck, tone: 'success' };
  }

  if (STOP_PATTERN.test(type)) {
    return { icon: Ban, tone: 'warning' };
  }

  const icon = FAMILY_ICONS.find(([prefix]) => type.startsWith(prefix))?.[1] ?? Circle;

  if (SUCCESS_EVENTS.has(type)) {
    return { icon, tone: 'success' };
  }

  // The lead's own messages stand out from what the platform did
  return {
    icon,
    tone: type === 'reply_received' || type === 'reply_simulated' ? 'info' : 'neutral',
  };
};

/**
 * Groups entries, newest first, by their day in Italian time.
 * @param entries The entries, newest first.
 * @returns One group per day.
 */
const groupByDay = (entries: TimelineEntry[]) => {
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: AppConfig.timeZone });
  const groups: { day: string; date: Date; entries: TimelineEntry[] }[] = [];

  for (const entry of entries) {
    const day = dayKey.format(entry.createdAt);
    const last = groups.at(-1);

    if (last?.day === day) {
      last.entries.push(entry);
    } else {
      groups.push({ day, date: entry.createdAt, entries: [entry] });
    }
  }

  return groups;
};

/**
 * The conversation's history as a vertical timeline, grouped by day, newest first.
 * @param props Component props.
 * @param props.entries The events, newest first.
 * @returns The timeline.
 */
export const ConversationTimeline = (props: { entries: TimelineEntry[] }) => {
  const format = useFormatter();

  return (
    <div className="space-y-5">
      {groupByDay(props.entries).map((group) => (
        <section key={group.day} className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">
            {format.dateTime(group.date, { weekday: 'short', day: 'numeric', month: 'short' })}
          </h3>

          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-border">
            {group.entries.map((entry) => {
              const style = styleOf(entry.type);
              const Icon = style.icon;

              return (
                <li key={entry.id} className="relative flex gap-3">
                  {/* A solid disc under the tinted one, so the line never shows through */}
                  <span className="relative z-10 size-7 shrink-0 rounded-full bg-card ring-4 ring-card">
                    <span
                      className={cn(
                        'flex size-full items-center justify-center rounded-full',
                        TONE_CLASS[style.tone],
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5 pt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{entry.label}</span>
                      <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {format.dateTime(entry.createdAt, { timeStyle: 'short' })}
                      </time>
                    </div>
                    {entry.detail && (
                      <p className="text-sm break-words text-muted-foreground">{entry.detail}</p>
                    )}
                    {entry.actor && <p className="text-xs text-muted-foreground">{entry.actor}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
};
