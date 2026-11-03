'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTimedSequence } from '../useTimedSequence';
import type { VideoLoss } from './VideoScript';
import type { VslCase } from './VslScript';

/** What the dream shows over its photo, one after the other. */
const DREAM_CHIPS = ['vsl_dream_calls', 'vsl_dream_agenda', 'vsl_dream_evenings'] as const;

/**
 * The photo of the moment Gigi tells, in a cinema frame, slowly zooming in under the voice;
 * a dark frame while it is not made. Problems carry their name in a red label; the dream
 * adds what changes, one line at a time.
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

  return (
    <div
      className={`relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-800 to-neutral-950 shadow-2xl ring-1 ring-black/10 ${props.portrait ? 'aspect-[3/4] max-h-[65svh] md:aspect-video md:max-h-none' : 'aspect-video'}`}
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

      {props.loss && (
        <p className="absolute inset-x-3 top-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] animate-pop truncate rounded-full bg-neutral-950/85 px-3 py-1 text-xs font-bold whitespace-nowrap text-white shadow-lg md:inset-x-auto md:top-6 md:left-6 md:px-4 md:py-1.5 md:text-base">
          {t(`video_loss_${props.loss}`)}
        </p>
      )}

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
  );
};
