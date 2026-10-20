'use client';

import { Camera, CheckCheck, ChevronLeft, Lock, Mic, Phone, Plus, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoChatMessage } from '@/models/Schema';
import { useTimedSequence } from './useTimedSequence';

/** Beige wallpaper with light doodles, drawn for the demo in the spirit of the WhatsApp one. */
const WALLPAPER = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" fill="none" stroke="#c9bfae" stroke-width="1.4" stroke-linecap="round" opacity="0.55"><circle cx="18" cy="20" r="7"/><path d="M50 14l6 10h-12z"/><path d="M90 18c4-6 12-6 14 0s-6 12-14 14"/><rect x="14" y="62" width="14" height="10" rx="3"/><path d="M58 60c6 0 10 4 10 10"/><path d="M96 66l6 6m0-6l-6 6"/><circle cx="30" cy="102" r="4"/><path d="M62 98h14m-7-7v14"/><path d="M96 100c3 4 9 4 12 0"/></svg>',
)}")`;

/** How long a message waits before it shows, the business "typing" in between. */
const MESSAGE_INTERVAL_MS = 1500;

/**
 * Keeps the newest message in view, scrolling only the chat and never the page.
 * @param node The message that just appeared.
 */
const scrollChatToEnd = (node: HTMLElement | null) => {
  node?.parentElement?.scrollTo({ top: node.parentElement.scrollHeight, behavior: 'smooth' });
};

/**
 * Formats the example clock time of a message.
 * @param index The message position.
 * @returns A time such as 10:02, one minute per two messages.
 */
const timeOf = (index: number) => `10:${String(2 + Math.floor(index / 2)).padStart(2, '0')}`;

/**
 * An example WhatsApp chat on the customer's phone, played one message at a time.
 * @param props Component props.
 * @param props.company The business name, shown as the chat contact.
 * @param props.messages The example conversation.
 * @param props.upTo How many messages this scene plays up to.
 * @returns The chat screen.
 */
export const WhatsAppChat = (props: {
  company: string;
  messages: DemoChatMessage[];
  upTo: number;
}) => {
  const t = useTranslations('DemoPage');
  const shown = useTimedSequence({ target: props.upTo, intervalMs: MESSAGE_INTERVAL_MS });
  const next = props.messages[shown];
  const isTyping = shown < props.upTo && next?.from === 'business';
  const firstReply = props.messages.findIndex((message) => message.from === 'business');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#efeae2]">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-[#f6f6f6] px-2 py-2">
        <ChevronLeft className="size-6 text-[#007aff]" />
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-sm font-semibold text-white">
          {props.company.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold text-neutral-900">{props.company}</p>
          <p className="text-[12px] text-neutral-500">
            {isTyping ? t('chat_typing') : t('chat_online')}
          </p>
        </div>
        <Video className="size-5 text-[#007aff]" />
        <Phone className="ml-3 size-[18px] text-[#007aff]" />
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-3"
        style={{ backgroundImage: WALLPAPER }}
      >
        <span className="mx-auto rounded-md bg-white/90 px-2.5 py-0.5 text-[11px] text-neutral-600 shadow-sm">
          {t('chat_today')}
        </span>
        <span className="mx-auto my-1 flex max-w-[85%] items-start gap-1 rounded-md bg-[#fdf4c5] px-2.5 py-1 text-center text-[10.5px] leading-snug text-neutral-700">
          <Lock className="mt-0.5 size-2.5 shrink-0" />
          {t('chat_encryption')}
        </span>

        {props.messages.slice(0, shown).map((message, index) => {
          const isCustomer = message.from === 'customer';

          return (
            <div
              key={`${index}-${message.text.slice(0, 12)}`}
              ref={scrollChatToEnd}
              className={`flex animate-in flex-col duration-300 fade-in slide-in-from-bottom-2 ${isCustomer ? 'items-end' : 'items-start'}`}
            >
              {index === firstReply && (
                <span className="mb-1 self-center rounded-full bg-[#25d366] px-2.5 py-0.5 text-[10.5px] font-semibold text-white shadow">
                  {t('chat_reply_badge')}
                </span>
              )}
              <div
                className={`relative max-w-[82%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-snug text-neutral-900 shadow-sm ${isCustomer ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'}`}
              >
                <span
                  className={`absolute top-0 size-2.5 ${isCustomer ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)]' : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)]'}`}
                />
                <span className="whitespace-pre-line">{message.text}</span>
                <span className="float-right mt-1.5 ml-2 flex items-center gap-0.5 text-[10.5px] text-neutral-500">
                  {timeOf(index)}
                  {isCustomer && <CheckCheck className="size-3.5 text-[#53bdeb]" />}
                </span>
              </div>

              {message.options.length > 0 && (
                <div className="mt-1 flex w-[82%] flex-col gap-1">
                  {message.options.map((option) => {
                    const isChosen =
                      props.messages[index + 1]?.text === option && shown > index + 1;

                    return (
                      <span
                        key={option}
                        className={`rounded-lg py-2 text-center text-[14px] font-medium shadow-sm transition-colors ${isChosen ? 'bg-[#d1f4cc] text-[#008069]' : 'bg-white text-[#008069]'}`}
                      >
                        {option}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div
            ref={scrollChatToEnd}
            className="flex w-fit animate-in items-center gap-1 rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-sm fade-in"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-typing-dot rounded-full bg-neutral-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 bg-[#f6f6f6] px-2 pt-2 pb-6">
        <Plus className="size-6 text-[#007aff]" />
        <span className="flex-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-400">
          {t('chat_input')}
        </span>
        <Camera className="size-5 text-[#007aff]" />
        <Mic className="size-5 text-[#007aff]" />
      </footer>
    </div>
  );
};
