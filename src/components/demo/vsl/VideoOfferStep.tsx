'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTimedSequence } from '../useTimedSequence';
import { GuaranteeSeal } from './GuaranteeSeal';
import { VIDEO_FIRST_MONTH_PRICE } from './VslScript';

/** What the monthly fee holds, four a column, as on the checkout. */
const INCLUDED = [
  ['site', 'reviews', 'agenda', 'changes'],
  ['seo', 'recalls', 'requests', 'support'],
] as const;

/** Girhouse's own green, the same on the checkout whatever the business's colour. */
const GREEN = 'text-[#3f8f5f]';

/** Where the line starts saying the first month's price, which strikes the full one. */
const STRIKE_CUE = /se attivi|primo mese/iu;

/**
 * Says how far the price has gone, in step with Gigi: the full price, struck through once
 * he gets to the first month, then the first month's price as he says it.
 * @param options The scene.
 * @param options.part How much of the offer shows.
 * @param options.spoken What Gigi says and how much of it is out.
 * @returns 0, 1 or 2.
 */
const priceStage = (options: { part: number; spoken: { text: string; typed: number } }) => {
  if (options.part > 1) {
    return 2;
  }

  const { text, typed } = options.spoken;
  const strikeAt = text.search(STRIKE_CUE);
  const newAt = text.indexOf(String(VIDEO_FIRST_MONTH_PRICE));
  const strike = strikeAt === -1 ? text.length * 0.6 : strikeAt;
  const reveal = newAt === -1 ? text.length * 0.85 : newAt;

  if (typed >= reveal) {
    return 2;
  }

  return typed >= strike ? 1 : 0;
};

/**
 * The offer as the checkout shows it: the Girhouse system, the monthly price struck from
 * the full one to the first month's, what it holds and the guarantee.
 * @param props Component props.
 * @param props.part How much this scene shows, from 1 to 3.
 * @param props.spoken What Gigi says, so the price changes as he says it.
 * @param props.price The monthly price.
 * @param props.isCallOnly Whether the first month's price is given in the call.
 * @param props.actions The buttons under what is included.
 * @returns The offer, made to fit one phone screen.
 */
export const VideoOfferStep = (props: {
  part: number;
  spoken: { text: string; typed: number };
  price: number;
  isCallOnly: boolean;
  actions: React.ReactNode;
}) => {
  const t = useTranslations('DemoPage');
  const stage = priceStage({ part: props.part, spoken: props.spoken });
  const included = useTimedSequence({
    target: props.part >= 2 ? INCLUDED[0].length : 0,
    intervalMs: 350,
  });

  return (
    <div className="mx-auto max-w-xl rounded-[1.75rem] border-2 border-[#4a9b6b] bg-gradient-to-b from-[#eef7e8] via-white to-white px-4 py-3 text-center shadow-xl sm:p-6">
      <h2 className="text-2xl font-black tracking-tight text-neutral-950 sm:text-4xl">
        {t('video_offer_title')}
      </h2>
      <Image
        src="/demo/sistema-girhouse.webp"
        alt={t('video_offer_mockup_alt')}
        width={1800}
        height={972}
        sizes="(min-width: 640px) 576px, 100vw"
        priority
        className="mx-auto mt-1 h-auto max-h-[15svh] w-auto object-contain sm:max-h-56"
      />

      <p className={`text-sm font-bold sm:mt-3 sm:text-base ${GREEN}`}>{t('video_offer_month')}</p>
      {/* 97 is struck through and steps aside, then 47 takes the stage next to it */}
      <div className="flex h-14 items-center justify-center gap-3 sm:h-24">
        <span
          className={`relative leading-none font-black tracking-tight tabular-nums transition-all duration-500 ${stage >= 2 ? 'text-3xl text-neutral-400 sm:text-4xl' : `text-6xl sm:text-8xl ${GREEN}`}`}
        >
          {props.price} €
          {stage >= 1 && (
            <span className="absolute inset-x-[-6%] top-1/2 h-[0.09em] origin-left animate-strike rounded-full bg-red-600" />
          )}
        </span>
        {stage >= 2 && (
          <span
            className={`animate-pop text-6xl leading-none font-black tracking-tight tabular-nums sm:text-8xl ${GREEN}`}
          >
            {VIDEO_FIRST_MONTH_PRICE} €
          </span>
        )}
      </div>
      <p
        className={`text-sm font-semibold transition-opacity ${stage >= 2 ? 'opacity-100' : 'opacity-0'} ${GREEN}`}
      >
        {t('video_offer_first')} · {t('video_offer_then', { price: props.price })}
      </p>
      <p className="text-sm font-semibold text-neutral-900 sm:mt-2 sm:text-base">
        {t('video_offer_label')}{' '}
        <span className="text-[11px] font-normal text-neutral-500 sm:text-xs">
          {t(props.isCallOnly ? 'video_offer_where_call' : 'video_offer_where_direct')}
        </span>
      </p>

      {props.part >= 2 && (
        <section className="mt-2 rounded-2xl border-2 border-[#d6eadd] bg-white px-3 py-2 text-left sm:mt-4 sm:p-4">
          <h3 className="mb-1 text-base font-black text-neutral-950 sm:mb-2 sm:text-lg">
            {t('video_offer_included_title')}
          </h3>
          <div className="grid grid-cols-2 gap-x-3">
            {INCLUDED.map((column) => (
              <ul key={column[0]} className="space-y-1 sm:space-y-1.5">
                {column.slice(0, included).map((item) => (
                  <li
                    key={item}
                    className="flex animate-in items-center gap-2 text-sm font-bold whitespace-nowrap text-neutral-900 fade-in slide-in-from-bottom-2 sm:text-base"
                  >
                    <Check className={`size-4 shrink-0 stroke-3 ${GREEN}`} />
                    {t(`video_included_${item}`)}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      )}

      <div className="mt-2.5 sm:mt-3">{props.actions}</div>

      {props.part >= 3 && (
        <p className="mt-2 flex animate-in items-center justify-center gap-2.5 text-left fade-in">
          <GuaranteeSeal className="text-[5px]" />
          <span className="text-xs leading-snug text-neutral-600">
            <span className="font-serif font-bold text-[#7a2618]">
              {t('video_offer_guarantee_title')}.
            </span>{' '}
            {t('video_offer_guarantee_text')}
          </span>
        </p>
      )}
    </div>
  );
};
