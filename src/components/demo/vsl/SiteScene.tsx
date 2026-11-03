'use client';

import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReviews } from '../GoogleReviews';
import type { DemoPhoto } from '../steps/LandingStep';
import { LandingStep } from '../steps/LandingStep';
import { landingSectionsFor } from '../TourScenes';
import { useTimedSequence } from '../useTimedSequence';
import { VSL_SITE_SECTION_MS } from './VslScript';

/**
 * Lists the sections the example site scrolls through: all the page has but the review
 * system, which the video shows on its own.
 * @param options What is known.
 * @param options.data The demo snapshot.
 * @param options.hasReviews Whether Google returned reviews to show.
 * @returns The sections, in page order.
 */
export const siteSectionsFor = (options: { data: DemoSnapshot; hasReviews: boolean }) =>
  landingSectionsFor(options).filter((section) => section !== 'funnel');

/**
 * The example site scrolling on its own from the top to the closing call to action, one
 * section at a time while Gigi talks about it. The review system is left out: the video
 * shows its own.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews The reviews the demo found.
 * @param props.photos The business's photos.
 * @returns The site.
 */
export const SiteScene = (props: {
  data: DemoSnapshot;
  reviews: DemoReviews;
  photos: DemoPhoto[];
}) => {
  const sections = siteSectionsFor({
    data: props.data,
    hasReviews: props.reviews.items.length > 0,
  });
  const shown = useTimedSequence({ target: sections.length - 1, intervalMs: VSL_SITE_SECTION_MS });

  return (
    <LandingStep
      data={props.data}
      reviews={props.reviews}
      photos={props.photos}
      sections={sections.slice(0, shown + 1)}
    />
  );
};
