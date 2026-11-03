'use client';

import type { LucideIcon } from 'lucide-react';
import { MessageCircleOff, PhoneMissed, SearchX, UserRoundX, CalendarX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTimedSequence } from '../useTimedSequence';
import type { VideoLoss } from './VideoScript';
import type { VslCase } from './VslScript';

/** The icon over each stretch's name, under its photo. */
const LOSS_ICONS: Record<VideoLoss, LucideIcon> = {
  not_found: SearchX,
  not_chosen: UserRoundX,
  lost: PhoneMissed,
  social: MessageCircleOff,
  not_back: CalendarX,
};

/** What the dream shows over its photo, one after the other. */
const DREAM_CHIPS = ['vsl_dream_calls', 'vsl_dream_agenda', 'vsl_dream_evenings'] as const;

/**
 * The photo of the moment Gigi tells, in a cinema frame, slowly zooming in under the voice;
 * a dark frame while it is not made. Problems carry their name in a red label; the dream
 * adds what changes, one line at a time; in version C the stretch's name goes under the
 * photo, with its icon.
 * @param props Component props.
 * @param props.src The photo, if made.
 * @param props.problem The problem told over it, if any.
 * @param props.portrait The tall photo for phones, if made; the frame turns tall with it.
 * @param props.loss Where customers get lost, told over it in version C.
 * @returns The scene.
 */
export const PhotoScene = (props: {
  src: string | null;
  portrait?: string | null;
  problem?: VslCase;
  loss?: VideoLoss;
}) => {
  const t = useTranslations('DemoPage');
  const chips = useTimedSequence({
    target: props.problem || props.loss ? 0 : DREAM_CHIPS.length,
    intervalMs: 1400,
  });

  const LossIcon = props.loss ? LOSS_ICONS[props.loss] : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 md:space-y-6">
      <div
        className={`relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-800 to-neutral-950 shadow-2xl ring-1 ring-black/10 ${props.portrait ? 'aspect-[3/4] max-h-[62svh] md:aspect-video' : 'aspect-video'} ${props.loss ? 'md:max-h-[56svh]' : ''}`}
      >
        {props.src && (
          <Image
            src={props.src}
            alt=""
            fill
            unoptimized
            priority
            className={`animate-ken-burns object-cover ${props.portrait ? 'max-md:hidden' : ''}`}
          />
        )}
        {props.portrait && (
          <Image
            src={props.portrait}
            alt=""
            fill
            unoptimized
            priority
            className="animate-ken-burns object-cover md:hidden"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

        {!props.loss && props.problem && (
          <p className="absolute top-4 left-4 animate-pop rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg md:top-6 md:left-6 md:text-base">
            {t(`vsl_case_${props.problem}`)}
          </p>
        )}

        {!props.loss && !props.problem && (
          <ul className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2 md:inset-x-6 md:bottom-6">
            {DREAM_CHIPS.slice(0, chips).map((chip) => (
              <li
                key={chip}
                className="animate-pop rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-lg md:text-sm"
              >
                ✓ {t(chip)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.loss && LossIcon && (
        <div className="flex animate-in flex-col items-center gap-2 text-center duration-700 fade-in slide-in-from-bottom-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-(--demo-primary) text-(--demo-on-primary) shadow-lg md:size-16">
            <LossIcon className="size-7 md:size-8" />
          </span>
          <p className="text-2xl leading-tight font-black tracking-tight text-balance text-neutral-950 md:text-4xl">
            {t(`video_loss_${props.loss}`)}
          </p>
        </div>
      )}
    </div>
  );
};
