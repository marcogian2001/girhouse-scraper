'use client';

import { ArrowLeft, ArrowRight, Play, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { TypedText } from './GiraffeSpeaker';
import type { HighlightSegment } from './Highlights';
import { visibleLength } from './Highlights';
import { useTimedSequence } from './useTimedSequence';

/** Gigi's videos, made by `scripts/generate-gigi-video.ts`. */
export type GigiVideo = 'intro' | 'pricing';

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
 * Gigi full screen on video, reading the line typed below him, then a button to go on.
 * Used for the first screen and before the price. The video starts on its own, muted
 * with a "turn on sound" button when the browser blocks sound, and on a tap when it
 * blocks autoplay altogether; without the video file the animated picture stands in.
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
  const total = visibleLength(props.segments);
  const [playback, setPlayback] = useState<{ intervalMs: number; run: number } | null>(null);
  const [hasVideo, setHasVideo] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const hasAutoplayed = useRef(false);
  const typed = useTimedSequence({
    target: playback || !hasVideo ? total : 0,
    intervalMs: playback?.intervalMs ?? 25,
    restartKey: playback ? `playing-${playback.run}` : 'idle',
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
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {props.header}

      <div className="relative">
        {hasVideo ? (
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
            className="h-72 w-auto rounded-3xl mix-blend-multiply md:h-80"
            onError={() => {
              setHasVideo(false);
            }}
            onPlay={(event) => {
              const seconds = event.currentTarget.duration;

              // The text types along with the voice, finishing a little before it
              setPlayback({
                intervalMs: Number.isFinite(seconds) ? (seconds * 900) / total : 45,
                run: 0,
              });
            }}
          >
            {/* Off by default: the same line is typed below the video */}
            <track
              kind="captions"
              src={`/demo/gigi-${props.video}.vtt`}
              srcLang="it"
              label="Italiano"
            />
          </video>
        ) : (
          <Image
            src="/demo/giraffe.jpg"
            alt=""
            width={1152}
            height={1712}
            priority
            className="h-72 w-auto animate-giraffe-idle mix-blend-multiply motion-reduce:animate-none md:h-80"
          />
        )}

        {hasVideo && !playback && (
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

        {hasVideo && playback && isMuted && (
          <button
            type="button"
            onClick={(event) => {
              const video = event.currentTarget.parentElement?.querySelector('video');

              if (video) {
                // Gigi starts over with sound, and the line types again with him
                video.muted = false;
                video.currentTime = 0;
              }

              setIsMuted(false);
              setPlayback({ ...playback, run: playback.run + 1 });
            }}
            className="absolute inset-x-0 bottom-4 mx-auto flex w-fit animate-pop items-center gap-2 rounded-full bg-(--demo-primary) px-5 py-3 font-semibold text-(--demo-on-primary) shadow-2xl"
          >
            <Volume2 className="size-5" />
            {t('intro_unmute')}
          </button>
        )}
      </div>

      <p className="min-h-24 text-lg leading-relaxed text-neutral-800">
        <TypedText segments={props.segments} typed={typed} />
      </p>

      {props.children}

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
  );
};
