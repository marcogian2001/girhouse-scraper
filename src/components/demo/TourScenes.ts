import type { DemoSnapshot } from '@/models/Schema';
import type { LandingBodySection } from '@/utils/DemoDesign';
import { DEFAULT_SECTION_ORDER } from '@/utils/DemoDesign';

export type LandingSection = 'hero' | LandingBodySection | 'funnel' | 'contact';

/** What one press of "Next" shows, and which line the giraffe says over it. */
export type TourScene =
  | { step: 0; kind: 'intro'; line: 'intro' }
  | { step: 1; kind: 'landing'; sections: LandingSection[]; line: `landing_${LandingSection}` }
  | { step: 2; kind: 'chat'; upTo: number; line: 'chat_start' | 'chat_slots' | 'chat_booked' }
  | {
      step: 3;
      kind: 'crm';
      part: number;
      line: 'crm_contact' | 'crm_timeline' | 'crm_pipeline' | 'crm_inbox';
    }
  | { step: 4; kind: 'followup'; line: 'followup' }
  | { step: 5; kind: 'video'; line: 'pricing_video' }
  | {
      step: 5;
      kind: 'pricing';
      part: number;
      line: 'pricing_price' | 'pricing_included' | 'pricing_guarantees';
    }
  | { step: 6; kind: 'booking'; line: 'booking' };

export const TOUR_STEPS = 6;

/**
 * Lists the landing sections a business has data for, the body ones in the order its design
 * picked. The hero and the review system always show.
 * @param options What is known.
 * @param options.data The demo snapshot.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The sections, in page order.
 */
export const landingSectionsFor = (options: { data: DemoSnapshot; hasReviews: boolean }) => {
  const { data } = options;
  const hasContent: Record<LandingBodySection, boolean> = {
    services: data.landing.services.length > 0,
    highlights: (data.landing.highlights?.length ?? 0) > 0,
    about: Boolean(data.landing.about),
    steps: (data.landing.steps?.length ?? 0) > 0,
    reviews: options.hasReviews,
    faq: (data.landing.faqs?.length ?? 0) > 0,
  };
  const order = data.design?.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const sections: LandingSection[] = [
    'hero',
    ...order.filter((section) => hasContent[section]),
    'funnel',
  ];

  if (data.openingHours.length > 0 || data.address || data.phone) {
    sections.push('contact');
  }

  return sections;
};

/**
 * Builds the whole guided tour of a demo, one scene per press of "Next".
 * @param options What is known.
 * @param options.data The demo snapshot.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The scenes, from the intro to the booking.
 */
export const buildTourScenes = (options: { data: DemoSnapshot; hasReviews: boolean }) => {
  const sections = landingSectionsFor(options);
  const { messages } = options.data.chat;
  const firstReply = messages.findIndex((message) => message.from === 'business');
  const slotsOffer = messages.findIndex((message) => message.options.length > 0);

  const scenes: TourScene[] = [
    { step: 0, kind: 'intro', line: 'intro' },
    ...sections.map((section, index) => ({
      step: 1 as const,
      kind: 'landing' as const,
      sections: sections.slice(0, index + 1),
      line: `landing_${section}` as const,
    })),
    { step: 2, kind: 'chat', upTo: Math.max(firstReply + 1, 1), line: 'chat_start' },
  ];

  if (slotsOffer > firstReply) {
    scenes.push({ step: 2, kind: 'chat', upTo: slotsOffer + 1, line: 'chat_slots' });
  }

  scenes.push(
    { step: 2, kind: 'chat', upTo: messages.length, line: 'chat_booked' },
    { step: 3, kind: 'crm', part: 1, line: 'crm_contact' },
    { step: 3, kind: 'crm', part: 2, line: 'crm_timeline' },
    { step: 3, kind: 'crm', part: 3, line: 'crm_pipeline' },
    { step: 3, kind: 'crm', part: 4, line: 'crm_inbox' },
    // The automation plays through on its own, from the trigger to the stop
    { step: 4, kind: 'followup', line: 'followup' },
    { step: 5, kind: 'video', line: 'pricing_video' },
    { step: 5, kind: 'pricing', part: 1, line: 'pricing_price' },
    { step: 5, kind: 'pricing', part: 2, line: 'pricing_included' },
    { step: 5, kind: 'pricing', part: 3, line: 'pricing_guarantees' },
    { step: 6, kind: 'booking', line: 'booking' },
  );

  return scenes;
};

/**
 * Finds where the tour starts when a link points at a step.
 * @param scenes The tour.
 * @param step The step asked for, from 1.
 * @returns The index of the step's first scene, or 0 when the step is unknown.
 */
export const firstSceneOf = (scenes: TourScene[], step: number) =>
  Math.max(
    0,
    scenes.findIndex((scene) => scene.step === step),
  );

/**
 * Decides what a press of "Next" does: finish Gigi's line first, move on only once it is all shown.
 * @param options The state of the line.
 * @param options.typed How many characters are shown.
 * @param options.total How many characters the line has.
 * @returns Whether to finish the line or go to the next scene.
 */
export const nextTapAction = (options: { typed: number; total: number }) =>
  options.typed < options.total ? ('finish' as const) : ('advance' as const);
