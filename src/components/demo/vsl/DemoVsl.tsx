'use client';

import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState } from 'react';
import type { DemoVsl as DemoVslData } from '@/models/Schema';
import { toSpokenText } from '@/utils/GigiVoice';
import type { Narrator } from '@/utils/HostVoice';
import { HOST_VOICE_TEMPO } from '@/utils/HostVoice';
import type { VslChapter, VslSound } from '@/utils/VslMusic';
import {
  MUSIC_CROSSFADE_SECONDS,
  musicPath,
  SOUND_GAIN,
  VSL_CHAPTERS,
  VSL_SOUNDS,
} from '@/utils/VslMusic';
import { captureDemoEvent } from '../DemoAnalytics';
import { parseDemoProgress, saveDemoProgress } from '../DemoProgress';
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
import { TimelinePause, useTimedSequence } from '../useTimedSequence';
import { WhatsAppChat } from '../WhatsAppChat';
import { DiyScene } from './DiyScene';
import { GoogleScene } from './GoogleScene';
import { HostTalkingFull, hostPoster } from './HostTalking';
import { MissedCallScene } from './MissedCallScene';
import { PhotoScene } from './PhotoScene';
import { ReviewRequestScene } from './ReviewRequestScene';
import { ReviewsScene } from './ReviewsScene';
import { SceneLabel } from './SceneLabel';
import { SiteScene } from './SiteScene';
import { SocialRequestScene } from './SocialRequestScene';
import { VideoCallBooking, VideoCallLink, VideoMainAction } from './VideoClosingStep';
import { VideoOfferStep } from './VideoOfferStep';
import type { VideoClosing, VideoLine } from './VideoScript';
import {
  buildVideoScenes,
  isPortraitLine,
  VIDEO_CLOSING,
  videoBookingLine,
  isVideoLine,
  landscapeLine,
  portraitLine,
  videoLineMarkup,
  videoLinesToVoice,
} from './VideoScript';
import { VolumeHint } from './VolumeHint';
import { VslBar } from './VslBar';
import type { VslLine, VslScene } from './VslScript';
import {
  buildVslScenes,
  spokenDurationMs,
  VSL_FOLLOW_UP_STEP_MS,
  VSL_GAP_MS,
  VSL_VOICE_TEMPO,
  vslLineMarkup,
  vslLineOf,
  vslLinesToVoice,
  vslLineValues,
  vslSceneMinimumMs,
  withVslChat,
} from './VslScript';

/** The wording of the start screen, for the new video and for version B. */
const START_COPY = {
  video: {
    headline: 'video_headline',
    start: 'video_start',
    page: 'flex flex-col',
    main: 'w-full',
  },
  vsl: { headline: 'intro_headline', start: 'vsl_start', page: '', main: '' },
} as const;

/** One of Gigi's lines, voiced by Kie. */
export type DemoVoice = { id: string; line: string; text: string; seconds: number };

/** The photo Kie made behind one of Gigi's lines. */
export type VslPhoto = { id: string; line: string; prompt: string };

/** A scene's photo, wide for large screens and tall for phones, either one if made. */
type ScenePhoto = { landscape: string | null; portrait: string | null };

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
 * Downloads every voice ahead, one after the other in the order they are said, so a new
 * scene starts speaking at once instead of waiting for its file.
 * @param voices The voices, in the order they are said.
 * @param files Where the downloaded files go, by voice id, as object URLs.
 */
const preloadVoices = async (voices: DemoVoice[], files: Map<string, string>) => {
  for (const voice of voices) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(`/api/demo-voices/${voice.id}`);

      if (response.ok) {
        // oxlint-disable-next-line no-await-in-loop
        files.set(voice.id, URL.createObjectURL(await response.blob()));
      }
    } catch {
      // A voice that did not download is fetched when it is said
    }
  }
};

/** How long one chapter's music takes to fade into the next. */
const MUSIC_FADE_SECONDS = 0.8;

/** The music's level under the voice, on top of its quiet mix: half, about -6 dB. */
const MUSIC_GAIN = 0.5;

/**
 * Plays the music under the voice with Web Audio, one track per chapter, fading from one
 * to the next with a whoosh, plus the sounds each scene cues. Web Audio loops a track
 * without a gap and keeps it going next to the voice on phones. Everything is mixed quiet
 * in the files themselves, as phones ignore a page's volume.
 * @returns The soundtrack.
 */
const createSoundtrack = () => {
  let context: AudioContext | null = null;
  let current: { chapter: VslChapter; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  let wanted: VslChapter | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();

  const load = async (audio: AudioContext, path: string) => {
    const known = buffers.get(path);

    if (known) {
      return await known;
    }

    const loading = (async () => {
      try {
        const response = await fetch(path);

        return response.ok ? await audio.decodeAudioData(await response.arrayBuffer()) : null;
      } catch {
        // Without a file the demo still plays, a little quieter
        return null;
      }
    })();
    buffers.set(path, loading);

    return await loading;
  };

  const sound = async (name: VslSound) => {
    const audio = context;
    const buffer = audio ? await load(audio, `/demo/sfx/${name}.mp3`) : null;

    if (!audio || !buffer) {
      return;
    }

    const source = audio.createBufferSource();
    const gain = audio.createGain();

    source.buffer = buffer;
    gain.gain.value = SOUND_GAIN[name];
    source.connect(gain).connect(audio.destination);
    source.start();
  };

  const play = async (chapter: VslChapter) => {
    const audio = context;
    // A chapter whose track is missing keeps the dream's
    const buffer = audio
      ? ((await load(audio, musicPath(chapter))) ?? (await load(audio, musicPath('dream'))))
      : null;

    // Another chapter was asked for while this one loaded
    if (!audio || !buffer || wanted !== chapter) {
      return;
    }

    const now = audio.currentTime;
    const source = audio.createBufferSource();
    const gain = audio.createGain();

    if (current) {
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_SECONDS);
      current.source.stop(now + MUSIC_FADE_SECONDS + 0.05);
    }

    source.buffer = buffer;
    source.loop = true;
    // The track's end fades into its start, so it loops back right after that part
    source.loopStart = MUSIC_CROSSFADE_SECONDS;
    source.loopEnd = buffer.duration;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN, now + MUSIC_FADE_SECONDS);
    source.connect(gain).connect(audio.destination);
    source.start();
    current = { chapter, source, gain };
  };

  return {
    // Called from the tap, which is what lets the page make a sound
    start: () => {
      if (context) {
        return;
      }

      const audio = new AudioContext();
      context = audio;
      void audio.resume();

      for (const chapter of VSL_CHAPTERS) {
        void load(audio, musicPath(chapter));
      }

      for (const name of VSL_SOUNDS) {
        void load(audio, `/demo/sfx/${name}.mp3`);
      }
    },
    setChapter: (chapter: VslChapter) => {
      if (wanted === chapter) {
        return;
      }

      // The first chapter just starts; the others are announced by a whoosh
      if (wanted) {
        void sound('whoosh');
      }

      wanted = chapter;
      void play(chapter);
    },
    sound: (name: VslSound) => {
      void sound(name);
    },
    pause: () => {
      void context?.suspend();
    },
    resume: () => {
      void context?.resume();
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
 * Picks the scene the demo opens on: the step a link points at, otherwise the scene this
 * browser stopped on last time, otherwise the start.
 * @param options The scenes and what the page was opened with.
 * @param options.scenes The scenes.
 * @param options.initialStep The step a link asked for, if any.
 * @param options.savedProgress The progress cookie, if any.
 * @returns The scene, and whether it picks up a previous visit.
 */
const openingSceneOf = (options: {
  scenes: VslScene[];
  initialStep: number | null;
  savedProgress: string | null;
}) => {
  const resumed = options.initialStep
    ? null
    : parseDemoProgress({ saved: options.savedProgress, count: options.scenes.length });

  return {
    index: resumed ?? firstVslSceneOf(options.scenes, options.initialStep),
    isResumed: resumed !== null,
  };
};

/**
 * Tells whether Gigi fills the screen: on his own scenes, and before the first tap unless
 * the demo reopens on a scene it stopped on.
 * @param options Where the demo stands.
 * @param options.scene The scene on screen.
 * @param options.isStarted Whether the first tap happened.
 * @param options.isResumed Whether the demo reopened where it stopped.
 * @returns True for the full-screen host.
 */
const showsHostScreen = (options: { scene: VslScene; isStarted: boolean; isResumed: boolean }) =>
  options.scene.kind === 'intro' ||
  options.scene.kind === 'video' ||
  (!options.isStarted && !options.isResumed);

/** Scenes that fill the screen with the offer, so they keep less room above and below. */
const COMPACT_KINDS = new Set<VslScene['kind']>(['pricing', 'offer', 'closing']);

/** Scenes only version B has, drawn by `VslStoryVisual`. */
const STORY_KINDS = new Set<VslScene['kind']>([
  'problem',
  'loss',
  'dream',
  'missed_call',
  'reviews',
  'reminder',
]);

/** Scenes that build on the one before, staying on screen while they change. */
const CONTINUED_KINDS = new Set<VslScene['kind']>([
  'diy',
  'chat',
  'crm',
  'landing',
  'pricing',
  'site',
  'offer',
]);

/**
 * Names what stays on screen across scenes: a chat that goes on, the page that grows, the
 * CRM's views; every other scene starts afresh.
 * @param scene The scene.
 * @param index Its place in the demo.
 * @returns The key of what it shows.
 */
const sceneGroup = (scene: VslScene, index: number) => {
  // The closing stays on the offer's screen
  if (scene.kind === 'closing') {
    return 'offer';
  }

  return CONTINUED_KINDS.has(scene.kind) ? scene.kind : `${scene.kind}-${index}`;
};

/**
 * Says how fast the page plays a narrator's voice.
 * @param narrator Who narrates.
 * @returns The playback rate.
 */
const voiceTempo = (narrator: Narrator) =>
  narrator === 'gianmarco' ? HOST_VOICE_TEMPO : VSL_VOICE_TEMPO;

/**
 * Says how long the whole demo lasts, from its voices.
 * @param voices The voices ready.
 * @param tempo How fast they play.
 * @returns The minutes, rounded up.
 */
const estimateMinutes = (voices: DemoVoice[], tempo: number) => {
  // The new video's booking lines are only said to those who book
  const seconds = voices
    .filter((voice) => !voice.line.startsWith('video_line_booking_'))
    .reduce((sum, voice) => sum + voice.seconds / tempo, 0);

  return seconds > 0 ? Math.ceil(seconds / 60) : DEFAULT_MINUTES;
};

/**
 * Reads how a video ends: every version C on buying now, whatever closing it was written
 * with while the three were under test; version B has none.
 * @param vsl The demo's script.
 * @returns The closing, or nothing for version B.
 */
const closingOf = (vsl: Pick<DemoVslData, 'closing'>) => (vsl.closing ? VIDEO_CLOSING : undefined);

/**
 * Builds the scenes: a video with a closing is version C, one without is version B.
 * @param options What is known.
 * @param options.data The snapshot with the video's chat.
 * @param options.closing How the video ends, if it is version C.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The scenes.
 */
const scenesOf = (options: {
  data: DemoTourProps['data'];
  closing: VideoClosing | undefined;
  hasReviews: boolean;
}) =>
  options.closing
    ? buildVideoScenes({ data: options.data, closing: options.closing })
    : buildVslScenes(options);

/**
 * Lists the lines to voice ahead, for version C or B.
 * @param scenes The scenes.
 * @param closing How the video ends, if it is version C.
 * @returns The lines, in the order they are said.
 */
const linesToVoice = (scenes: VslScene[], closing: VideoClosing | undefined) =>
  closing ? videoLinesToVoice(scenes, closing) : vslLinesToVoice(scenes);

/**
 * Names the line a scene says, the closing's being the booking's once that is open.
 * @param options The scene.
 * @param options.scene The scene.
 * @param options.bookingPhase Where the booking stands.
 * @param options.isCallOpen Whether the closing shows the booking.
 * @returns The line.
 */
const lineOfScene = (options: {
  scene: VslScene;
  bookingPhase: BookingPhase;
  isCallOpen: boolean;
}) =>
  options.scene.kind === 'closing' && options.scene.closing && options.isCallOpen
    ? videoBookingLine({ phase: options.bookingPhase, closing: options.scene.closing })
    : vslLineOf(options.scene, options.bookingPhase);

/**
 * Picks the visual of the scenes only version B has: the problems and the dream on a photo,
 * the missed call, the reminder and the review system.
 * @param props Component props.
 * @param props.scene The current scene.
 * @param props.vsl The demo's version B.
 * @param props.data The snapshot with version B's chat.
 * @param props.photo The photo of the problem or the dream, if made.
 * @returns The scene's visual, or nothing for the other scenes.
 */
const VslStoryVisual = (props: {
  scene: VslScene;
  vsl: DemoVslData;
  data: DemoTourProps['data'];
  photo: ScenePhoto;
}) => {
  const t = useTranslations('DemoPage');
  const { scene, data } = props;

  if (scene.kind === 'problem') {
    return <PhotoScene src={props.photo.landscape} problem={scene.case} />;
  }

  if (scene.kind === 'loss') {
    return (
      <PhotoScene src={props.photo.landscape} portrait={props.photo.portrait} loss={scene.loss} />
    );
  }

  if (scene.kind === 'dream') {
    return <PhotoScene src={props.photo.landscape} />;
  }

  if (scene.kind === 'missed_call') {
    return (
      <MissedCallScene
        company={data.company}
        message={props.vsl.missedCall?.message ?? t('vsl_missed_message')}
        reply={props.vsl.missedCall?.reply ?? t('vsl_missed_reply')}
      />
    );
  }

  if (scene.kind === 'reviews') {
    return <ReviewsScene company={data.company} customer={data.chat.customerName} />;
  }

  if (scene.kind === 'reminder') {
    return (
      <div className="flex flex-col items-center gap-3">
        {props.vsl.closing ? (
          <SceneLabel>{t('vsl_reminder_label', { title: props.vsl.reminder.title })}</SceneLabel>
        ) : (
          <p className="rounded-full bg-(--demo-primary) px-4 py-1.5 text-sm font-semibold text-(--demo-on-primary) shadow">
            {t('vsl_reminder_label', { title: props.vsl.reminder.title })}
          </p>
        )}
        <IPhoneFrame statusBarClassName="bg-[#f6f6f6] text-neutral-900" reserve="label">
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

  return null;
};

/**
 * The offer of version C with its buttons, or the booking once a call is asked for.
 * @param options The screen.
 * @param options.props The demo props.
 * @param options.closing How the video ends.
 * @param options.company The business name.
 * @param options.part How much of the offer shows, from 1 to 3.
 * @param options.spoken What Gigi says, so the price changes as he says it.
 * @param options.isCallOpen Whether the booking shows.
 * @param options.bookingPhase Where the booking stands.
 * @param options.onBookingPhase Moves the booking on.
 * @param options.onOpenCall Opens the booking.
 * @param options.onCloseCall Goes back to the offer.
 * @returns The screen.
 */
const VideoOfferScreen = (options: {
  props: DemoTourProps;
  closing: VideoClosing;
  company: string;
  part: number;
  spoken: { text: string; typed: number };
  isCallOpen: boolean;
  bookingPhase: BookingPhase;
  onBookingPhase: (phase: BookingPhase) => void;
  onOpenCall: () => void;
  onCloseCall: () => void;
}) => {
  const { props } = options;
  const handleBookingPhase = options.onBookingPhase;
  const handleOpenCall = options.onOpenCall;
  const handleCloseCall = options.onCloseCall;

  return options.isCallOpen ? (
    <VideoCallBooking
      slug={props.slug}
      company={options.company}
      whatsappNumber={props.whatsappNumber}
      track={props.track}
      closing={options.closing}
      bookingPhase={options.bookingPhase}
      onBookingPhase={handleBookingPhase}
      onBack={handleCloseCall}
    />
  ) : (
    <VideoOfferStep
      part={options.part}
      spoken={options.spoken}
      price={props.pricing.price}
      action={
        <VideoMainAction
          slug={props.slug}
          track={props.track}
          closing={options.closing}
          onOpenCall={handleOpenCall}
        />
      }
      callLink={
        options.closing === 'both' ? (
          <VideoCallLink track={props.track} onOpenCall={handleOpenCall} />
        ) : null
      }
    />
  );
};

/**
 * Picks the visual of a scene of version B.
 * @param options The scene and the demo data.
 * @param options.scene The current scene.
 * @param options.props The demo props.
 * @param options.data The snapshot with version B's chat.
 * @param options.photo The photo of the problem or the dream, if made.
 * @param options.spoken What Gigi says on the scene and how much of it is out, to show things as he names them.
 * @param options.onCost Plays the sound of a cost that just showed.
 * @param options.bookingPhase Where the booking stands.
 * @param options.handleBookingPhase Moves the booking on.
 * @param options.isCallOpen Whether the closing shows the booking.
 * @param options.handleOpenCall Opens the booking from the offer.
 * @param options.handleCloseCall Goes back from the booking to the offer.
 * @returns The scene's visual.
 */
const VslSceneVisual = (options: {
  scene: VslScene;
  props: DemoTourProps & { vsl: DemoVslData };
  data: DemoTourProps['data'];
  photo: ScenePhoto;
  spoken: { text: string; typed: number };
  onCost: () => void;
  bookingPhase: BookingPhase;
  handleBookingPhase: (phase: BookingPhase) => void;
  isCallOpen: boolean;
  handleOpenCall: () => void;
  handleCloseCall: () => void;
}) => {
  const { scene, props, data } = options;
  const handleCost = options.onCost;
  const story = <VslStoryVisual scene={scene} vsl={props.vsl} data={data} photo={options.photo} />;

  if (STORY_KINDS.has(scene.kind)) {
    return story;
  }

  if (scene.kind === 'landing') {
    return (
      <LandingStep
        data={data}
        reviews={props.reviews}
        photos={props.photos}
        sections={scene.sections}
      />
    );
  }

  if (scene.kind === 'google') {
    return <GoogleScene data={data} reviews={props.reviews} photo={props.photos.at(0)?.src} />;
  }

  if (scene.kind === 'site') {
    return (
      <SiteScene
        data={data}
        reviews={props.reviews}
        photos={props.photos}
        spoken={options.spoken}
      />
    );
  }

  if (scene.kind === 'review_request' && props.vsl.reviewRequest) {
    return <ReviewRequestScene company={data.company} texts={props.vsl.reviewRequest} />;
  }

  if (scene.kind === 'social' && props.vsl.socialRequest) {
    return <SocialRequestScene company={data.company} texts={props.vsl.socialRequest} />;
  }

  if (scene.kind === 'diy') {
    return (
      <DiyScene
        part={scene.part}
        texts={props.vsl.diy}
        spoken={options.spoken}
        onCost={handleCost}
      />
    );
  }

  // The offer and the closing are one screen: the price with its button, or the booking
  if ((scene.kind === 'offer' || scene.kind === 'closing') && props.vsl.closing) {
    return (
      <VideoOfferScreen
        props={props}
        closing={VIDEO_CLOSING}
        company={data.company}
        part={scene.kind === 'offer' ? scene.part : 3}
        spoken={options.spoken}
        isCallOpen={options.isCallOpen}
        bookingPhase={options.bookingPhase}
        onBookingPhase={options.handleBookingPhase}
        onOpenCall={options.handleOpenCall}
        onCloseCall={options.handleCloseCall}
      />
    );
  }

  if (scene.kind === 'chat') {
    return <WhatsAppStep data={data} upTo={scene.upTo} />;
  }

  if (scene.kind === 'crm') {
    return <CrmStep data={data} part={scene.part} />;
  }

  if (scene.kind === 'followup') {
    return <FollowUpStep texts={props.vsl.followUp} stepMs={VSL_FOLLOW_UP_STEP_MS} />;
  }

  if (scene.kind === 'pricing') {
    return (
      <PricingStep part={scene.part} company={data.company} {...props.pricing} isBookingDeadline />
    );
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
 * The tap that starts the demo.
 * @param props Component props.
 * @param props.label The start label of this version.
 * @param props.onStart Starts the demo.
 * @returns The button.
 */
const VslStartButton = (props: {
  label: (typeof START_COPY)[keyof typeof START_COPY]['start'];
  onStart: () => void;
}) => {
  const t = useTranslations('DemoPage');

  return (
    <button
      type="button"
      onClick={props.onStart}
      className="flex animate-pop items-center gap-2 rounded-full bg-(--demo-primary) px-7 py-4 text-lg font-semibold whitespace-nowrap text-(--demo-on-primary) shadow-2xl"
    >
      <Play className="size-6 fill-current" />
      {t(props.label)}
    </button>
  );
};

/**
 * Version B of the demo: a video sales letter. One tap starts it, then Gigi narrates every
 * scene with his own voice and the demo moves on by itself when he is done and the scene
 * has played. One audio element carries every line, so a phone that let it play once lets
 * it play to the end. Without a voice, a line stays on screen as long as it takes to say.
 * @param props Component props.
 * @param props.vsl The demo's version B.
 * @param props.voices Gigi's voiced lines.
 * @param props.vslPhotos The photos behind the problems and the dream.
 * @returns The video sales letter.
 */
export const DemoVsl = (
  props: DemoTourProps & { vsl: DemoVslData; voices: DemoVoice[]; vslPhotos: VslPhoto[] },
) => {
  const t = useTranslations('DemoPage');
  const data = withVslChat(props.data, props.vsl);
  const closing = closingOf(props.vsl);
  const startCopy = closing ? START_COPY.video : START_COPY.vsl;
  const narrator = props.vsl.narrator ?? 'gigi';
  const tempo = voiceTempo(narrator);
  const poster = hostPoster(narrator);
  // Version C has a closing; version B never does
  const scenes = scenesOf({ data, closing, hasReviews: props.reviews.items.length > 0 });
  // Reopened where it stopped, the demo shows that scene paused until a tap lets the voice play
  const opening = openingSceneOf({
    scenes,
    initialStep: props.initialStep,
    savedProgress: props.savedProgress,
  });
  const [index, setIndex] = useState(opening.index);
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>('phone');
  const [isCallOpen, setIsCallOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef(createSoundtrack());
  // The sounds the scene on screen still has to play
  const cueTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The voices downloaded ahead, by id, from when the page opens
  const voiceFiles = useRef(new Map<string, string>());
  const hasPreloaded = useRef(false);
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
  const markupOf = (line: VslLine | VideoLine) =>
    isVideoLine(line)
      ? videoLineMarkup({
          line,
          vsl: props.vsl,
          translate: (key) => t.markup(key, values),
        })
      : vslLineMarkup({
          line,
          vsl: props.vsl,
          translate: {
            fixed: (key) => t.markup(`vsl_line_${key}`, values),
            tour: (key) => t.markup(`line_${key}`, values),
          },
        });
  // A voice says its line only while the page still writes it the same way
  const voiceOf = (line: VslLine | VideoLine) => {
    const voice = props.voices.find((entry) => entry.line === line);

    return voice && voice.text === toSpokenText(markupOf(line)) ? voice : null;
  };
  // A photo goes behind its line only while the script still asks for it
  const photos = new Map(
    props.vslPhotos
      .filter((photo) => photo.prompt === props.vsl.images?.[landscapeLine(photo.line)])
      .map((photo) => [photo.line, `/api/demo-photos/${photo.id}`]),
  );
  const photoOf = (line: VslLine | VideoLine): ScenePhoto => ({
    landscape: photos.get(line) ?? null,
    portrait: photos.get(portraitLine(line)) ?? null,
  });

  const line: VslLine | VideoLine = scene
    ? lineOfScene({ scene, bookingPhase, isCallOpen })
    : 'intro';
  const segments = parseHighlights(markupOf(line));
  const total = visibleLength(segments);
  const voice = voiceOf(line);
  const lineMs = voice ? (voice.seconds * 1000) / tempo : spokenDurationMs(markupOf(line));
  const typed = useTimedSequence({
    target: isStarted ? total : 0,
    intervalMs: (lineMs * TYPING_SHARE) / Math.max(total, 1),
    restartKey: `${index}-${line}`,
    isPaused,
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
    line: VslLine | VideoLine;
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

    audio.src = voiceFiles.current.get(next.id) ?? `/api/demo-voices/${next.id}`;
    audio.playbackRate = tempo;

    // The browser wants a tap first: the demo waits on pause for it
    if (!(await tryPlay(audio))) {
      clockRef.current.pause();
      setIsPaused(true);
    }
  };

  const clearCues = () => {
    for (const timer of cueTimers.current) {
      clearTimeout(timer);
    }

    cueTimers.current = [];
  };

  // Starts a scene's music and plays its sounds on their cues
  const enterScene = (target: VslScene) => {
    clearCues();
    musicRef.current.setChapter(target.chapter);
    cueTimers.current = target.cues.map((cue) =>
      setTimeout(() => {
        musicRef.current.sound(cue.sound);
      }, cue.atMs),
    );
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
        version: closing ? 'c' : 'b',
        closing,
        scene: next,
        step: target.step,
        kind: target.kind,
        line: target.line,
        direction: next > playback.current.index ? 'next' : 'back',
      });
    }

    setIndex(next);
    void saveDemoProgress({ slug: props.slug, scene: next, count: scenes.length });
    enterScene(target);

    if (target.step !== scene?.step || target.kind !== scene.kind) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    void say({
      index: next,
      line: lineOfScene({ scene: target, bookingPhase, isCallOpen }),
      advance: goTo,
    });
  };

  const pause = () => {
    audioRef.current?.pause();
    musicRef.current.pause();
    clearCues();
    clockRef.current.pause();
    setIsTalking(false);
    setIsPaused(true);
  };

  const resume = async () => {
    const { hasVoice, isLineDone } = playback.current;
    const audio = audioRef.current;

    setIsPaused(false);

    musicRef.current.resume();

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

  const voicesInOrder = linesToVoice(scenes, closing).flatMap((entry) => {
    const said = voiceOf(entry);

    return said ? [said] : [];
  });

  const audio = (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- Every line is typed in the bar while it is said
    <audio
      ref={(element) => {
        audioRef.current = element;

        if (element && !hasPreloaded.current) {
          hasPreloaded.current = true;
          void preloadVoices(voicesInOrder, voiceFiles.current);
        }
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
    void say({
      index,
      line: closing ? videoBookingLine({ phase, closing }) : `booking_${phase}`,
      advance: goTo,
    });
  };

  // The booking belongs to the last scene, whichever offer scene it is opened from
  const handleOpenCall = () => {
    const last = scenes.length - 1;
    const target = scenes[last];

    setIsCallOpen(true);

    if (target && last !== index) {
      if (props.track) {
        sendDemoEvent(props.slug, { type: 'step', step: target.step });
      }

      setIndex(last);
      void saveDemoProgress({ slug: props.slug, scene: last, count: scenes.length });
      enterScene(target);
    }

    void say({
      index: last,
      line: target ? lineOfScene({ scene: target, bookingPhase, isCallOpen: true }) : 'intro',
      advance: goTo,
    });
  };

  const handleCloseCall = () => {
    setIsCallOpen(false);
    void say({
      index,
      line: lineOfScene({ scene, bookingPhase, isCallOpen: false }),
      advance: goTo,
    });
  };

  // The first tap, on the start button or on the bar of a demo reopened where it stopped:
  // played from it, the voice and the music are allowed to be heard
  const start = (from: number) => {
    const target = scenes[from] ?? scene;

    setIsStarted(true);
    setIndex(from);
    void saveDemoProgress({ slug: props.slug, scene: from, count: scenes.length });

    if (props.track) {
      captureDemoEvent('demo_vsl_start', { scene: from, resumed: opening.isResumed });

      if (opening.isResumed && target.step > 0) {
        sendDemoEvent(props.slug, { type: 'step', step: target.step });
      }
    }

    musicRef.current.start();
    enterScene(target);
    void say({
      index: from,
      line: lineOfScene({ scene: target, bookingPhase, isCallOpen }),
      advance: goTo,
    });
  };

  // Before the first tap the bar's buttons start the demo from where they point
  const moveTo = (next: number) => {
    if (isStarted) {
      goTo(next);
    } else {
      start(next);
    }
  };

  const togglePause = () => {
    if (!isStarted) {
      start(index);

      return;
    }

    if (isPaused) {
      void resume();
    } else {
      pause();
    }
  };

  // A demo reopened where it stopped waits, paused, for the tap that lets the voice play
  const isHeld = isPaused || !isStarted;
  const isPricing = scene.kind === 'pricing';
  const content = showsHostScreen({ scene, isStarted, isResumed: opening.isResumed }) ? (
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
            : t.rich(startCopy.headline, {
                company: data.company,
                b: (chunks) => <span className="text-(--demo-primary)">{chunks}</span>,
              })}
        </h1>

        {isStarted ? (
          <HostTalkingFull narrator={narrator} isTalking={isTalking} />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-5">
              <Image
                src={poster.src}
                alt=""
                width={poster.width}
                height={poster.height}
                priority
                className={`h-[min(18rem,29svh)] w-auto mix-blend-multiply md:h-80 ${poster.frame}`}
              />
              <VolumeHint isShown={Boolean(closing)} />
            </div>
            <VslStartButton
              label={startCopy.start}
              onStart={() => {
                start(index);
              }}
            />
          </div>
        )}

        {isStarted ? (
          <p className="min-h-[4lh] text-base leading-relaxed text-neutral-800 md:text-lg">
            <TypedText segments={segments} typed={typed} />
          </p>
        ) : (
          <p className="text-sm text-neutral-500">
            {t('vsl_start_hint', { minutes: estimateMinutes(props.voices, tempo) })}
          </p>
        )}

        {scene.kind === 'video' && (
          // The line says "the next few days": the real date is right here
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#0074F2] to-[#06287f] p-1 text-white empty:hidden">
            <PriceCountdown
              increaseOn={props.pricing.increaseOn}
              increaseLabel={props.pricing.increaseLabel}
              isBookingDeadline
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
        key={sceneGroup(scene, index)}
        className={`isolate mx-auto max-w-7xl animate-in px-4 duration-500 fade-in ${COMPACT_KINDS.has(scene.kind) ? 'py-4 md:py-6' : 'py-6 md:py-10'}`}
      >
        <VslSceneVisual
          scene={scene}
          props={props}
          data={data}
          photo={photoOf(line)}
          spoken={{ text: segments.map((segment) => segment.text).join(''), typed }}
          onCost={() => {
            musicRef.current.sound('ping');
          }}
          bookingPhase={bookingPhase}
          handleBookingPhase={handleBookingPhase}
          isCallOpen={isCallOpen}
          handleOpenCall={handleOpenCall}
          handleCloseCall={handleCloseCall}
        />
      </main>

      <VslBar
        narrator={narrator}
        segments={segments}
        typed={typed}
        isTalking={isTalking}
        isPaused={isHeld}
        isQuiet={isPricing}
        isLast={index === scenes.length - 1}
        onBack={() => {
          moveTo(Math.max(index - 1, 0));
        }}
        onTogglePause={togglePause}
        onSkip={() => {
          moveTo(index + 1);
        }}
      />
    </div>
  );

  // The audio element keeps its place whatever the screen, so the one a tap unlocked plays to the end
  return (
    <TimelinePause value={isHeld}>
      {tracking}
      {audio}
      {/* The photos load while Gigi introduces himself; React moves these into the head */}
      {[...photos].map(([photoLine, src]) => (
        <link
          key={src}
          rel="preload"
          as="image"
          href={src}
          media={isPortraitLine(photoLine) ? '(max-width: 767px)' : '(min-width: 768px)'}
        />
      ))}
      {/* On pause everything holds still: the reveals wait and the slow zoom stops; the
          short entrances end, so a scene paused as it comes in still shows */}
      <div
        data-paused={isPaused}
        className="data-[paused=true]:[&_.animate-ken-burns]:[animation-play-state:paused] data-[paused=true]:[&_.animate-pulse]:[animation-play-state:paused]"
      >
        {content}
      </div>
    </TimelinePause>
  );
};
