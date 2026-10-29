'use client';

import {
  BellRing,
  CalendarCheck,
  Mail,
  MessageCircle,
  PhoneMissed,
  Send,
  Star,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { ScrollAnchor } from '../../ScrollAnchor';
import { useTimedSequence } from '../../useTimedSequence';
import { chatTimeOf, chosenSlotOf } from './CrmData';

type TimelineItem = {
  key: string;
  time: string;
  icon: typeof Zap;
  tint: string;
  title: string;
  detail: string | null;
  channel: string;
};

/**
 * The customer's activity as a classic timeline: every step on one axis, newest last.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The timeline panel.
 */
export const CrmTimeline = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const { messages, customerName } = props.data.chat;
  const slot = chosenSlotOf(props.data);
  const firstCustomer = messages.findIndex((message) => message.from === 'customer');
  const firstReply = messages.findIndex((message) => message.from === 'business');
  const reason = messages.findIndex(
    (message, index) => message.from === 'customer' && index > firstReply,
  );
  const offer = messages.findIndex((message) => message.options.length > 0);

  const items: TimelineItem[] = [
    {
      key: 'missed',
      time: '09:58',
      icon: PhoneMissed,
      tint: 'bg-red-100 text-red-600',
      title: t('crm_event_missed', { customer: customerName }),
      detail: null,
      channel: t('crm_channel_phone'),
    },
    {
      key: 'received',
      time: chatTimeOf(firstCustomer),
      icon: MessageCircle,
      tint: 'bg-green-100 text-green-700',
      title: t('crm_event_received', { customer: customerName }),
      detail: messages[firstCustomer]?.text ?? null,
      channel: 'WhatsApp',
    },
    {
      key: 'replied',
      time: chatTimeOf(firstReply),
      icon: Zap,
      tint: 'bg-amber-100 text-amber-700',
      title: t('crm_event_replied'),
      detail: messages[firstReply]?.text ?? null,
      channel: 'WhatsApp',
    },
    {
      key: 'reason',
      time: chatTimeOf(reason),
      icon: MessageCircle,
      tint: 'bg-green-100 text-green-700',
      title: t('crm_event_reason', { customer: customerName }),
      detail: messages[reason]?.text ?? null,
      channel: 'WhatsApp',
    },
    {
      key: 'slots',
      time: chatTimeOf(offer),
      icon: Send,
      tint: 'bg-sky-100 text-sky-700',
      title: t('crm_event_slots'),
      detail: messages[offer]?.options.join(' · ') ?? null,
      channel: 'WhatsApp',
    },
    {
      key: 'booked',
      time: chatTimeOf(offer + 1),
      icon: CalendarCheck,
      tint: 'bg-(--demo-primary)/15 text-(--demo-primary)',
      title: t('crm_event_booked', { slot: slot ?? '' }),
      detail: null,
      channel: t('crm_channel_calendar'),
    },
    {
      key: 'email',
      time: chatTimeOf(offer + 1),
      icon: Mail,
      tint: 'bg-sky-100 text-sky-700',
      title: t('crm_event_email'),
      detail: null,
      channel: 'Email',
    },
    {
      key: 'reminder',
      time: chatTimeOf(offer + 2),
      icon: BellRing,
      tint: 'bg-violet-100 text-violet-700',
      title: t('crm_event_reminder'),
      detail: null,
      channel: t('crm_channel_automation'),
    },
    {
      key: 'review',
      time: chatTimeOf(offer + 2),
      icon: Star,
      tint: 'bg-yellow-100 text-yellow-700',
      title: t('crm_event_review'),
      detail: null,
      channel: t('crm_channel_automation'),
    },
  ].filter((item) => item.key !== 'reason' || reason > 0);

  const shown = useTimedSequence({ target: items.length, intervalMs: 600 });

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl md:p-7">
      <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-3 py-1">{t('crm_today')}</span>
        {t('crm_timeline_title')}
      </p>
      {/* On a phone the time moves into the entry, so the axis sits at the left edge */}
      <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[1.07rem] before:w-0.5 before:bg-neutral-200 md:space-y-5 md:before:left-[4.6rem]">
        {items.slice(0, shown).map((item, index) => (
          <li
            key={item.key}
            className="relative grid animate-in grid-cols-[2.25rem_1fr] items-start gap-2.5 fade-in slide-in-from-left-3 md:grid-cols-[3.5rem_2.25rem_1fr] md:gap-3"
          >
            {/* On a phone the page follows each new entry down */}
            {index === shown - 1 && <ScrollAnchor className="absolute inset-0" />}
            <span className="pt-2 text-right text-xs font-medium text-neutral-400 tabular-nums max-md:hidden">
              {item.time}
            </span>
            <span
              className={`relative z-10 flex size-9 items-center justify-center rounded-full ring-4 ring-white ${item.tint}`}
            >
              <item.icon className="size-4" />
            </span>
            <div className="min-w-0 space-y-1 rounded-xl bg-neutral-50 px-3 py-2.5 md:px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{item.title}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-neutral-200">
                  <span className="text-neutral-400 tabular-nums md:hidden">{item.time} · </span>
                  {item.channel}
                </span>
              </div>
              {item.detail && <p className="text-sm text-neutral-600 italic">«{item.detail}»</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
