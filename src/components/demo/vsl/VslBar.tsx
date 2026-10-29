'use client';

import { ArrowLeft, Pause, Play, SkipForward } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { measureBar } from '../GigiBar';
import { currentCaption } from '../GigiCaptions';
import { TypedText } from '../GiraffeSpeaker';
import type { HighlightSegment } from '../Highlights';
import { HostTalkingFace } from './HostTalking';

/**
 * The bar across the bottom of version B: Gigi's face talking and what he is saying now on the left,
 * pause and the way back or ahead on the right. Nothing has to be pressed: the demo moves
 * on by itself when Gigi is done. On the price it drops the line, on blue glass.
 * @param props Component props.
 * @param props.segments Gigi's line, with its highlights.
 * @param props.typed How many characters of the line are shown.
 * @param props.isTalking Whether Gigi's voice is playing.
 * @param props.isPaused Whether the demo is paused.
 * @param props.isQuiet Hides the line, leaving Gigi and the buttons.
 * @param props.isLast Hides the skip on the last scene.
 * @param props.onBack Goes back a scene.
 * @param props.onTogglePause Pauses or resumes.
 * @param props.onSkip Goes on without waiting.
 * @returns The bar.
 */
export const VslBar = (props: {
  segments: HighlightSegment[];
  typed: number;
  isTalking: boolean;
  isPaused: boolean;
  isQuiet: boolean;
  isLast: boolean;
  onBack: () => void;
  onTogglePause: () => void;
  onSkip: () => void;
}) => {
  const t = useTranslations('DemoPage');
  // Only what Gigi is saying now, like a subtitle, so the bar stays two lines high
  const caption = currentCaption(props.segments, props.typed);

  return (
    <aside
      ref={measureBar}
      className={`fixed inset-x-0 bottom-0 z-30 animate-in fade-in slide-in-from-bottom-4 ${props.isQuiet ? 'border-t border-white/15 bg-[#06287f]/40 backdrop-blur-md' : 'border-t border-neutral-200 bg-white/95 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur'}`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 md:gap-6 md:py-3">
        <HostTalkingFace isTalking={props.isTalking} className="size-12 md:size-16" />

        <p
          aria-live="polite"
          className={`min-h-[2lh] min-w-0 flex-1 text-sm leading-snug md:text-base md:leading-relaxed ${props.isQuiet ? 'text-white' : 'text-neutral-700'}`}
        >
          {props.isPaused && (
            <span className="mr-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">
              {t('vsl_paused')}
            </span>
          )}
          {!props.isQuiet && (
            <>
              <span className="sr-only">
                {props.segments.map((segment) => segment.text).join('')}
              </span>
              <span aria-hidden>
                <TypedText segments={caption.segments} typed={caption.typed} />
              </span>
            </>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={t('back')}
            onClick={props.onBack}
            className="flex size-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={props.isPaused ? t('vsl_resume') : t('vsl_pause')}
            onClick={props.onTogglePause}
            className={`flex size-11 items-center justify-center rounded-full shadow-lg ${props.isQuiet ? 'bg-white text-[#06287f]' : 'bg-(--demo-primary) text-(--demo-on-primary)'}`}
          >
            {props.isPaused ? (
              <Play className="size-5 fill-current" />
            ) : (
              <Pause className="size-5 fill-current" />
            )}
          </button>
          {!props.isLast && (
            <button
              type="button"
              aria-label={t('vsl_skip')}
              onClick={props.onSkip}
              className="flex size-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600"
            >
              <SkipForward className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
