'use client';

import { ArrowLeft, ArrowRight, Play, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState } from 'react';
import gigiPauses from './gigi-pauses.json';
import { sentenceStarts, splitSentences } from './GigiCaptions';
import { TypedText } from './GiraffeSpeaker';
import type { HighlightSegment } from './Highlights';
import { visibleLength } from './Highlights';
import { useTimedSequence } from './useTimedSequence';

/** The fastest and slowest a sentence types, in milliseconds per character. */
const TYPING_RANGE_MS = { min: 15, max: 80 };

/** Gigi's videos, made by `scripts/generate-gigi-video.ts`. */
export type GigiVideo = 'intro' | 'pricing';

/**
 * Reads where a video is.
 * @param video The video.
 * @returns The current time and the length, in seconds.
 */
const readClock = (video: HTMLVideoElement) => ({
  time: video.currentTime,
  duration: Number.isFinite(video.duration) ? video.duration : 0,
});

/**
 * Starts the video with sound when the browser allows it, otherwise muted: browsers
 * only autoplay sound on sites the visitor has already interacted with.
 * @param video The video.
 * @returns How the video plays, or `blocked` when the browser refuses even muted.
 */
const startPlayback = async (video: HTMLVideoElement) => {
  try {
    await video.play();

    return 'sound';
  } catch {
    video.muted = true;
  }

  try {
    await video.play();

    return 'muted';
  } catch {
    video.muted = false;

    return 'blocked';
  }
};

/**
 * Gigi full screen on video, with what he is saying typed below him one sentence at a
 * time, then a button to go on. Used for the first screen and before the price. The
 * sentences follow the video's own clock, so they never run ahead of his voice. The
 * video starts on its own, muted with a "turn on sound" button when the browser blocks
 * sound, and on a tap when it blocks autoplay altogether; without the video file the
 * animated picture stands in, with the whole line typed below it.
 * @param props Component props.
 * @param props.video Which of Gigi's videos plays.
 * @param props.header What sits above Gigi.
 * @param props.segments The line Gigi says, with its highlights.
 * @param props.ctaLabel The label of the button that goes on.
 * @param props.onContinue Goes on with the tour.
 * @param props.onBack Goes back a scene, when there is one.
 * @param props.children What sits under the line.
 * @returns The scene.
 */
export const GigiVideoScene = (props: {
  video: GigiVideo;
  header: React.ReactNode;
  segments: HighlightSegment[];
  ctaLabel: string;
  onContinue: () => void;
  onBack?: () => void;
  children?: React.ReactNode;
}) => {
  const t = useTranslations('DemoPage');
  // Where the video is, once it actually plays: before that Gigi says nothing
  const [clock, setClock] = useState<{ time: number; duration: number } | null>(null);
  const [hasVideo, setHasVideo] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const hasAutoplayed = useRef(false);

  const sentences = splitSentences(props.segments);
  const starts = clock
    ? sentenceStarts({ sentences, duration: clock.duration, pauses: gigiPauses[props.video] })
    : [];
  const index = clock ? starts.findLastIndex((start) => start <= clock.time) : -1;
  const sentence = sentences[index] ?? [];
  const length = visibleLength(sentence);
  // Each sentence types out a little before the next one starts
  const seconds = (starts[index + 1] ?? clock?.duration ?? 0) - (starts[index] ?? 0);
  const sentenceTyped = useTimedSequence({
    target: length,
    intervalMs: Math.min(
      Math.max((seconds * 900) / Math.max(length, 1), TYPING_RANGE_MS.min),
      TYPING_RANGE_MS.max,
    ),
    restartKey: index,
  });
  const lineTyped = useTimedSequence({
    target: hasVideo ? 0 : visibleLength(props.segments),
    intervalMs: 25,
  });

  // Started from the ref rather than a media event, which may fire before hydration
  const autoplay = async (video: HTMLVideoElement) => {
    hasAutoplayed.current = true;
    const result = await startPlayback(video);

    // A missing file may fail before hydration, when onError is not listening yet
    if (result === 'blocked' && video.error) {
      setHasVideo(false);
    }

    setIsMuted(result === 'muted');
  };

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-4 px-4 py-6 text-center md:gap-6 md:py-10">
      {props.header}

      <div className="relative">
        {hasVideo ? (
          // oxlint-disable-next-line jsx-a11y/media-has-caption -- The same line is typed below the video; a captions track also showed on phones with captions turned on
          <video
            ref={(video) => {
              // startPlayback never rejects, so there is nothing to catch
              if (video && !hasAutoplayed.current) {
                void autoplay(video);
              }
            }}
            src={`/demo/gigi-${props.video}.mp4`}
            poster={`/demo/gigi-${props.video}.jpg`}
            playsInline
            preload="auto"
            className="h-[min(18rem,29svh)] w-auto rounded-3xl mix-blend-multiply md:h-80"
            onError={() => {
              setHasVideo(false);
            }}
            // `playing`, not `play`: the voice is only heard once the video has buffered
            onPlaying={(event) => {
              setClock(readClock(event.currentTarget));
            }}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              setClock((current) => current && readClock(video));
            }}
          />
        ) : (
          <Image
            src="/demo/giraffe.jpg"
            alt=""
            width={1152}
            height={1712}
            priority
            className="h-[min(18rem,29svh)] w-auto animate-giraffe-idle mix-blend-multiply motion-reduce:animate-none md:h-80"
          />
        )}

        {hasVideo && !clock && (
          <button
            type="button"
            onClick={async (event) => {
              const video = event.currentTarget.parentElement?.querySelector('video');

              try {
                if (video) {
                  video.muted = false;
                  await video.play();
                }
              } catch {
                // A browser that refuses to play falls back to the animated picture
                setHasVideo(false);
              }
            }}
            className="absolute inset-0 m-auto flex size-fit items-center gap-2 rounded-full bg-(--demo-primary) px-6 py-3.5 font-semibold text-(--demo-on-primary) shadow-2xl"
          >
            <Play className="size-5 fill-current" />
            {t('intro_listen')}
          </button>
        )}

        {hasVideo && clock && isMuted && (
          <button
            type="button"
            onClick={(event) => {
              const video = event.currentTarget.parentElement?.querySelector('video');

              if (video) {
                // Gigi starts over with sound, and the sentences follow him from the start
                video.muted = false;
                video.currentTime = 0;
              }

              setIsMuted(false);
            }}
            className="absolute inset-x-0 bottom-4 mx-auto flex w-fit animate-pop items-center gap-2 rounded-full bg-(--demo-primary) px-5 py-3 font-semibold text-(--demo-on-primary) shadow-2xl"
          >
            <Volume2 className="size-5" />
            {t('intro_unmute')}
          </button>
        )}
      </div>

      {/* Room for the longest sentence, so the screen does not move as they change */}
      <p className="min-h-[4lh] text-base leading-relaxed text-neutral-800 md:text-lg">
        {hasVideo ? (
          <TypedText segments={sentence} typed={sentenceTyped} />
        ) : (
          <TypedText segments={props.segments} typed={lineTyped} />
        )}
      </p>

      {props.children}

      {/* Kept in reach at the bottom while the line and the video fill the screen */}
      <div className="sticky bottom-0 -mx-4 -mb-6 flex w-[calc(100%+2rem)] justify-center bg-white/80 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:-mb-10">
        <div className="flex w-full max-w-xs gap-2">
          {props.onBack && (
            <button
              type="button"
              aria-label={t('back')}
              onClick={props.onBack}
              className="flex size-14 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <button
            type="button"
            onClick={props.onContinue}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-(--demo-primary) text-lg font-semibold text-(--demo-on-primary) shadow-xl"
          >
            {props.ctaLabel}
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
