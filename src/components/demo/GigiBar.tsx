'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GiraffeFace, TypedText } from './GiraffeSpeaker';
import type { HighlightSegment } from './Highlights';
import { visibleLength } from './Highlights';

/**
 * Keeps `--demo-bar-h` on the tour equal to the height of Gigi's bar, so the content
 * always ends above it and auto-scrolls stop short of it.
 * @param bar Gigi's bar, or null when it unmounts.
 * @returns Stops watching the bar.
 */
const measureBar = (bar: HTMLElement | null) => {
  const observer = new ResizeObserver(() => {
    bar?.parentElement?.style.setProperty('--demo-bar-h', `${bar.offsetHeight}px`);
  });

  if (bar) {
    observer.observe(bar);
  }

  return () => {
    observer.disconnect();
  };
};

/**
 * Gigi's bar across the bottom of the screen: his face and line on the left, Back and
 * Next on the right. On the price it shows only the buttons, over the blue page.
 * @param props Component props.
 * @param props.segments Gigi's line, with its highlights.
 * @param props.typed How many characters of the line are shown.
 * @param props.isQuiet Hides Gigi and his line, leaving the buttons.
 * @param props.isLast Hides Next on the last scene.
 * @param props.onFinishLine Shows the whole line at once.
 * @param props.onBack Goes back a scene.
 * @param props.onNext Finishes the line or goes on.
 * @returns The bar.
 */
export const GigiBar = (props: {
  segments: HighlightSegment[];
  typed: number;
  isQuiet: boolean;
  isLast: boolean;
  onFinishLine: () => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const t = useTranslations('DemoPage');

  return (
    <aside
      ref={measureBar}
      className={`fixed inset-x-0 bottom-0 z-30 animate-in fade-in slide-in-from-bottom-4 ${props.isQuiet ? '' : 'border-t border-neutral-200 bg-white/95 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur'}`}
    >
      <div
        className={`mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6 md:py-4 ${props.isQuiet ? 'md:justify-end' : ''}`}
      >
        {!props.isQuiet && (
          <div className="flex flex-1 items-start gap-3 md:items-center">
            <GiraffeFace
              isTalking={props.typed < visibleLength(props.segments)}
              className="size-14 md:size-16"
            />
            <button
              type="button"
              onClick={props.onFinishLine}
              aria-live="polite"
              className="block min-h-12 flex-1 text-left text-[15px] leading-relaxed text-neutral-700 md:text-base"
            >
              <span className="sr-only">
                {props.segments.map((segment) => segment.text).join('')}
              </span>
              <span aria-hidden>
                <TypedText segments={props.segments} typed={props.typed} />
              </span>
            </button>
          </div>
        )}

        <div className="flex gap-2 md:w-72 md:shrink-0">
          <button
            type="button"
            aria-label={t('back')}
            onClick={props.onBack}
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700"
          >
            <ArrowLeft className="size-5" />
          </button>
          {!props.isLast && (
            <button
              type="button"
              onClick={props.onNext}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-full font-semibold shadow-lg ${props.isQuiet ? 'bg-white text-[#06287f]' : 'bg-(--demo-primary) text-(--demo-on-primary)'}`}
            >
              {t('next')}
              <ArrowRight className="size-5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
