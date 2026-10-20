'use client';

import { CalendarCheck, CalendarPlus, ClipboardList, StickyNote, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { useTimedSequence } from '../../useTimedSequence';
import { WhatsAppIcon } from '../../WhatsAppIcon';
import { chosenSlotOf } from './CrmData';

/**
 * The customer's card at the top of the CRM: who they are, where they came from, and
 * tags that add themselves.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The contact bar.
 */
export const CrmContactBar = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const { customerName, service } = props.data.chat;
  const slot = chosenSlotOf(props.data);
  const tags = [t('crm_tag_new'), service, slot ? t('crm_tag_booked') : null].filter(
    (tag): tag is string => Boolean(tag),
  );
  const shown = useTimedSequence({ target: tags.length, intervalMs: 500 });

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-full bg-(--demo-primary)/10 text-(--demo-primary)">
        <UserRound className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{customerName}</p>
        <p className="text-xs text-neutral-500">{t('crm_phone_example')}</p>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <WhatsAppIcon className="size-3.5" />
        WhatsApp
      </span>
      <div className="flex flex-wrap gap-1.5 md:ml-auto">
        {tags.slice(0, shown).map((tag) => (
          <span
            key={tag}
            className="animate-pop rounded-full bg-(--demo-primary)/10 px-2.5 py-1 text-xs font-medium text-(--demo-primary)"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * The customer's details as the CRM filled them in on its own.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The profile panel.
 */
export const CrmProfile = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const { service, note } = props.data.chat;
  const slot = chosenSlotOf(props.data);
  const fields = [
    {
      label: t('crm_source'),
      value: 'WhatsApp',
      icon: WhatsAppIcon,
      tint: 'bg-green-100 text-green-700',
    },
    {
      label: t('crm_field_created'),
      value: t('crm_field_created_value'),
      icon: CalendarPlus,
      tint: 'bg-sky-100 text-sky-700',
    },
    {
      label: t('crm_field_service'),
      value: service,
      icon: ClipboardList,
      tint: 'bg-violet-100 text-violet-700',
    },
    {
      label: t('crm_appointment'),
      value: slot,
      icon: CalendarCheck,
      tint: 'bg-(--demo-primary)/10 text-(--demo-primary)',
    },
    {
      label: t('crm_note_title'),
      value: note,
      icon: StickyNote,
      tint: 'bg-amber-100 text-amber-700',
    },
  ].filter((field) => Boolean(field.value));
  const shown = useTimedSequence({ target: fields.length, intervalMs: 450 });

  return (
    <dl className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:grid-cols-2 md:p-7">
      {fields.slice(0, shown).map((field) => (
        <div
          key={field.label}
          className="flex animate-in items-start gap-3 rounded-xl bg-neutral-50 px-4 py-3 fade-in slide-in-from-bottom-2"
        >
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${field.tint}`}
          >
            <field.icon className="size-4.5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <dt className="text-xs font-medium text-neutral-500">{field.label}</dt>
            <dd className="text-sm font-semibold text-neutral-900">{field.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
};
