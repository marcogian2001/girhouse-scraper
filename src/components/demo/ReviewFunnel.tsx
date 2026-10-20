'use client';

import { Lock, RotateCcw, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GoogleLogo, GoogleStars } from './GoogleReviews';
import { useTimedSequence } from './useTimedSequence';

/** Ratings from here up are sent to Google, the rest stay private. */
const GOOGLE_FROM = 4;

const STAR_PATH = 'M12 17.3l-6.2 3.7 1.6-7L2 9.3l7.1-.6L12 2l2.9 6.7 7.1.6-5.4 4.7 1.6 7z';

/**
 * The review system to try by hand: the customer is asked for a rating on WhatsApp,
 * and tapping a star shows where that rating goes. 4-5 stars lead to Google, the rest
 * becomes a private message to the business.
 * @param props Component props.
 * @param props.company The business name.
 * @param props.customer The example customer.
 * @returns The interactive explainer.
 */
export const ReviewFunnel = (props: { company: string; customer: string }) => {
  const t = useTranslations('DemoPage');
  const [rating, setRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const phase = useTimedSequence({
    target: rating ? 3 : 0,
    intervalMs: 700,
    restartKey: rating ?? 0,
  });
  const shown = hovered ?? rating ?? 0;
  const goesToGoogle = rating !== null && rating >= GOOGLE_FROM;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="space-y-2 rounded-2xl bg-[#efeae2] p-4 shadow-inner">
        <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
          {t('funnel_message', { customer: props.customer, company: props.company })}
        </div>

        <div className="space-y-1 rounded-xl bg-white px-3 py-3 text-center shadow-sm">
          <div
            className="flex justify-center gap-1.5"
            onMouseLeave={() => {
              setHovered(null);
            }}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={t('funnel_star', { star })}
                onMouseEnter={() => {
                  setHovered(star);
                }}
                onClick={() => {
                  setRating(star);
                }}
                className="transition-transform hover:scale-125 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`size-9 transition-colors ${star <= shown ? 'fill-[#fbbc04]' : 'fill-neutral-200'}`}
                  aria-hidden
                >
                  <path d={STAR_PATH} />
                </svg>
              </button>
            ))}
          </div>
          {rating === null && (
            <p className="animate-pulse text-xs font-medium text-(--demo-primary)">
              {t('funnel_try')}
            </p>
          )}
        </div>

        {rating !== null && phase >= 1 && (
          <div className="ml-auto w-fit animate-in rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-1.5 text-sm shadow-sm fade-in">
            <GoogleStars rating={rating} className="size-4" />
          </div>
        )}

        {rating !== null && phase >= 2 && (
          <div className="max-w-[88%] animate-in rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm fade-in">
            {goesToGoogle ? t('funnel_high_reply') : t('funnel_low_reply')}
          </div>
        )}
      </div>

      {rating !== null && phase >= 3 && (
        <div
          className={`flex animate-pop items-center gap-3 rounded-2xl border-2 p-4 ${goesToGoogle ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}
        >
          {goesToGoogle ? (
            <>
              <GoogleLogo className="size-9 shrink-0" />
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-green-800">
                  <ThumbsUp className="size-4" />
                  {t('funnel_high_result')}
                </p>
                <p className="text-xs text-green-700">{t('funnel_high_detail')}</p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-200">
                <Lock className="size-4 text-amber-800" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-amber-900">
                  {t('funnel_low_result', { company: props.company })}
                </p>
                <p className="text-xs text-amber-800">{t('funnel_low_detail')}</p>
              </div>
            </>
          )}
        </div>
      )}

      {rating !== null && phase >= 3 && (
        <button
          type="button"
          onClick={() => {
            setRating(null);
          }}
          className="mx-auto flex items-center gap-1.5 text-sm font-medium text-(--demo-primary)"
        >
          <RotateCcw className="size-3.5" />
          {t('funnel_retry')}
        </button>
      )}
    </div>
  );
};
