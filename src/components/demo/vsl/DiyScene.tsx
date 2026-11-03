'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChartColumnIncreasing,
  CreditCard,
  Link2,
  MapPinned,
  Newspaper,
  SearchCheck,
  Tags,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { ScrollAnchor } from '../ScrollAnchor';

type DiyKey = 'seo' | 'analytics' | 'blog' | 'console' | 'profile' | 'consistent' | 'tool';

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

/** Where "or we do it" starts in the last screen's line. */
const US_CUE = /oppure|lo facciamo noi/iu;

/** Which basics each screen adds: the site, then Google and the profiles, then the tool. */
const SCREENS = [
  { from: 0, to: 3 },
  { from: 3, to: 6 },
  { from: 6, to: 7 },
] as const;

/** The channels whose information must match, as coloured badges. */
const CHANNELS = [
  { label: 'video_diy_site', className: 'bg-neutral-800' },
  { label: 'Google', className: 'bg-[#4285f4]' },
  { label: 'Facebook', className: 'bg-[#1877f2]' },
  { label: 'Instagram', className: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5]' },
  { label: 'LinkedIn', className: 'bg-[#0a66c2]' },
] as const;

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
    const position = at >= 0 ? at : (index / options.cues.length) * text.length;

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
  const t = useTranslations('DemoPage');

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
      <span className="flex flex-wrap gap-1.5">
        {CHANNELS.map((channel) => (
          <span
            key={channel.label}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold text-white ${channel.className}`}
          >
            {channel.label === 'video_diy_site' ? t('video_diy_site') : channel.label}
          </span>
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
 * @returns The checklist.
 */
export const DiyScene = (props: {
  part: number;
  texts: { keywords: string[]; blogTitles: string[] } | undefined;
  spoken: { text: string; typed: number };
}) => {
  const t = useTranslations('DemoPage');
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
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">
          {t('video_diy_title')}
        </h2>
        <p className="text-sm text-neutral-600">{t('video_diy_subtitle')}</p>
      </header>

      <ol className="grid min-w-0 gap-3 md:grid-cols-2">
        {ITEMS.slice(0, shown).map((item, index) => {
          const isDone = isLast && item.key !== 'tool';

          return (
            <li
              key={item.key}
              className={`relative flex min-w-0 animate-pop items-start gap-3 rounded-2xl bg-white p-3.5 shadow-lg ring-1 ring-neutral-200 sm:p-4 ${item.key === 'tool' ? 'md:col-span-2' : ''}`}
            >
              {index === shown - 1 && <ScrollAnchor className="absolute inset-0" />}
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
              </span>
            </li>
          );
        })}
      </ol>

      {isUsShown && (
        <div className="relative flex animate-in items-center gap-3 pt-2 fade-in slide-in-from-bottom-3">
          <ScrollAnchor className="absolute inset-0" />
          <span className="h-px flex-1 bg-neutral-300" />
          <p className="text-center text-xl font-black text-balance text-(--demo-primary) md:text-2xl">
            {t('video_diy_us')}
          </p>
          <span className="h-px flex-1 bg-neutral-300" />
        </div>
      )}
    </div>
  );
};
