'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChartColumnIncreasing,
  Link2,
  MapPinned,
  Newspaper,
  SearchCheck,
  Tags,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { ScrollAnchor } from '../ScrollAnchor';
import { useTimedSequence } from '../useTimedSequence';

type DiyItem = {
  key: 'seo' | 'analytics' | 'blog' | 'console' | 'profile' | 'consistent';
  icon: LucideIcon;
};

/** The six basics, three per screen. */
const ITEMS: DiyItem[] = [
  { key: 'seo', icon: Tags },
  { key: 'analytics', icon: ChartColumnIncreasing },
  { key: 'blog', icon: Newspaper },
  { key: 'console', icon: SearchCheck },
  { key: 'profile', icon: MapPinned },
  { key: 'consistent', icon: Link2 },
];

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
 * The example under one of the basics: the keywords, a growing chart, the blog titles or
 * the channels that must say the same thing.
 * @param props Component props.
 * @param props.item Which basic.
 * @param props.texts The examples for this business.
 * @returns The example, or nothing for the basics told in words.
 */
const DiyExample = (props: {
  item: DiyItem['key'];
  texts: { keywords: string[]; blogTitles: string[] };
}) => {
  const t = useTranslations('DemoPage');

  if (props.item === 'seo' && props.texts.keywords.length > 0) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {props.texts.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full bg-(--demo-primary)/10 px-2.5 py-1 text-xs font-semibold text-(--demo-primary)"
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
      <ul className="space-y-1 text-xs text-neutral-700">
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
 * What the owner can set up alone to be found on Google, three basics per screen with
 * examples for this business, then the same list ticked off with "or we do it".
 * @param props Component props.
 * @param props.part Which screen: the site, then Google and the profiles, then all of it.
 * @param props.texts The keywords and blog titles written for this business.
 * @returns The checklist.
 */
export const DiyScene = (props: {
  part: number;
  texts: { keywords: string[]; blogTitles: string[] } | undefined;
}) => {
  const t = useTranslations('DemoPage');
  const texts = props.texts ?? { keywords: [], blogTitles: [] };
  const visible = props.part >= 2 ? ITEMS.length : 3;
  const shown = useTimedSequence({ target: visible, intervalMs: 700 });
  const isDone = props.part >= 3;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">
          {t('video_diy_title')}
        </h2>
        <p className="text-sm text-neutral-600">{t('video_diy_subtitle')}</p>
      </header>

      <ol className="grid gap-3 md:grid-cols-2">
        {ITEMS.slice(0, shown).map((item, index) => (
          <li
            key={item.key}
            className="relative flex animate-pop items-start gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-neutral-200"
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
        ))}
      </ol>

      {isDone && (
        <p className="mx-auto w-fit animate-pop rounded-full bg-(--demo-primary) px-5 py-2.5 text-center font-semibold text-(--demo-on-primary) shadow-lg">
          {t('video_diy_us')}
        </p>
      )}
    </div>
  );
};
