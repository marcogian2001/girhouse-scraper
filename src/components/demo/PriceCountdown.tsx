'use client';

import { Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNow } from './useTimedSequence';

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

/**
 * Splits the time left before the countdown ends.
 * @param ms Milliseconds left.
 * @returns Days, hours, minutes and seconds.
 */
const splitDuration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));

  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
};

/**
 * Whether the demo's reserved price countdown is still running.
 * @param increaseOn When the countdown ends, ISO.
 * @param now The current time.
 * @returns True until that date.
 */
export const isPriceLocked = (increaseOn: string, now: Date) => new Date(increaseOn) > now;

/**
 * A live countdown to the real date the demo's reserved price ends. Shows nothing once
 * the date has passed, so there is never a fake deadline.
 * @param props Component props.
 * @param props.increaseOn When the countdown ends, ISO.
 * @param props.increaseLabel That date, formatted.
 * @param props.isBookingDeadline Names the date as the last day to book the call, which keeps the
 * price locked until it happens, instead of the day the price ends.
 * @returns The countdown, or nothing.
 */
export const PriceCountdown = (props: {
  increaseOn: string;
  increaseLabel: string;
  isBookingDeadline?: boolean;
}) => {
  const t = useTranslations('DemoPage');
  const now = useNow(1000);

  if (!isPriceLocked(props.increaseOn, now)) {
    return null;
  }

  const left = splitDuration(new Date(props.increaseOn).getTime() - now.getTime());

  return (
    <div className="space-y-2 rounded-2xl bg-black/25 p-3 md:space-y-2.5 md:p-3.5">
      <p className="flex items-center justify-center gap-2 text-sm font-medium">
        <Timer className="size-4 text-[#10BADE]" />
        {props.isBookingDeadline
          ? t('vsl_book_by', { date: props.increaseLabel })
          : t('pricing_locked_until', { date: props.increaseLabel })}
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {UNITS.map((unit) => (
          <div key={unit} className="rounded-xl bg-white/10 py-1.5 md:py-2">
            {/* The server renders a second or two earlier than the browser hydrates */}
            <p suppressHydrationWarning className="text-xl font-bold tabular-nums md:text-2xl">
              {String(left[unit]).padStart(2, '0')}
            </p>
            <p className="text-[10px] tracking-wider text-white/70 uppercase">
              {t(`pricing_unit_${unit}`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
