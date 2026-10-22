'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { DemoSnapshot } from '@/models/Schema';
import { HEARTBEAT_SECONDS } from '@/utils/DemoStats';
import { sendDemoEvent } from './DemoSession';
import { GigiBar } from './GigiBar';
import { GigiVideoScene } from './GigiVideoScene';
import { GirhouseLogo } from './GirhouseLogo';
import type { DemoReviews } from './GoogleReviews';
import { HIGHLIGHT_TAGS, parseHighlights, visibleLength } from './Highlights';
import { PriceCountdown } from './PriceCountdown';
import type { BookingPhase } from './steps/BookingStep';
import { BookingStep } from './steps/BookingStep';
import { CrmStep } from './steps/CrmStep';
import { FollowUpStep } from './steps/FollowUpStep';
import type { DemoPhoto } from './steps/LandingStep';
import { LandingStep } from './steps/LandingStep';
import { PricingStep } from './steps/PricingStep';
import { WhatsAppStep } from './steps/WhatsAppStep';
import type { TourScene } from './TourScenes';
import { buildTourScenes, firstSceneOf, nextTapAction, TOUR_STEPS } from './TourScenes';
import { useTimedSequence } from './useTimedSequence';

/** About 40 characters a second, a calm speaking pace. */
const TYPING_INTERVAL_MS = 25;

export type DemoTourProps = {
  slug: string;
  track: boolean;
  initialStep: number | null;
  data: DemoSnapshot;
  reviews: DemoReviews;
  photos: DemoPhoto[];
  pricing: {
    price: number;
    newPrice: number;
    slots: number;
    increaseOn: string | null;
    increaseLabel: string | null;
  };
  whatsappNumber: string | null;
};

/**
 * Picks the visual of the current scene.
 * @param options The scene and the tour data.
 * @param options.scene The current scene.
 * @param options.props The tour props.
 * @param options.bookingPhase Where the booking stands.
 * @param options.handleBookingPhase Moves the booking on.
 * @returns The scene's visual.
 */
const SceneVisual = (options: {
  scene: TourScene;
  props: DemoTourProps;
  bookingPhase: BookingPhase;
  handleBookingPhase: (phase: BookingPhase) => void;
}) => {
  const { scene, props } = options;

  if (scene.kind === 'landing') {
    return (
      <LandingStep
        data={props.data}
        reviews={props.reviews}
        photos={props.photos}
        sections={scene.sections}
      />
    );
  }

  if (scene.kind === 'chat') {
    return <WhatsAppStep data={props.data} upTo={scene.upTo} />;
  }

  if (scene.kind === 'crm') {
    return <CrmStep data={props.data} part={scene.part} />;
  }

  if (scene.kind === 'followup') {
    return <FollowUpStep />;
  }

  if (scene.kind === 'pricing') {
    return <PricingStep part={scene.part} company={props.data.company} {...props.pricing} />;
  }

  if (scene.kind === 'booking') {
    return (
      <BookingStep
        slug={props.slug}
        company={props.data.company}
        whatsappNumber={props.whatsappNumber}
        track={props.track}
        phase={options.bookingPhase}
        onPhase={options.handleBookingPhase}
      />
    );
  }

  // The video scenes have their own full-screen layout
  return null;
};

/**
 * Reports the visit, the step it opened on and the time spent while the tab is visible.
 * Renders nothing, and is left out of dashboard previews.
 * @param props Component props.
 * @param props.slug The demo slug.
 * @param props.initialStep The step a link opened the tour on, if any.
 * @returns Nothing visible.
 */
const DemoTracking = (props: { slug: string; initialStep: number | null }) => {
  useEffect(() => {
    sendDemoEvent(props.slug, { type: 'open' });

    if (props.initialStep) {
      sendDemoEvent(props.slug, { type: 'step', step: props.initialStep });
    }

    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendDemoEvent(props.slug, { type: 'heartbeat' });
      }
    }, HEARTBEAT_SECONDS * 1000);

    return () => {
      clearInterval(heartbeat);
    };
  }, [props.slug, props.initialStep]);

  return null;
};

/**
 * The guided demo: one scene at a time, Gigi explaining each one from a pop-up in the
 * corner, "Next" to go on. The first press of "Next" finishes Gigi's line, the second moves on.
 * @param props Component props.
 * @returns The tour.
 */
export const DemoTour = (props: DemoTourProps) => {
  const t = useTranslations('DemoPage');
  const scenes = buildTourScenes({ data: props.data, hasReviews: props.reviews.items.length > 0 });
  const [index, setIndex] = useState(() =>
    props.initialStep ? firstSceneOf(scenes, props.initialStep) : 0,
  );
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>('phone');
  const [finishedLine, setFinishedLine] = useState<string | null>(null);
  const scene = scenes[index] ?? scenes[0];

  const { company } = props.data;
  const lineValues = {
    ...HIGHLIGHT_TAGS,
    company,
    customer: props.data.chat.customerName,
    rating: props.reviews.rating ?? 0,
    count: props.reviews.count ?? 0,
    source: props.reviews.source,
    price: props.pricing.price,
    slots: props.pricing.slots,
  };
  const lineKey = scene?.kind === 'booking' ? `booking_${bookingPhase}` : (scene?.line ?? 'intro');
  const segments = parseHighlights(
    scene?.kind === 'booking'
      ? t.markup(`line_booking_${bookingPhase}`, lineValues)
      : t.markup(`line_${scene?.line ?? 'intro'}`, lineValues),
  );
  const total = visibleLength(segments);
  const typing = useTimedSequence({
    target: total,
    intervalMs: TYPING_INTERVAL_MS,
    restartKey: `${index}-${lineKey}`,
  });
  const typed = finishedLine === `${index}-${lineKey}` ? total : typing;

  const goTo = (next: number) => {
    const target = scenes[next];

    if (!target) {
      return;
    }

    if (props.track && target.step !== scene?.step && target.step > 0) {
      sendDemoEvent(props.slug, { type: 'step', step: target.step });
    }

    setIndex(next);

    // Within a step the scene's own anchors scroll to what it reveals; from the price
    // video to the price the page changes altogether, so it starts from the top too
    if (target.step !== scene?.step || target.kind !== scene.kind) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    // On the price there is no line on screen to finish first, and the automation
    // plays on its own, so Next moves on straight away
    if (
      scene?.kind !== 'pricing' &&
      scene?.kind !== 'followup' &&
      nextTapAction({ typed, total }) === 'finish'
    ) {
      setFinishedLine(`${index}-${lineKey}`);

      return;
    }

    goTo(index + 1);
  };

  if (!scene) {
    return null;
  }

  const tracking = props.track ? (
    <DemoTracking slug={props.slug} initialStep={props.initialStep} />
  ) : null;

  if (scene.kind === 'intro') {
    return (
      <>
        {tracking}
        {/* The landing's photos load while Gigi introduces himself; React moves these into the head */}
        {props.photos.slice(0, 2).map((photo) => (
          <link key={photo.src} rel="preload" as="image" href={photo.src} />
        ))}
        <header className="absolute inset-x-0 top-0 z-10 flex justify-center py-5">
          <GirhouseLogo tone="black" className="h-8 md:h-9" />
        </header>
        <GigiVideoScene
          key={scene.line}
          video="intro"
          header={
            <h1 className="pt-10 text-3xl leading-tight font-bold tracking-tight text-balance wrap-anywhere text-neutral-950 md:text-4xl">
              {t.rich('intro_headline', {
                company,
                b: (chunks) => <span className="text-(--demo-primary)">{chunks}</span>,
              })}
            </h1>
          }
          segments={segments}
          ctaLabel={t('intro_cta')}
          onContinue={() => {
            goTo(1);
          }}
        />
      </>
    );
  }

  if (scene.kind === 'video') {
    return (
      <>
        {tracking}
        <GigiVideoScene
          key={scene.line}
          video="pricing"
          header={
            <h1 className="text-3xl leading-tight font-black tracking-tight text-neutral-950 md:text-5xl">
              {t('pricing_video_headline')}
            </h1>
          }
          segments={segments}
          ctaLabel={t('pricing_video_cta')}
          onBack={() => {
            goTo(index - 1);
          }}
          onContinue={() => {
            goTo(index + 1);
          }}
        >
          {/* The video says "the next few days": the real date is right here */}
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#0074F2] to-[#06287f] p-1 text-white empty:hidden">
            <PriceCountdown
              increaseOn={props.pricing.increaseOn}
              increaseLabel={props.pricing.increaseLabel}
            />
          </div>
        </GigiVideoScene>
      </>
    );
  }

  const isLast = index === scenes.length - 1;
  // The offer speaks for itself: full-screen blue, no Gigi lines over the price
  const isPricing = scene.kind === 'pricing';

  return (
    <div
      className={`min-h-svh overflow-x-clip pb-[calc(var(--demo-bar-h,12rem)+1.5rem)] ${isPricing ? 'bg-gradient-to-b from-[#0074F2] via-[#0a52d4] to-[#06287f]' : ''}`}
    >
      {tracking}

      {/* Above the mockups, whose own layers stay inside `main` */}
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs font-medium text-neutral-500">
          <span className="flex min-w-0 items-center gap-2">
            <GirhouseLogo tone="black" className="h-5 shrink-0" />
            <span className="truncate font-semibold text-neutral-800">
              {t('topbar_brand', { company })}
            </span>
          </span>
          <span className="shrink-0">
            {t('topbar_step', { step: scene.step, total: TOUR_STEPS })}
          </span>
        </div>
        {/* Fills as the tour goes on, scene by scene */}
        <div aria-hidden className="h-1.5 bg-neutral-100">
          <div
            className="h-full rounded-r-full bg-(--demo-primary) transition-[width] duration-700 ease-out"
            style={{ width: `${(index / (scenes.length - 1)) * 100}%` }}
          />
        </div>
      </header>

      <main
        key={scene.step}
        className={`isolate mx-auto max-w-7xl animate-in px-4 duration-500 fade-in ${isPricing ? 'py-4 md:py-6' : 'py-6 md:py-10'}`}
      >
        <SceneVisual
          scene={scene}
          props={props}
          bookingPhase={bookingPhase}
          handleBookingPhase={setBookingPhase}
        />
      </main>

      <GigiBar
        segments={segments}
        typed={typed}
        isQuiet={isPricing}
        isLast={isLast}
        onFinishLine={() => {
          setFinishedLine(`${index}-${lineKey}`);
        }}
        onBack={() => {
          goTo(index - 1);
        }}
        onNext={handleNext}
      />
    </div>
  );
};
