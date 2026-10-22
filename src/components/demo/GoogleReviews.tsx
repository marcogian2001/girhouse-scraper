import { useTranslations } from 'next-intl';

type DemoReview = {
  author: string | null;
  rating: number;
  when: string | null;
  text: string;
};

/** The reviews a landing shows: Google's, or the professional's MioDottore ones when Google has none. */
export type DemoReviews = {
  source: 'Google' | 'MioDottore';
  rating: number | null;
  count: number | null;
  items: DemoReview[];
};

/** The colours Google gives avatars without a photo. */
const AVATAR_COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#007b83', '#c5221f'];

/**
 * Picks a stable avatar colour for a name.
 * @param name The reviewer's name.
 * @returns One of Google's avatar colours.
 */
const avatarColor = (name: string) => {
  const sum = Array.from(
    { length: name.length },
    (_unused, index) => name.codePointAt(index) ?? 0,
  ).reduce((total, code) => total + code, 0);

  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

/**
 * The multicolour Google "G".
 * @param props Component props.
 * @param props.className Size classes.
 * @returns The logo.
 */
export const GoogleLogo = (props: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={props.className} aria-hidden>
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
    />
  </svg>
);

/**
 * Google's yellow rating stars.
 * @param props Component props.
 * @param props.rating The rating, from 0 to 5.
 * @param props.className Size classes for each star.
 * @returns Five stars, filled up to the rating.
 */
export const GoogleStars = (props: { rating: number; className?: string }) => (
  <span className="inline-flex" aria-label={`${props.rating}/5`}>
    {Array.from({ length: 5 }, (_unused, index) => (
      <svg
        key={index}
        viewBox="0 0 24 24"
        className={`${props.className ?? 'size-4'} ${index < Math.round(props.rating) ? 'fill-[#fbbc04]' : 'fill-neutral-300'}`}
        aria-hidden
      >
        <path d="M12 17.3l-6.2 3.7 1.6-7L2 9.3l7.1-.6L12 2l2.9 6.7 7.1.6-5.4 4.7 1.6 7z" />
      </svg>
    ))}
  </span>
);

/**
 * The mark of where reviews come from: Google's "G", or a plain badge naming the source.
 * @param props Component props.
 * @param props.source The review source.
 * @param props.className Size classes.
 * @returns The mark.
 */
export const ReviewSourceLogo = (props: { source: DemoReviews['source']; className?: string }) =>
  props.source === 'Google' ? (
    <GoogleLogo className={props.className} />
  ) : (
    <span
      className={`${props.className ?? 'size-4'} flex shrink-0 items-center justify-center rounded-md bg-teal-500 text-[60%] font-bold text-white`}
      aria-hidden
    >
      {props.source.charAt(0)}
    </span>
  );

/**
 * The business's rating and real reviews, laid out as Google Maps shows them.
 * @param props Component props.
 * @param props.reviews The rating, count and reviews to show, with their source.
 * @returns The reviews block.
 */
export const GoogleReviews = (props: { reviews: DemoReviews }) => {
  const t = useTranslations('DemoPage');
  const { source, rating, count, items } = props.reviews;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <ReviewSourceLogo source={source} className="size-9" />
        {rating !== null && (
          <div className="flex items-center gap-3">
            <span className="text-4xl font-normal text-neutral-900">
              {rating.toLocaleString('it-IT', { minimumFractionDigits: 1 })}
            </span>
            <div className="space-y-0.5">
              <GoogleStars rating={rating} className="size-5" />
              <p className="text-sm text-neutral-500">
                {t('landing_reviews_count', { count: count ?? 0 })}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {items.map((review, index) => {
          const name = review.author ?? t('landing_review_anonymous', { source });

          return (
            <article
              key={`${name}-${review.text.slice(0, 16)}`}
              className="animate-in space-y-2.5 rounded-xl border border-neutral-200 bg-white p-4 fade-in slide-in-from-bottom-3"
              style={{ animationDelay: `${index * 180}ms`, animationFillMode: 'both' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-base font-medium text-white"
                  style={{ backgroundColor: avatarColor(name) }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{name}</p>
                  <p className="text-xs text-neutral-500">
                    {t('landing_review_source', { source })}
                  </p>
                </div>
                <ReviewSourceLogo source={source} className="ml-auto size-4 shrink-0" />
              </div>
              <div className="flex items-center gap-2">
                <GoogleStars rating={review.rating} className="size-3.5" />
                {review.when && <span className="text-xs text-neutral-500">{review.when}</span>}
              </div>
              <p className="line-clamp-4 text-sm leading-relaxed text-neutral-700">{review.text}</p>
              <span className="text-sm font-medium text-[#1a73e8]">{t('landing_review_more')}</span>
            </article>
          );
        })}
      </div>
    </div>
  );
};
