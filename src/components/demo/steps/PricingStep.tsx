'use client';

import { Check, Gift, Headset, KeyRound, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { GirhouseLogo } from '../GirhouseLogo';
import { isPriceLocked, PriceCountdown } from '../PriceCountdown';
import { ScrollAnchor } from '../ScrollAnchor';
import { useNow, useTimedSequence } from '../useTimedSequence';

const INCLUDED = ['landing', 'inbox', 'instant', 'followup', 'reviews'] as const;

const GUARANTEES = [
  { key: 'free_week', icon: Gift },
  { key: 'done_for_you', icon: Wrench },
  { key: 'support', icon: Headset },
  { key: 'yours', icon: KeyRound },
] as const;

/** Bits of confetti scattered over the background, as on a promo flyer. */
const CONFETTI = [
  'top-[8%] left-[12%] rotate-12 bg-[#10BADE]',
  'top-[14%] right-[18%] -rotate-12 bg-white/80',
  'top-[30%] left-[4%] rotate-45 bg-white/60',
  'top-[6%] right-[40%] rotate-[30deg] bg-[#7fe3f5]',
  'top-[38%] right-[6%] -rotate-[20deg] bg-[#10BADE]',
  'bottom-[22%] left-[8%] rotate-[70deg] bg-[#7fe3f5]',
] as const;

const PRICE_FRAMES = 12;

/** The headline's 3D look: a stack of darker copies under the letters, then a cyan glow. */
const HEADLINE_SHADOW =
  '0 2px 0 #0a5bd6, 0 4px 0 #0849b3, 0 6px 0 #063a91, 0 10px 18px rgba(0, 0, 0, 0.35), 0 0 40px rgba(16, 186, 222, 0.55)';

/**
 * The price for this business, laid out like a promo flyer on the blue page: the logo,
 * a big headline, Gigi with the package, the reserved price with a live countdown to the
 * real increase date, what is included and the guarantees along the bottom.
 * @param props Component props.
 * @param props.part How much this scene shows, from 1 to 3.
 * @param props.company The business name.
 * @param props.price The monthly price now.
 * @param props.newPrice The monthly price after the increase.
 * @param props.slots How many new businesses are taken each month.
 * @param props.increaseOn When the price goes up for this business, ISO, if known.
 * @param props.increaseLabel The increase date, formatted.
 * @returns The pricing flyer.
 */
export const PricingStep = (props: {
  part: number;
  company: string;
  price: number;
  newPrice: number;
  slots: number;
  increaseOn: string | null;
  increaseLabel: string | null;
}) => {
  const t = useTranslations('DemoPage');
  const now = useNow(1000);
  const isLocked = isPriceLocked(props.increaseOn, now);
  const frame = useTimedSequence({ target: isLocked ? PRICE_FRAMES : 0, intervalMs: 70 });
  // Without a known first email there is no increase to announce, so the current price stands
  const settledPrice = props.increaseOn === null ? props.price : props.newPrice;
  const shownPrice = isLocked
    ? Math.round(props.newPrice - ((props.newPrice - props.price) * frame) / PRICE_FRAMES)
    : settledPrice;
  const included = useTimedSequence({
    target: props.part >= 2 ? INCLUDED.length : 0,
    intervalMs: 350,
  });

  return (
    <div className="relative isolate text-white">
      <span className="absolute -top-40 left-1/2 -z-10 size-140 -translate-x-1/2 rounded-full bg-[#10BADE]/30 blur-3xl" />
      {CONFETTI.map((bit) => (
        <span key={bit} className={`absolute -z-10 h-3 w-1.5 rounded-sm ${bit}`} />
      ))}

      <header className="space-y-2.5 text-center md:space-y-3">
        <GirhouseLogo tone="white" className="mx-auto h-5 md:h-6" />
        <h2
          className="text-[2.6rem] leading-[0.95] font-black tracking-tight uppercase md:text-6xl"
          style={{ textShadow: HEADLINE_SHADOW }}
        >
          {t('pricing_headline_top')}
          <br />
          {t('pricing_headline_bottom')}
        </h2>
        <p className="mx-auto w-fit rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-[#06287f] shadow-lg ring-4 ring-[#10BADE]/40 md:text-base">
          {props.company}
        </p>
      </header>

      <div className="mt-2 grid items-center gap-2 md:mt-6 md:grid-cols-[1fr_1.1fr] md:gap-6">
        <div className="relative mx-auto w-full max-w-40 md:max-w-sm">
          <span className="absolute inset-[8%] -z-10 rounded-full bg-gradient-to-br from-[#10BADE]/60 to-white/10 ring-8 ring-white/20" />
          <Image
            src="/demo/pricing-package.png"
            alt={t('pricing_package_alt')}
            width={1000}
            height={1000}
            sizes="(min-width: 768px) 384px, 160px"
            className="w-full animate-in drop-shadow-2xl duration-700 zoom-in-90 fade-in"
          />
        </div>

        <div className="relative space-y-2.5 rounded-3xl border-2 border-white/70 bg-white/10 p-3.5 shadow-2xl backdrop-blur-sm md:space-y-3 md:p-6">
          {props.part === 1 && <ScrollAnchor className="absolute inset-0" />}
          <p className="text-center text-base font-bold tracking-wide uppercase md:text-lg">
            {t('pricing_card_label')}
          </p>
          <div className="flex items-center justify-center gap-3">
            {isLocked && (
              <span className="text-2xl font-semibold text-white/50 line-through">
                {props.newPrice}€
              </span>
            )}
            <span className="text-7xl leading-none font-black tracking-tighter tabular-nums md:text-8xl">
              {shownPrice}
            </span>
            <span className="flex flex-col items-start">
              <span className="text-4xl leading-none font-black">€</span>
              <span className="text-sm font-semibold text-white/80">{t('offer_per_month')}</span>
            </span>
          </div>

          <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-3 py-2 text-center text-sm font-bold text-emerald-950 shadow-lg">
            <Gift className="size-5 shrink-0" />
            {t('pricing_free_week_short')}
          </p>

          <PriceCountdown increaseOn={props.increaseOn} increaseLabel={props.increaseLabel} />
        </div>
      </div>

      {props.part >= 2 && (
        <div className="relative mt-6 rounded-3xl bg-white/10 p-5 ring-1 ring-white/25 md:p-6">
          <ScrollAnchor className="absolute inset-0" />
          <p className="mb-3 font-bold">{t('pricing_included_title')}</p>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {INCLUDED.slice(0, included).map((item) => (
              <li
                key={item}
                className="flex animate-in items-start gap-2.5 text-sm fade-in slide-in-from-bottom-2"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#10BADE]">
                  <Check className="size-3 text-[#06287f]" />
                </span>
                {t(`pricing_included_${item}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.part >= 3 && (
        <div className="relative mt-6 animate-in space-y-4 border-t border-white/25 pt-6 fade-in slide-in-from-bottom-3">
          <ScrollAnchor className="absolute inset-0" />
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {GUARANTEES.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-3 ring-1 ring-white/20"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0074F2] shadow">
                  <item.icon className="size-5" />
                </span>
                <span className="text-sm leading-tight font-bold">
                  {t(`pricing_guarantee_${item.key}_title`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mx-auto w-fit rounded-full bg-black/25 px-4 py-2 text-center text-sm font-semibold">
            {t('offer_slots', { slots: props.slots })}
          </p>
        </div>
      )}
    </div>
  );
};
