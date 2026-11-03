'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChartColumnIncreasing,
  Coins,
  Globe,
  CreditCard,
  Link2,
  MapPinned,
  Newspaper,
  SearchCheck,
  Tags,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useRef } from 'react';
import { GoogleLogo } from '../GoogleReviews';
import { ScrollAnchor } from '../ScrollAnchor';
import type { DiyKey } from './DiyCosts';
import { DIY_COSTS } from './DiyCosts';

type DiyItem = { key: DiyKey; icon: LucideIcon; cue: RegExp };

/** The basics in the order Gigi says them, each shown as he names it. */
const ITEMS: DiyItem[] = [
  { key: 'seo', icon: Tags, cue: /parol|chiave|seo/iu },
  { key: 'analytics', icon: ChartColumnIncreasing, cue: /analytics/iu },
  { key: 'blog', icon: Newspaper, cue: /blog/iu },
  { key: 'console', icon: SearchCheck, cue: /console/iu },
  { key: 'profile', icon: MapPinned, cue: /scheda/iu },
  { key: 'consistent', icon: Link2, cue: /ovunque|stess|facebook|instagram|linkedin/iu },
  { key: 'tool', icon: CreditCard, cue: /gestionale|abbonamento|150/iu },
];

/**
 * Writes what a basic costs done alone: once, each month, or in hours of work.
 * @param options The cost.
 * @param options.cost Its euros, once or each month; none for the hours of work.
 * @param options.t The demo's messages.
 * @returns The label.
 */
const costLabel = (options: {
  cost: { once?: number; monthly?: number };
  t: ReturnType<typeof useTranslations<'DemoPage'>>;
}) => {
  const { cost, t } = options;

  if (cost.monthly) {
    return t('video_diy_cost_monthly', { amount: cost.monthly });
  }

  return cost.once ? t('video_diy_cost_once', { amount: cost.once }) : t('video_diy_cost_hours');
};

/** Where "or we do it" starts in the last screen's line. */
const US_CUE = /oppure|lo facciamo noi/iu;

/** Which basics each screen adds: the site, then Google and the profiles, then the tool. */
const SCREENS = [
  { from: 0, to: 3 },
  { from: 3, to: 6 },
  { from: 6, to: 7 },
] as const;

/** The channels whose information must match, as their logos, on one line. */
const CHANNELS = ['site', 'google', 'facebook', 'instagram', 'linkedin'] as const;

/**
 * The logo of one channel, small and round.
 * @param props Component props.
 * @param props.channel The channel.
 * @returns The logo.
 */
const ChannelLogo = (props: { channel: (typeof CHANNELS)[number] }) => {
  const box = 'flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm';

  if (props.channel === 'site') {
    return (
      <span className={`${box} bg-neutral-800 text-white`}>
        <Globe className="size-4" />
      </span>
    );
  }

  if (props.channel === 'google') {
    return (
      <span className={`${box} bg-white ring-1 ring-neutral-200`}>
        <GoogleLogo className="size-4.5" />
      </span>
    );
  }

  if (props.channel === 'facebook') {
    return (
      <span className={`${box} bg-[#1877f2] text-white`}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-4.5 fill-current">
          <path d="M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.5C11.8 2 11 3.7 11 6v2H9v3h2v11h3V11h2.6l.4-3z" />
        </svg>
      </span>
    );
  }

  if (props.channel === 'instagram') {
    return (
      <span
        className={`${box} bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4.5 fill-none stroke-current stroke-2">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.3" cy="6.7" r="0.6" className="fill-current" />
        </svg>
      </span>
    );
  }

  return <span className={`${box} bg-[#0a66c2] text-[13px] font-black text-white`}>in</span>;
};

/** Leaves room under what just showed, above Gigi's bar. */
const ROOM_BELOW = {
  scrollMarginBottom: 'calc(var(--demo-bar-h, 12rem) + 2.5rem)',
} satisfies React.CSSProperties;

const BARS = ['h-3', 'h-5', 'h-4', 'h-7', 'h-6', 'h-9'] as const;

/**
 * Says how many of a screen's cues Gigi has reached: each shows when its word is typed,
 * or at its share of the line when the line does not name it.
 * @param options The line.
 * @param options.cues The cues, in order.
 * @param options.spoken What Gigi says and how much of it is out.
 * @returns How many cues are reached.
 */
const reachedCues = (options: { cues: RegExp[]; spoken: { text: string; typed: number } }) => {
  const { text, typed } = options.spoken;
  let reached = 0;

  for (const [index, cue] of options.cues.entries()) {
    const at = text.search(cue);
    const position = at === -1 ? (index / options.cues.length) * text.length : at;

    if (typed < position) {
      break;
    }

    reached += 1;
  }

  return reached;
};

/**
 * The example under one of the basics: the keywords, a growing chart, the blog titles or
 * the channels that must say the same thing.
 * @param props Component props.
 * @param props.item Which basic.
 * @param props.texts The examples for this business.
 * @returns The example, or nothing for the basics told in words.
 */
const DiyExample = (props: {
  item: DiyKey;
  texts: { keywords: string[]; blogTitles: string[] };
}) => {
  if (props.item === 'seo' && props.texts.keywords.length > 0) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {props.texts.keywords.map((keyword) => (
          <span
            key={keyword}
            className="max-w-full truncate rounded-full bg-(--demo-primary)/10 px-2.5 py-1 text-xs font-semibold text-(--demo-primary)"
          >
            {keyword}
          </span>
        ))}
      </span>
    );
  }

  if (props.item === 'analytics') {
    return (
      <span className="flex h-9 items-end gap-1">
        {BARS.map((bar, index) => (
          <span
            key={bar}
            className={`w-3 animate-in rounded-t bg-(--demo-primary)/70 duration-700 slide-in-from-bottom-4 ${bar}`}
            style={{ animationDelay: `${index * 120}ms` } satisfies React.CSSProperties}
          />
        ))}
      </span>
    );
  }

  if (props.item === 'blog' && props.texts.blogTitles.length > 0) {
    return (
      <ul className="min-w-0 space-y-1 text-xs text-neutral-700">
        {props.texts.blogTitles.map((title) => (
          <li key={title} className="truncate">
            · {title}
          </li>
        ))}
      </ul>
    );
  }

  if (props.item === 'consistent') {
    return (
      <span className="flex gap-1.5">
        {CHANNELS.map((channel) => (
          <ChannelLogo key={channel} channel={channel} />
        ))}
      </span>
    );
  }

  return null;
};

/**
 * What the owner can set up alone to be found on Google, each basic shown as Gigi names
 * it, with examples for this business; the last screen ticks them off, adds the tool to
 * subscribe to and closes on "or we do it".
 * @param props Component props.
 * @param props.part Which screen, from 1 to 3.
 * @param props.texts The keywords and blog titles written for this business.
 * @param props.spoken What Gigi says on the screen and how much of it is out.
 * @param props.onCost Plays a sound when a card and its cost show.
 * @returns The checklist.
 */
export const DiyScene = (props: {
  part: number;
  texts: { keywords: string[]; blogTitles: string[] } | undefined;
  spoken: { text: string; typed: number };
  onCost: () => void;
}) => {
  const t = useTranslations('DemoPage');
  // The cards whose cost already rang, so each rings once
  const rung = useRef(new Set<DiyKey>());
  const texts = props.texts ?? { keywords: [], blogTitles: [] };
  const screen = SCREENS[Math.min(Math.max(props.part, 1), SCREENS.length) - 1] ?? SCREENS[0];
  const isLast = props.part >= SCREENS.length;
  const cues = [
    ...ITEMS.slice(screen.from, screen.to).map((item) => item.cue),
    ...(isLast ? [US_CUE] : []),
  ];
  const reached = reachedCues({ cues, spoken: props.spoken });
  const shown = screen.from + Math.min(reached, screen.to - screen.from);
  const isUsShown = isLast && reached > screen.to - screen.from;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4 pb-10">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">
          {t('video_diy_title')}
        </h2>
        <p className="text-sm text-neutral-600">{t('video_diy_subtitle')}</p>
      </header>

      <ol className="grid min-w-0 gap-3 md:grid-cols-2">
        {ITEMS.slice(0, shown).map((item, index) => {
          // Everything turns green once Gigi says we can do it all
          const isDone = isUsShown;

          return (
            <li
              key={item.key}
              ref={(node) => {
                if (node && index >= screen.from && !rung.current.has(item.key)) {
                  rung.current.add(item.key);
                  props.onCost();
                }
              }}
              className={`relative flex min-w-0 animate-pop items-start gap-3 rounded-2xl p-3.5 shadow-lg ring-1 transition-colors duration-700 sm:p-4 ${isDone ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-neutral-200'} ${item.key === 'tool' ? 'md:col-span-2' : ''}`}
            >
              {index === shown - 1 && (
                <ScrollAnchor className="absolute inset-0" style={ROOM_BELOW} />
              )}
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-500 ${isDone ? 'bg-emerald-500 text-white' : 'bg-(--demo-primary)/10 text-(--demo-primary)'}`}
              >
                {isDone ? <Check className="size-5" /> : <item.icon className="size-5" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block text-sm font-bold text-neutral-950">
                  {index + 1}. {t(`video_diy_${item.key}_title`)}
                </span>
                <span className="block text-xs text-neutral-600">
                  {t(`video_diy_${item.key}_text`)}
                </span>
                <DiyExample item={item.key} texts={texts} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                  <Coins className="size-3.5 shrink-0" />
                  {costLabel({ cost: DIY_COSTS[item.key], t })}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {isUsShown && (
        <div className="relative animate-in rounded-2xl bg-emerald-600 p-4 text-center text-white shadow-xl fade-in slide-in-from-bottom-3 sm:p-5">
          <ScrollAnchor className="absolute inset-0" style={ROOM_BELOW} />
          <p className="text-xl font-black text-balance sm:text-2xl">{t('video_diy_us')}</p>
        </div>
      )}
    </div>
  );
};
