'use client';

import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppConfig } from '@/utils/AppConfig';
import { captureDemoEvent } from '../DemoAnalytics';
import type { BookingPhase } from '../steps/BookingStep';
import { BookingStep } from '../steps/BookingStep';
import type { VideoClosing } from './VideoScript';

/**
 * How the video ends, one of the three closings under test: the button to buy, the booking
 * of a call, or the button with the call one tap away.
 * @param props Component props.
 * @param props.slug The demo slug.
 * @param props.company The business name.
 * @param props.whatsappNumber The Girhouse WhatsApp number in E.164, if configured.
 * @param props.track Whether clicks are reported; off in dashboard previews.
 * @param props.closing The closing.
 * @param props.isCallOpen Whether the booking shows.
 * @param props.onOpenCall Shows the booking.
 * @param props.bookingPhase Where the booking stands.
 * @param props.onBookingPhase Moves the booking on.
 * @returns The closing.
 */
export const VideoClosingStep = (props: {
  slug: string;
  company: string;
  whatsappNumber: string | null;
  track: boolean;
  closing: VideoClosing;
  isCallOpen: boolean;
  onOpenCall: () => void;
  bookingPhase: BookingPhase;
  onBookingPhase: (phase: BookingPhase) => void;
}) => {
  const t = useTranslations('DemoPage');

  if (props.isCallOpen) {
    return (
      <BookingStep
        slug={props.slug}
        company={props.company}
        whatsappNumber={props.whatsappNumber}
        track={props.track}
        phase={props.bookingPhase}
        onPhase={props.onBookingPhase}
        hasPlainNotice
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ring-neutral-200 md:p-8">
      <a
        href={`${AppConfig.checkoutUrl}?funnel=demo&demo=${props.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (props.track) {
            captureDemoEvent('demo_purchase_click', { closing: props.closing });
          }
        }}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-(--demo-primary) px-5 py-3 text-lg font-semibold text-(--demo-on-primary) shadow-lg"
      >
        {t('video_closing_buy')}
        <ArrowRight className="size-5" />
      </a>
      <p className="flex items-center justify-center gap-2 text-sm text-neutral-600">
        <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
        {t('video_closing_guarantee')}
      </p>
      {props.closing === 'both' && (
        <button
          type="button"
          onClick={() => {
            if (props.track) {
              captureDemoEvent('demo_call_click', { closing: props.closing });
            }

            props.onOpenCall();
          }}
          className="w-full rounded-2xl border border-neutral-300 px-5 py-3.5 font-semibold text-neutral-800"
        >
          {t('video_closing_talk')}
        </button>
      )}
    </div>
  );
};
