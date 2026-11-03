'use client';

import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReviews } from '../GoogleReviews';
import type { DemoPhoto } from '../steps/LandingStep';
import { LandingStep } from '../steps/LandingStep';
import { landingSectionsFor } from '../TourScenes';

/**
 * Lists the sections the example site scrolls through: all the page has but the review
 * system, which the video shows on its own.
 * @param options What is known.
 * @param options.data The demo snapshot.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The sections, in page order.
 */
const siteSectionsFor = (options: { data: DemoSnapshot; hasReviews: boolean }) =>
  landingSectionsFor(options).filter((section) => section !== 'funnel');

/**
 * The example site scrolling on its own from the top to the closing call to action, in
 * step with Gigi: each section shows at its share of his line, so the page reaches the
 * bottom as he finishes. The review system is left out: the video shows its own.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews The reviews the demo found.
 * @param props.photos The business's photos.
 * @param props.spoken What Gigi says and how much of it is out.
 * @returns The site.
 */
export const SiteScene = (props: {
  data: DemoSnapshot;
  reviews: DemoReviews;
  photos: DemoPhoto[];
  spoken: { text: string; typed: number };
}) => {
  const sections = siteSectionsFor({
    data: props.data,
    hasReviews: props.reviews.items.length > 0,
  });
  const progress = props.spoken.typed / Math.max(props.spoken.text.length, 1);
  const shown = Math.min(Math.floor(progress * sections.length), sections.length - 1);

  return (
    <LandingStep
      data={props.data}
      reviews={props.reviews}
      photos={props.photos}
      sections={sections.slice(0, shown + 1)}
    />
  );
};
