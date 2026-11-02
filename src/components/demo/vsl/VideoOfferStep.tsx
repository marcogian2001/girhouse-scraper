'use client';

import { Check, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScrollAnchor } from '../ScrollAnchor';
import { useTimedSequence } from '../useTimedSequence';
import { VIDEO_FIRST_MONTH_PRICE } from './VslScript';

const INCLUDED = ['found', 'reviews', 'requests', 'back', 'agenda', 'support'] as const;

/**
 * The offer, told plainly: the one monthly price, what it holds and the guarantee.
 * @param props Component props.
 * @param props.part How much this scene shows, from 1 to 3.
 * @param props.price The monthly price.
 * @param props.isCallOnly Whether the first month's price is given in the call.
 * @returns The offer.
 */
export const VideoOfferStep = (props: { part: number; price: number; isCallOnly: boolean }) => {
  const t = useTranslations('DemoPage');
  const included = useTimedSequence({
    target: props.part >= 2 ? INCLUDED.length : 0,
    intervalMs: 350,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ring-neutral-200 md:p-8">
        <p className="text-sm font-semibold tracking-wide text-(--demo-primary) uppercase">
          {t('video_offer_label')}
        </p>
        <p className="mt-2 flex items-baseline justify-center gap-2">
          <span className="text-7xl font-black tracking-tight text-neutral-950 tabular-nums">
            {VIDEO_FIRST_MONTH_PRICE} €
          </span>
          <span className="text-lg font-semibold text-neutral-600">{t('video_offer_first')}</span>
        </p>
        <p className="mt-1 text-lg font-semibold text-neutral-800">
          {t('video_offer_then', { price: props.price })}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {t(props.isCallOnly ? 'video_offer_where_call' : 'video_offer_where_direct')}
        </p>
      </section>

      {props.part >= 2 && (
        <section className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-neutral-200">
          <h2 className="mb-3 font-bold text-neutral-950">{t('video_offer_included_title')}</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {INCLUDED.slice(0, included).map((item, index) => (
              <li
                key={item}
                className="relative flex animate-in items-start gap-2.5 text-sm text-neutral-800 fade-in slide-in-from-bottom-2"
              >
                {index === included - 1 && <ScrollAnchor className="absolute inset-0" />}
                <Check className="mt-0.5 size-4 shrink-0 text-(--demo-primary)" />
                {t(`video_included_${item}`)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.part >= 3 && (
        <section className="relative animate-in space-y-2 rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200 fade-in slide-in-from-bottom-3">
          <ScrollAnchor className="absolute inset-0" />
          <p className="flex items-center gap-2 font-bold text-emerald-950">
            <ShieldCheck className="size-5 shrink-0" />
            {t('video_offer_guarantee_title')}
          </p>
          <p className="text-sm text-emerald-950">{t('video_offer_guarantee_text')}</p>
          <p className="text-xs text-emerald-900">{t('video_offer_terms')}</p>
        </section>
      )}
    </div>
  );
};
