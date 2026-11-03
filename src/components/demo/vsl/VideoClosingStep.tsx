'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppConfig } from '@/utils/AppConfig';
import { captureDemoEvent } from '../DemoAnalytics';
import type { BookingPhase } from '../steps/BookingStep';
import { BookingStep } from '../steps/BookingStep';
import type { VideoClosing } from './VideoScript';

/** The checkout's green button, pressed down a little when tapped. */
const MAIN_BUTTON =
  'flex min-h-16 w-full items-center justify-center gap-2 rounded-[1.4rem] bg-[#4a9b6b] px-3 py-4 text-[17px] font-black whitespace-nowrap text-white shadow-[0_6px_0_#357552,0_14px_24px_rgba(53,117,82,0.35)] transition active:translate-y-1 active:shadow-[0_2px_0_#357552] sm:gap-3 sm:text-xl';

/**
 * The main button under the offer, one of the three closings under test: activate, or
 * book a call when only the call is on offer.
 * @param props Component props.
 * @param props.slug The demo slug.
 * @param props.track Whether clicks are reported; off in dashboard previews.
 * @param props.closing The closing.
 * @param props.onOpenCall Shows the booking.
 * @returns The button.
 */
export const VideoMainAction = (props: {
  slug: string;
  track: boolean;
  closing: VideoClosing;
  onOpenCall: () => void;
}) => {
  const t = useTranslations('DemoPage');

  if (props.closing === 'call') {
    return (
      <button
        type="button"
        onClick={() => {
          if (props.track) {
            captureDemoEvent('demo_call_click', { closing: props.closing });
          }

          props.onOpenCall();
        }}
        className={MAIN_BUTTON}
      >
        {t('video_closing_book')}
        <ArrowRight className="size-5 shrink-0 stroke-3 sm:size-6" />
      </button>
    );
  }

  return (
    <a
      href={`${AppConfig.checkoutUrl}?funnel=demo&demo=${props.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (props.track) {
          captureDemoEvent('demo_purchase_click', { closing: props.closing });
        }
      }}
      className={MAIN_BUTTON}
    >
      {t('video_closing_buy')}
      <ArrowRight className="size-5 shrink-0 stroke-3 sm:size-6" />
    </a>
  );
};

/**
 * The quiet way to the call, when buying is on offer too: a line of text whose "book a
 * call" is underlined, so it reads as a link.
 * @param props Component props.
 * @param props.track Whether clicks are reported; off in dashboard previews.
 * @param props.onOpenCall Shows the booking.
 * @returns The link.
 */
export const VideoCallLink = (props: { track: boolean; onOpenCall: () => void }) => {
  const t = useTranslations('DemoPage');

  return (
    <button
      type="button"
      onClick={() => {
        if (props.track) {
          captureDemoEvent('demo_call_click', { closing: 'both' });
        }

        props.onOpenCall();
      }}
      className="mx-auto block text-sm whitespace-nowrap text-neutral-700 sm:text-base"
    >
      {t.rich('video_closing_talk', {
        u: (chunks) => (
          <span className="font-semibold text-neutral-950 underline decoration-2 underline-offset-4">
            {chunks}
          </span>
        ),
      })}
    </button>
  );
};

/**
 * The booking of the call, opened from the offer. When buying was on offer too, it warns
 * that the first month's discount only applies to buying now, and leads back to it.
 * @param props Component props.
 * @param props.slug The demo slug.
 * @param props.company The business name.
 * @param props.whatsappNumber The Girhouse WhatsApp number in E.164, if configured.
 * @param props.track Whether clicks are reported; off in dashboard previews.
 * @param props.closing The closing.
 * @param props.bookingPhase Where the booking stands.
 * @param props.onBookingPhase Moves the booking on.
 * @param props.onBack Goes back to the offer.
 * @returns The booking.
 */
export const VideoCallBooking = (props: {
  slug: string;
  company: string;
  whatsappNumber: string | null;
  track: boolean;
  closing: VideoClosing;
  bookingPhase: BookingPhase;
  onBookingPhase: (phase: BookingPhase) => void;
  onBack: () => void;
}) => {
  const t = useTranslations('DemoPage');
  const canBuy = props.closing === 'both';

  return (
    <BookingStep
      slug={props.slug}
      company={props.company}
      whatsappNumber={props.whatsappNumber}
      track={props.track}
      phase={props.bookingPhase}
      onPhase={props.onBookingPhase}
      phoneNotice={canBuy ? t('video_booking_discount_notice') : undefined}
      isOfferFirst={canBuy}
      afterCard={
        canBuy && props.bookingPhase !== 'booked' ? (
          <button type="button" onClick={props.onBack} className={MAIN_BUTTON}>
            <ArrowLeft className="size-5 shrink-0 stroke-3 sm:size-6" />
            {t('video_booking_back')}
          </button>
        ) : undefined
      }
      hasPlainNotice
    />
  );
};
