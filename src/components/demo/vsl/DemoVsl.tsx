'use client';

import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState } from 'react';
import type { DemoVsl as DemoVslData } from '@/models/Schema';
import { GIGI_VOICE_TEMPO, toSpokenText } from '@/utils/GigiVoice';
import { captureDemoEvent } from '../DemoAnalytics';
import { sendDemoEvent } from '../DemoSession';
import type { DemoTourProps } from '../DemoTour';
import { DemoTracking } from '../DemoTour';
import { TypedText } from '../GiraffeSpeaker';
import { GirhouseLogo } from '../GirhouseLogo';
import { parseHighlights, visibleLength } from '../Highlights';
import { IPhoneFrame } from '../IPhoneFrame';
import { PriceCountdown } from '../PriceCountdown';
import type { BookingPhase } from '../steps/BookingStep';
import { BookingStep } from '../steps/BookingStep';
import { CrmStep } from '../steps/CrmStep';
import { FollowUpStep } from '../steps/FollowUpStep';
import { LandingStep } from '../steps/LandingStep';
import { PricingStep } from '../steps/PricingStep';
import { WhatsAppStep } from '../steps/WhatsAppStep';
import { TOUR_STEPS } from '../TourScenes';
import { useTimedSequence } from '../useTimedSequence';
import { WhatsAppChat } from '../WhatsAppChat';
import { GigiTalkingFull } from './GigiTalking';
import { VslBar } from './VslBar';
import type { VslLine, VslScene } from './VslScript';
import {
  buildVslScenes,
  spokenDurationMs,
  VSL_GAP_MS,
  vslLineMarkup,
  vslLineOf,
  vslLineValues,
  vslSceneMinimumMs,
  withVslChat,
} from './VslScript';

/** One of Gigi's lines, voiced by Kie. */
export type DemoVoice = { id: string; line: string; text: string; seconds: number };

/** The typing ends a little before the voice, so the words are never behind it. */
const TYPING_SHARE = 0.9;

/** Fallback for the length the start screen announces, when no voice is ready. */
const DEFAULT_MINUTES = 4;

/**
 * Keeps the demo's own pace: one step waiting at a time, and how long the scene has been
 * on screen, the time on pause left out.
 * @returns The clockRef.current.
 */
const createVslClock = () => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { run: () => void; due: number; remaining: number | null } | null = null;
  let sceneStart = 0;
  let pausedAt: number | null = null;

  const stop = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = null;
    pending = null;
  };

  const wait = (ms: number, run: () => void) => {
    stop();
    pending = { run, due: Date.now() + ms, remaining: null };
    timer = setTimeout(() => {
      timer = null;
      pending = null;
      run();
    }, ms);
  };

  return {
    wait,
    stop,
    startScene: () => {
      sceneStart = Date.now();
      pausedAt = null;
    },
    sceneElapsed: () => Date.now() - sceneStart,
    pause: () => {
      pausedAt = Date.now();

      if (timer && pending) {
        clearTimeout(timer);
        timer = null;
        pending = { ...pending, remaining: pending.due - Date.now() };
      }
    },
    // Says whether a step that was waiting is waiting again
    resume: () => {
      if (pausedAt !== null) {
        sceneStart += Date.now() - pausedAt;
        pausedAt = null;
      }

      if (pending?.remaining === null || !pending) {
        return false;
      }

      wait(Math.max(pending.remaining, 0), pending.run);

      return true;
    },
  };
};

/**
 * Plays a voice, the browser permitting.
 * @param audio The audio element.
 * @returns Whether it plays.
 */
const tryPlay = async (audio: HTMLAudioElement) => {
  try {
    await audio.play();

    return true;
  } catch {
    return false;
  }
};

/**
 * Picks the step a link points at, from the scene list of version B.
 * @param scenes The scenes.
 * @param step The step asked for, from 1.
 * @returns The index of its first scene, or 0.
 */
const firstVslSceneOf = (scenes: VslScene[], step: number | null) =>
  step
    ? Math.max(
        scenes.findIndex((scene) => scene.step === step),
        0,
      )
    : 0;

/**
 * Says how long the whole demo lasts, from its voices.
 * @param voices The voices ready.
 * @returns The minutes, rounded up.
 */
const estimateMinutes = (voices: DemoVoice[]) => {
  const seconds = voices.reduce((sum, voice) => sum + voice.seconds / GIGI_VOICE_TEMPO, 0);

  return seconds > 0 ? Math.ceil(seconds / 60) : DEFAULT_MINUTES;
};

/**
 * Picks the visual of a scene of version B.
 * @param options The scene and the demo data.
 * @param options.scene The current scene.
 * @param options.props The demo props.
 * @param options.data The snapshot with version B's chat.
 * @param options.bookingPhase Where the booking stands.
 * @param options.handleBookingPhase Moves the booking on.
 * @returns The scene's visual.
 */
const VslSceneVisual = (options: {
  scene: VslScene;
  props: DemoTourProps & { vsl: DemoVslData };
  data: DemoTourProps['data'];
  bookingPhase: BookingPhase;
  handleBookingPhase: (phase: BookingPhase) => void;
}) => {
  const t = useTranslations('DemoPage');
  const { scene, props, data } = options;

  if (scene.kind === 'landing') {
    return (
      <LandingStep
        data={data}
        reviews={props.reviews}
        photos={props.photos}
        sections={scene.sections}
        autoplayFunnel
      />
    );
  }

  if (scene.kind === 'chat') {
    return <WhatsAppStep data={data} upTo={scene.upTo} />;
  }

  if (scene.kind === 'reminder') {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="rounded-full bg-(--demo-primary) px-4 py-1.5 text-sm font-semibold text-(--demo-on-primary) shadow">
          {t('vsl_reminder_label', { title: props.vsl.reminder.title })}
        </p>
        <IPhoneFrame statusBarClassName="bg-[#f6f6f6] text-neutral-900">
          <WhatsAppChat
            company={data.company}
            messages={props.vsl.reminder.messages}
            upTo={props.vsl.reminder.messages.length}
            isReminder
          />
        </IPhoneFrame>
      </div>
    );
  }

  if (scene.kind === 'crm') {
    return <CrmStep data={data} part={scene.part} />;
  }

  if (scene.kind === 'followup') {
    return <FollowUpStep texts={props.vsl.followUp} />;
  }

  if (scene.kind === 'pricing') {
    return <PricingStep part={scene.part} company={data.company} {...props.pricing} />;
  }

  if (scene.kind === 'booking') {
    return (
      <BookingStep
        slug={props.slug}
        company={data.company}
        whatsappNumber={props.whatsappNumber}
        track={props.track}
        phase={options.bookingPhase}
        onPhase={options.handleBookingPhase}
      />
    );
  }

  // Gigi's own screens have their full-screen layout
  return null;
};

/**
 * Version B of the demo: a video sales letter. One tap starts it, then Gigi narrates every
 * scene with his own voice and the demo moves on by itself when he is done and the scene
 * has played. One audio element carries every line, so a phone that let it play once lets
 * it play to the end. Without a voice, a line stays on screen as long as it takes to say.
 * @param props Component props.
 * @param props.vsl The demo's version B.
 * @param props.voices Gigi's voiced lines.
 * @returns The video sales letter.
 */
export const DemoVsl = (props: DemoTourProps & { vsl: DemoVslData; voices: DemoVoice[] }) => {
  const t = useTranslations('DemoPage');
  const data = withVslChat(props.data, props.vsl);
  const scenes = buildVslScenes({ data, hasReviews: props.reviews.items.length > 0 });
  const [index, setIndex] = useState(() => firstVslSceneOf(scenes, props.initialStep));
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>('phone');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clockRef = useRef(createVslClock());
  // What the handlers read, since their timers outlive the render that set them
  const playback = useRef({ index, hasVoice: false, isLineDone: false });
  const scene = scenes[index] ?? scenes[0];

  const values = vslLineValues({
    company: data.company,
    customer: data.chat.customerName,
    reviews: props.reviews,
    price: props.pricing.price,
    slots: props.pricing.slots,
  });
  const markupOf = (line: VslLine) =>
    vslLineMarkup({
      line,
      vsl: props.vsl,
      translate: {
        fixed: (key) => t.markup(`vsl_line_${key}`, values),
        tour: (key) => t.markup(`line_${key}`, values),
      },
    });
  // A voice says its line only while the page still writes it the same way
  const voiceOf = (line: VslLine) => {
    const voice = props.voices.find((entry) => entry.line === line);

    return voice && voice.text === toSpokenText(markupOf(line)) ? voice : null;
  };

  const line = scene ? vslLineOf(scene, bookingPhase) : 'intro';
  const segments = parseHighlights(markupOf(line));
  const total = visibleLength(segments);
  const voice = voiceOf(line);
  const lineMs = voice
    ? (voice.seconds * 1000) / GIGI_VOICE_TEMPO
    : spokenDurationMs(markupOf(line));
  const typed = useTimedSequence({
    target: isStarted ? total : 0,
    intervalMs: (lineMs * TYPING_SHARE) / Math.max(total, 1),
    restartKey: `${index}-${line}`,
  });

  // Moves on once Gigi is done and the scene has played what it shows
  const moveOnLater = (advance: (next: number) => void) => {
    const { index: current } = playback.current;
    const target = scenes[current];

    if (!target || target.kind === 'booking' || current >= scenes.length - 1) {
      return;
    }

    const minimum = vslSceneMinimumMs({
      scene: target,
      previous: scenes[current - 1],
      reminderMessages: props.vsl.reminder.messages.length,
    });

    clockRef.current.wait(
      Math.max(minimum - clockRef.current.sceneElapsed(), 0) + VSL_GAP_MS,
      () => {
        advance(current + 1);
      },
    );
  };

  const finishLine = (advance: (next: number) => void) => {
    playback.current.isLineDone = true;
    setIsTalking(false);
    moveOnLater(advance);
  };

  const say = async (options: {
    index: number;
    line: VslLine;
    advance: (next: number) => void;
  }) => {
    const audio = audioRef.current;
    const next = voiceOf(options.line);

    clockRef.current.stop();
    clockRef.current.startScene();
    playback.current = { index: options.index, hasVoice: Boolean(next), isLineDone: false };
    setIsPaused(false);

    if (!audio || !next) {
      audio?.pause();
      setIsTalking(true);
      clockRef.current.wait(spokenDurationMs(markupOf(options.line)), () => {
        finishLine(options.advance);
      });

      return;
    }

    audio.src = `/api/demo-voices/${next.id}`;
    audio.playbackRate = GIGI_VOICE_TEMPO;

    // The browser wants a tap first: the demo waits on pause for it
    if (!(await tryPlay(audio))) {
      clockRef.current.pause();
      setIsPaused(true);
    }
  };

  const goTo = (next: number) => {
    const target = scenes[next];

    if (!target) {
      return;
    }

    if (props.track && target.step !== scene?.step && target.step > 0) {
      sendDemoEvent(props.slug, { type: 'step', step: target.step });
    }

    if (props.track) {
      captureDemoEvent('demo_scene', {
        version: 'b',
        scene: next,
        step: target.step,
        kind: target.kind,
        line: target.line,
        direction: next > playback.current.index ? 'next' : 'back',
      });
    }

    setIndex(next);

    if (target.step !== scene?.step || target.kind !== scene.kind) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    void say({ index: next, line: vslLineOf(target, bookingPhase), advance: goTo });
  };

  const pause = () => {
    audioRef.current?.pause();
    clockRef.current.pause();
    setIsTalking(false);
    setIsPaused(true);
  };

  const resume = async () => {
    const { hasVoice, isLineDone } = playback.current;
    const audio = audioRef.current;

    setIsPaused(false);

    if (clockRef.current.resume()) {
      setIsTalking(!isLineDone);
    }

    // Played from the tap, so a browser that blocked it lets it through now
    if (audio && hasVoice && !isLineDone && !(await tryPlay(audio))) {
      finishLine(goTo);
    }
  };

  const tracking = props.track ? (
    <DemoTracking slug={props.slug} company={data.company} initialStep={props.initialStep} />
  ) : null;

  const audio = (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- Every line is typed in the bar while it is said
    <audio
      ref={(element) => {
        audioRef.current = element;
      }}
      preload="auto"
      onPlaying={() => {
        setIsTalking(true);
      }}
      onEnded={() => {
        finishLine(goTo);
      }}
      onPause={() => {
        // A phone pauses the voice when the page goes to the background: the demo waits too
        if (document.visibilityState === 'hidden' && !playback.current.isLineDone) {
          pause();
        }
      }}
      onError={() => {
        // A voice that does not load is typed for as long as it takes to say
        if (playback.current.hasVoice && !playback.current.isLineDone) {
          playback.current.hasVoice = false;
          clockRef.current.wait(spokenDurationMs(markupOf(line)), () => {
            finishLine(goTo);
          });
        }
      }}
    />
  );

  if (!scene) {
    return null;
  }

  const handleBookingPhase = (phase: BookingPhase) => {
    setBookingPhase(phase);
    void say({ index, line: `booking_${phase}`, advance: goTo });
  };

  const togglePause = () => {
    if (isPaused) {
      void resume();
    } else {
      pause();
    }
  };

  const isGigiScreen = scene.kind === 'intro' || scene.kind === 'video';
  const isPricing = scene.kind === 'pricing';
  const content =
    !isStarted || isGigiScreen ? (
      <>
        {/* The landing's photos load while Gigi introduces himself; React moves these into the head */}
        {props.photos.slice(0, 2).map((photo) => (
          <link key={photo.src} rel="preload" as="image" href={photo.src} />
        ))}
        <header className="absolute inset-x-0 top-0 z-10 flex justify-center py-5">
          <GirhouseLogo tone="black" className="h-8 md:h-9" />
        </header>
        <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-4 px-4 py-6 text-center md:gap-6 md:py-10">
          <h1 className="pt-10 text-3xl leading-tight font-bold tracking-tight text-balance wrap-anywhere text-neutral-950 md:text-4xl">
            {scene.kind === 'video'
              ? t('pricing_video_headline')
              : t.rich('intro_headline', {
                  company: data.company,
                  b: (chunks) => <span className="text-(--demo-primary)">{chunks}</span>,
                })}
          </h1>

          {isStarted ? (
            <GigiTalkingFull isTalking={isTalking} />
          ) : (
            <div className="relative">
              <Image
                src="/demo/gigi-talk.jpg"
                alt=""
                width={483}
                height={720}
                priority
                className="h-[min(18rem,29svh)] w-auto rounded-3xl mix-blend-multiply md:h-80"
              />
              <button
                type="button"
                onClick={() => {
                  setIsStarted(true);

                  if (props.track) {
                    captureDemoEvent('demo_vsl_start', { scene: index });
                  }

                  // Played from the tap itself, which is what lets the voice be heard
                  void say({ index, line, advance: goTo });
                }}
                className="absolute inset-0 m-auto flex size-fit animate-pop items-center gap-2 rounded-full bg-(--demo-primary) px-7 py-4 text-lg font-semibold whitespace-nowrap text-(--demo-on-primary) shadow-2xl"
              >
                <Play className="size-6 fill-current" />
                {t('vsl_start')}
              </button>
            </div>
          )}

          {isStarted ? (
            <p className="min-h-[4lh] text-base leading-relaxed text-neutral-800 md:text-lg">
              <TypedText segments={segments} typed={typed} />
            </p>
          ) : (
            <p className="text-sm text-neutral-500">
              {t('vsl_start_hint', { minutes: estimateMinutes(props.voices) })}
            </p>
          )}

          {scene.kind === 'video' && (
            // The line says "the next few days": the real date is right here
            <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#0074F2] to-[#06287f] p-1 text-white empty:hidden">
              <PriceCountdown
                increaseOn={props.pricing.increaseOn}
                increaseLabel={props.pricing.increaseLabel}
              />
            </div>
          )}

          {isStarted && (
            <button
              type="button"
              onClick={togglePause}
              className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700"
            >
              {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {isPaused ? t('vsl_resume') : t('vsl_pause')}
            </button>
          )}
        </div>
      </>
    ) : (
      <div
        className={`min-h-svh overflow-x-clip pb-[calc(var(--demo-bar-h,6rem)+1.5rem)] ${isPricing ? 'bg-gradient-to-b from-[#0074F2] via-[#0a52d4] to-[#06287f]' : ''}`}
      >
        {/* Above the mockups, whose own layers stay inside `main` */}
        <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs font-medium text-neutral-500">
            <span className="flex min-w-0 items-center gap-2">
              <GirhouseLogo tone="black" className="h-5 shrink-0" />
              <span className="truncate font-semibold text-neutral-800">
                {t('topbar_brand', { company: data.company })}
              </span>
            </span>
            <span className="shrink-0">
              {t('topbar_step', { step: scene.step, total: TOUR_STEPS })}
            </span>
          </div>
          {/* Fills as the demo plays, scene by scene */}
          <div aria-hidden className="h-1.5 bg-neutral-100">
            <div
              className="h-full rounded-r-full bg-(--demo-primary) transition-[width] duration-700 ease-out"
              style={{ width: `${(index / (scenes.length - 1)) * 100}%` }}
            />
          </div>
        </header>

        <main
          key={`${scene.step}-${scene.kind === 'reminder'}`}
          className={`isolate mx-auto max-w-7xl animate-in px-4 duration-500 fade-in ${isPricing ? 'py-4 md:py-6' : 'py-6 md:py-10'}`}
        >
          <VslSceneVisual
            scene={scene}
            props={props}
            data={data}
            bookingPhase={bookingPhase}
            handleBookingPhase={handleBookingPhase}
          />
        </main>

        <VslBar
          segments={segments}
          typed={typed}
          isTalking={isTalking}
          isPaused={isPaused}
          isQuiet={isPricing}
          isLast={index === scenes.length - 1}
          onBack={() => {
            goTo(Math.max(index - 1, 0));
          }}
          onTogglePause={togglePause}
          onSkip={() => {
            goTo(index + 1);
          }}
        />
      </div>
    );

  // The audio element keeps its place whatever the screen, so the one a tap unlocked plays to the end
  return (
    <>
      {tracking}
      {audio}
      {content}
    </>
  );
};
