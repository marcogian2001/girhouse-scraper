'use client';

import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  Clock,
  PartyPopper,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppConfig } from '@/utils/AppConfig';
import { googleCalendarUrl } from '../CalendarLinks';
import { getDemoSessionId, sendDemoEvent } from '../DemoSession';
import { PHONE_PREFIXES, withPrefix } from '../PhonePrefix';
import { WhatsAppIcon } from '../WhatsAppIcon';

export type BookingPhase = 'phone' | 'slots' | 'confirm' | 'booked' | 'unavailable';

type Slots = {
  durationMinutes: number;
  suggested: string[];
  days: { date: string; slots: string[] }[];
};

type Failure = 'phone_invalid' | 'phone_error' | 'slots_error' | 'taken' | 'book_error';

/**
 * Reads the free call times for the demo.
 * @param slug The demo slug.
 * @returns The times, or null when booking is not available.
 */
const loadSlots = async (slug: string): Promise<Slots | null> => {
  const response = await fetch(`/api/demo/${slug}/slots`).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const slots: Slots = await response.json();

  return slots;
};

/**
 * The last step: the lead leaves their WhatsApp number, picks one of the free
 * times from the GHL calendar, confirms, and the call is booked.
 * @param props Component props.
 * @param props.slug The demo slug.
 * @param props.company The business name.
 * @param props.whatsappNumber The Girhouse WhatsApp number in E.164, if configured.
 * @param props.track Whether clicks are reported; off in dashboard previews.
 * @param props.phase Where the booking stands.
 * @param props.onPhase Moves the booking on, so the giraffe says the matching line.
 * @returns The booking flow.
 */
export const BookingStep = (props: {
  slug: string;
  company: string;
  whatsappNumber: string | null;
  track: boolean;
  phase: BookingPhase;
  onPhase: (phase: BookingPhase) => void;
}) => {
  const t = useTranslations('DemoPage');
  const format = useFormatter();
  const [phone, setPhone] = useState('');
  const [dial, setDial] = useState<string>(PHONE_PREFIXES[0].dial);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const slotLabel = (slot: string) =>
    format.dateTime(new Date(slot), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: AppConfig.timeZone,
    });

  const timeLabel = (slot: string) =>
    format.dateTime(new Date(slot), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: AppConfig.timeZone,
    });

  const dayLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: 'short',
      day: 'numeric',
      timeZone: AppConfig.timeZone,
    });

  const refreshSlots = async () => {
    const loaded = await loadSlots(props.slug);

    setSlots(loaded);
    props.onPhase(loaded ? 'slots' : 'unavailable');
  };

  const handlePhone = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/demo/${props.slug}/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: withPrefix({ dial, number: phone }),
        sessionId: getDemoSessionId(),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setIsBusy(false);
      setFailure(response?.status === 422 ? 'phone_invalid' : 'phone_error');

      return;
    }

    await refreshSlots();
    setIsBusy(false);
  };

  const handleBook = async () => {
    if (!chosen) {
      return;
    }

    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/demo/${props.slug}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: chosen, sessionId: getDemoSessionId() }),
    }).catch(() => null);

    setIsBusy(false);

    if (response?.ok) {
      props.onPhase('booked');

      return;
    }

    if (response?.status === 409) {
      setFailure('taken');
      setChosen(null);
      await refreshSlots();

      return;
    }

    setFailure('book_error');
  };

  const whatsappHref = props.whatsappNumber
    ? `https://wa.me/${props.whatsappNumber.replace('+', '')}?text=${encodeURIComponent(t('whatsapp_prefill', { company: props.company }))}`
    : null;

  const pick = (slot: string) => {
    setChosen(slot);
    setFailure(null);
    props.onPhase('confirm');
  };

  const day = slots?.days[dayIndex];

  const calendarEvent = (start: string) => ({
    title: t('booking_event_title', { company: props.company }),
    details: t('booking_event_details'),
    start: new Date(start),
    minutes: slots?.durationMinutes ?? 30,
  });

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="space-y-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl md:p-8">
        {props.phase === 'phone' && (
          <form onSubmit={handlePhone} className="animate-in space-y-3 fade-in">
            <label htmlFor="demo-phone" className="block font-semibold">
              {t('booking_phone_label')}
            </label>
            <div className="flex overflow-hidden rounded-2xl border border-neutral-300 focus-within:border-(--demo-primary) focus-within:ring-2 focus-within:ring-(--demo-primary)/25">
              <label className="relative flex items-center border-r border-neutral-200 bg-neutral-50">
                <span className="sr-only">{t('booking_prefix_label')}</span>
                <select
                  value={dial}
                  onChange={(event) => {
                    setDial(event.target.value);
                  }}
                  className="h-full cursor-pointer appearance-none bg-transparent py-3 pr-7 pl-3 text-base text-neutral-800 outline-none"
                >
                  {PHONE_PREFIXES.map((prefix) => (
                    <option key={prefix.country} value={prefix.dial}>
                      {prefix.flag} {prefix.dial}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-2 text-xs text-neutral-400"
                  aria-hidden
                >
                  ▾
                </span>
              </label>
              <input
                id="demo-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                value={phone}
                placeholder={t('phone_placeholder')}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
                className="h-13 min-w-0 flex-1 bg-white px-4 text-base text-neutral-900 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="h-13 w-full rounded-2xl bg-(--demo-primary) font-semibold text-(--demo-on-primary) shadow-lg disabled:opacity-60"
            >
              {isBusy ? t('booking_loading') : t('booking_phone_submit')}
            </button>
          </form>
        )}

        {props.phase === 'slots' && slots && (
          <div className="animate-in space-y-4 fade-in">
            <p className="flex items-center gap-2 text-sm text-neutral-500">
              <Clock className="size-4" />
              {t('booking_duration', { minutes: slots.durationMinutes })}
            </p>
            <div className="grid gap-3">
              {slots.suggested.map((slot, index) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    pick(slot);
                  }}
                  className="flex animate-pop items-center gap-3 rounded-2xl border-2 border-(--demo-primary)/30 bg-(--demo-primary)/5 p-4 text-left font-semibold transition hover:border-(--demo-primary)"
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <CalendarCheck className="size-5 shrink-0 text-(--demo-primary)" />
                  <span className="first-letter:uppercase">{slotLabel(slot)}</span>
                </button>
              ))}
            </div>

            {showAll ? (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {slots.days.map((item, index) => (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => {
                        setDayIndex(index);
                      }}
                      className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium capitalize ${index === dayIndex ? 'bg-(--demo-primary) text-(--demo-on-primary)' : 'bg-neutral-100 text-neutral-700'}`}
                    >
                      {dayLabel(item.date)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {day?.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        pick(slot);
                      }}
                      className="rounded-xl border border-neutral-200 py-2 text-sm font-medium tabular-nums hover:border-(--demo-primary)"
                    >
                      {timeLabel(slot)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAll(true);
                }}
                className="text-sm font-medium text-(--demo-primary) underline-offset-4 hover:underline"
              >
                {t('booking_other_times')}
              </button>
            )}
          </div>
        )}

        {props.phase === 'confirm' && chosen && (
          <div className="animate-in space-y-4 text-center fade-in">
            <p className="text-sm text-neutral-500">{t('booking_confirm_title')}</p>
            <p className="text-xl font-bold first-letter:uppercase">{slotLabel(chosen)}</p>
            <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-left text-sm leading-relaxed text-amber-950 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <p>
                {t.rich('booking_confirm_notice', {
                  b: (chunks) => <strong className="font-bold">{chunks}</strong>,
                })}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  props.onPhase('slots');
                }}
                className="flex h-12 items-center justify-center gap-1 rounded-2xl border border-neutral-300 px-4 text-sm font-medium"
              >
                <ChevronLeft className="size-4" />
                {t('booking_change')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleBook}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-(--demo-primary) text-lg font-semibold text-(--demo-on-primary) shadow-lg disabled:opacity-60 max-sm:order-first sm:flex-1"
              >
                <CalendarCheck className="size-5" />
                {isBusy ? t('booking_loading') : t('booking_confirm')}
              </button>
            </div>
          </div>
        )}

        {props.phase === 'booked' && chosen && (
          <div className="animate-pop space-y-3 text-center">
            <PartyPopper className="mx-auto size-12 text-(--demo-primary)" />
            <p className="text-2xl font-bold">{t('booking_done_title')}</p>
            <p className="font-medium first-letter:uppercase">{slotLabel(chosen)}</p>
            <p className="flex items-center justify-center gap-2 text-sm text-neutral-500">
              <CheckCircle2 className="size-4 text-green-600" />
              {t('booking_done_text')}
            </p>
            <a
              href={googleCalendarUrl(calendarEvent(chosen))}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-(--demo-primary) text-base font-semibold text-(--demo-on-primary) shadow-lg"
            >
              <CalendarPlus className="size-5" />
              {t('booking_add_google')}
            </a>
          </div>
        )}

        {props.phase === 'unavailable' && (
          <p className="animate-in text-center font-medium fade-in">{t('booking_unavailable')}</p>
        )}

        {failure && <p className="text-sm text-red-600">{t(`booking_error_${failure}`)}</p>}
      </div>

      {whatsappHref && props.phase !== 'booked' && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (props.track) {
              sendDemoEvent(props.slug, { type: 'whatsapp_click' });
            }
          }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#25d366] px-5 py-3.5 text-sm font-semibold text-white shadow-lg"
        >
          <WhatsAppIcon className="size-5" />
          {t('whatsapp_link')}
        </a>
      )}
    </div>
  );
};
