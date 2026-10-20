'use client';

import {
  Bell,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  PhoneMissed,
  Search,
  Send,
  Smile,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { DemoSnapshot } from '@/models/Schema';
import { useTimedSequence } from '../../useTimedSequence';
import { WhatsAppIcon } from '../../WhatsAppIcon';
import { chatTimeOf, chosenSlotOf } from './CrmData';

const CHANNELS = ['whatsapp', 'email', 'sms'] as const;

type Channel = (typeof CHANNELS)[number];

/**
 * Keeps the newest item of the thread in view, scrolling only the thread.
 * @param node The item that just appeared.
 */
const scrollThreadToEnd = (node: HTMLElement | null) => {
  node?.parentElement?.scrollTo({ top: node.parentElement.scrollHeight, behavior: 'smooth' });
};

/**
 * The shared inbox: every conversation on the left, and the customer's whole history
 * on the right, the missed call, the WhatsApp chat and the confirmation email together.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The inbox panel.
 */
export const CrmInbox = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const { customerName, messages } = props.data.chat;
  const slot = chosenSlotOf(props.data);
  // The missed call, every chat message, the email and the reminder
  const items = messages.length + 3;
  const shown = useTimedSequence({ target: items, intervalMs: 450 });

  const conversations = [
    {
      name: customerName,
      preview: messages.at(-1)?.text ?? '',
      icon: WhatsAppIcon,
      isActive: true,
    },
    {
      name: t('crm_inbox_phone_name'),
      preview: t('crm_inbox_phone'),
      icon: PhoneMissed,
      isActive: false,
    },
    { name: t('crm_inbox_email_name'), preview: t('crm_inbox_email'), icon: Mail, isActive: false },
  ];

  return (
    <div className="grid h-[560px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl md:grid-cols-[280px_1fr]">
      <aside className="hidden flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
          <Search className="size-4 text-neutral-400" />
          <span className="text-sm text-neutral-400">{t('crm_inbox_search')}</span>
        </div>
        <ul>
          {conversations.map((conversation) => (
            <li
              key={conversation.name}
              className={`flex gap-3 border-b border-neutral-100 px-4 py-3 ${conversation.isActive ? 'bg-white shadow-[inset_3px_0_0_var(--demo-primary)]' : ''}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                {conversation.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {conversation.name}
                  <conversation.icon className="size-3.5 text-neutral-400" />
                </p>
                <p className="truncate text-xs text-neutral-500">{conversation.preview}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-(--demo-primary)/10 font-semibold text-(--demo-primary)">
            {customerName.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{customerName}</p>
            <p className="text-xs text-neutral-500">{t('crm_phone_example')}</p>
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-green-50 text-green-700">
            <Phone className="size-4" />
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-neutral-50/60 px-4 py-4">
          {shown >= 1 && (
            <div
              ref={scrollThreadToEnd}
              className="mx-auto flex animate-in items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 fade-in"
            >
              <PhoneMissed className="size-3.5" />
              {t('crm_thread_missed', { customer: customerName })}
              <span className="text-red-400">09:58</span>
            </div>
          )}

          {messages.slice(0, Math.max(shown - 1, 0)).map((message, index) => {
            const isOurs = message.from === 'business';

            return (
              <div
                key={`${index}-${message.text.slice(0, 10)}`}
                ref={scrollThreadToEnd}
                className={`flex animate-in flex-col fade-in slide-in-from-bottom-2 ${isOurs ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${isOurs ? 'rounded-br-md bg-(--demo-primary) text-(--demo-on-primary)' : 'rounded-bl-md bg-white text-neutral-800 ring-1 ring-neutral-200'}`}
                >
                  {message.text}
                  {message.options.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {message.options.map((option) => (
                        <span key={option} className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                          {option}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] text-neutral-400">
                  <WhatsAppIcon className="size-3 text-[#25d366]" />
                  {chatTimeOf(index)}
                </span>
              </div>
            );
          })}

          {shown >= messages.length + 2 && (
            <div
              ref={scrollThreadToEnd}
              className="ml-auto w-[80%] animate-in space-y-1 rounded-2xl rounded-br-md border border-sky-200 bg-sky-50 p-3 text-sm fade-in"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                <Mail className="size-3.5" />
                {t('crm_thread_email_label')}
              </p>
              <p className="font-medium text-neutral-800">
                {t('crm_thread_email_subject', { slot: slot ?? '' })}
              </p>
              <p className="text-xs text-neutral-500">
                {t('crm_thread_email_body', { customer: customerName })}
              </p>
            </div>
          )}

          {shown >= messages.length + 3 && (
            <div
              ref={scrollThreadToEnd}
              className="mx-auto flex animate-in items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 fade-in"
            >
              <Bell className="size-3.5" />
              {t('crm_thread_reminder')}
            </div>
          )}
        </div>

        <footer className="space-y-2 border-t border-neutral-200 px-4 py-3">
          <div className="flex gap-1.5">
            {CHANNELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setChannel(item);
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${channel === item ? 'bg-(--demo-primary) text-(--demo-on-primary)' : 'bg-neutral-100 text-neutral-600'}`}
              >
                {item === 'whatsapp' && <WhatsAppIcon className="size-3.5" />}
                {item === 'email' && <Mail className="size-3.5" />}
                {item === 'sms' && <MessageSquareText className="size-3.5" />}
                {t(`crm_channel_${item}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2">
            <Smile className="size-4 text-neutral-400" />
            <Paperclip className="size-4 text-neutral-400" />
            <span className="flex-1 text-sm text-neutral-400">
              {t('crm_composer', { customer: customerName })}
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-(--demo-primary) text-(--demo-on-primary)">
              <Send className="size-4" />
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
};
