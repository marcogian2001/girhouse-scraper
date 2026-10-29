import type { DemoReviews } from '@/components/demo/GoogleReviews';
import type { DemoSnapshot } from '@/models/Schema';
import { getPlaceDetails, pickReviews } from '@/services/GooglePlaces';

/** Reviews shown as cards, as many as Google returns at most. */
const REVIEW_COUNT = 3;

/**
 * Reads the reviews a demo shows, live since Google forbids storing them: Google's first,
 * else the professional's MioDottore ones. The page still works when Google does not answer.
 * @param options What to read.
 * @param options.data The demo snapshot.
 * @param options.formatWhen Formats when a MioDottore review was written.
 * @returns The reviews, and Google's details of the place when it answered.
 */
export const loadDemoReviews = async (options: {
  data: DemoSnapshot;
  formatWhen: (date: Date) => string;
}) => {
  const { data } = options;
  const details = data.placeId ? await getPlaceDetails(data.placeId).catch(() => null) : null;
  const googleReviews = details ? pickReviews(details.reviews) : [];
  const { directory } = data;

  const reviews: DemoReviews =
    googleReviews.length > 0 || !directory?.reviews.length
      ? { source: 'Google', rating: data.rating, count: data.reviewsCount, items: googleReviews }
      : {
          source: 'MioDottore',
          rating: directory.rating,
          count: directory.reviewsCount,
          items: directory.reviews.slice(0, REVIEW_COUNT).map((review) => ({
            ...review,
            when: review.when ? options.formatWhen(new Date(review.when)) : null,
          })),
        };

  return { reviews, details };
};
