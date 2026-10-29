'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BrollScene as BrollClip, BrollSector } from '@/utils/BrollLibrary';
import { brollPath } from '@/utils/BrollLibrary';
import { useTimedSequence } from '../useTimedSequence';
import type { VslCase } from './VslScript';

/** What the dream shows over its clip, one after the other. */
const DREAM_CHIPS = ['vsl_dream_calls', 'vsl_dream_agenda', 'vsl_dream_evenings'] as const;

/**
 * A b-roll clip in a cinema frame, muted and looping under the voice: the lead's sector's
 * when it was made, else the generic one, else a dark frame. Problems carry their name in
 * a red label; the dream adds what changes, one line at a time.
 * @param props Component props.
 * @param props.sector The lead's sector.
 * @param props.clip The scene of the clip.
 * @param props.problem The problem told over it, if any.
 * @returns The scene.
 */
export const BrollScene = (props: { sector: BrollSector; clip: BrollClip; problem?: VslCase }) => {
  const t = useTranslations('DemoPage');
  const [source, setSource] = useState<BrollSector | null>(props.sector);
  const chips = useTimedSequence({
    target: props.problem ? 0 : DREAM_CHIPS.length,
    intervalMs: 1400,
  });
  const path = source ? brollPath(source, props.clip) : null;

  return (
    <div className="relative mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-800 to-neutral-950 shadow-2xl ring-1 ring-black/10">
      {path && (
        <video
          key={path}
          src={`${path}.mp4`}
          poster={`${path}.jpg`}
          muted
          loop
          autoPlay
          playsInline
          aria-hidden
          className="absolute inset-0 size-full animate-in object-cover duration-700 fade-in zoom-in-105"
          onError={() => {
            // A sector whose clips are not made yet borrows the generic ones
            setSource((current) => (current === 'generic' ? null : 'generic'));
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

      {props.problem ? (
        <p className="absolute top-4 left-4 animate-pop rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg md:top-6 md:left-6 md:text-base">
          {t(`vsl_case_${props.problem}`)}
        </p>
      ) : (
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
