'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef } from 'react';
import { TRUSTPILOT_REVIEWS, TRUSTPILOT_SCORE } from './TrustpilotReviews';

/** Trustpilot's green, for full stars. */
const STAR_GREEN = '#00b67a';

/** Trustpilot's grey, for the empty part of a star. */
const STAR_GREY = '#dcdce6';

/** The pastel circles Trustpilot puts behind a reviewer's initials. */
const AVATAR_COLOURS = ['#f1e3ff', '#dcf0ff', '#fff1d9', '#e3f7ec', '#ffe3e3'] as const;

const STAR_POINTS =
  '12,3.2 14.6,9.1 21,9.6 16.1,13.8 17.6,20.1 12,16.7 6.4,20.1 7.9,13.8 3,9.6 9.4,9.1';

/**
 * Trustpilot's rating: a row of green squares with a white star, the last one filled as far
 * as the score goes.
 * @param props Component props.
 * @param props.rating The rating, out of 5.
 * @param props.label What a screen reader says.
 * @param props.className The size of each square.
 * @returns The stars.
 */
const TrustpilotStars = (props: { rating: number; label: string; className: string }) => (
  <span className="flex gap-0.5">
    <span className="sr-only">{props.label}</span>
    {[0, 1, 2, 3, 4].map((star) => {
      const fill = Math.min(Math.max(props.rating - star, 0), 1) * 100;

      return (
        <span
          key={star}
          aria-hidden
          className={`flex items-center justify-center ${props.className}`}
          style={{
            background: `linear-gradient(90deg, ${STAR_GREEN} ${fill}%, ${STAR_GREY} ${fill}%)`,
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-[80%] fill-white">
            <polygon points={STAR_POINTS} />
          </svg>
        </span>
      );
    })}
  </span>
);

const initialsOf = (name: string) => {
  const words = name.replace('.', '').split(' ');

  return (
    words.length > 1 ? `${words[0]?.[0]}${words.at(-1)?.[0]}` : name.slice(0, 2)
  ).toUpperCase();
};

/**
 * One review drawn as a Trustpilot card: the reviewer, the stars and the date, the title,
 * the text and the date of the experience.
 * @param props Component props.
 * @param props.review The review.
 * @param props.colour The circle behind the initials.
 * @returns The card.
 */
const TrustpilotCard = (props: { review: (typeof TRUSTPILOT_REVIEWS)[number]; colour: string }) => {
  const t = useTranslations('DemoPage');
  const format = useFormatter();
  const { review } = props;

  return (
    <article className="flex w-full shrink-0 snap-center flex-col gap-2 rounded-lg border border-[#e5e5dd] bg-white p-4 text-left font-sans text-[#1c1c1c]">
      <header className="flex items-center gap-3 border-b border-[#e5e5dd] pb-2">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: props.colour }}
        >
          {initialsOf(review.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{review.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-[#6f6f6f]">
            <span className="rounded-sm border border-[#e5e5dd] px-1 text-[10px] leading-4 font-semibold text-[#1c1c1c]">
              {review.country}
            </span>
            {t('trustpilot_reviewer_reviews', { count: review.reviewCount })}
          </span>
        </span>
      </header>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <TrustpilotStars
            rating={5}
            label={t('trustpilot_stars', { rating: 5 })}
            className="size-5"
          />
          {review.isInvited && (
            <span className="rounded-sm bg-[#f1f1ec] px-1.5 text-xs leading-5 text-[#6f6f6f]">
              {t('trustpilot_invited')}
            </span>
          )}
        </span>
        <time dateTime={review.date} className="shrink-0 text-xs text-[#6f6f6f]">
          {format.dateTime(new Date(review.date), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
      </div>

      <h4 className="line-clamp-1 text-base leading-tight font-bold">{review.title}</h4>
      <p className="line-clamp-3 text-sm leading-snug [@media(max-height:760px)]:line-clamp-2">
        {review.text}
      </p>
      <p className="mt-auto text-xs text-[#1c1c1c]">
        {t.rich('trustpilot_experience', {
          date: format.dateTime(new Date(review.experienceDate), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
    </article>
  );
};

/**
 * Girhouse's Trustpilot reviews, one at a time: swiped on a phone, scrolled on a trackpad
 * or moved with the arrows, which go round from the last back to the first.
 * @param props Component props.
 * @param props.className Placement in the offer.
 * @returns The carousel.
 */
export const TrustpilotCarousel = (props: { className?: string }) => {
  const t = useTranslations('DemoPage');
  const format = useFormatter();
  const trackRef = useRef<HTMLDivElement>(null);
  const total = TRUSTPILOT_REVIEWS.length;

  const move = (step: number) => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const current = Math.round(track.scrollLeft / track.clientWidth);
    const next = (current + step + total) % total;

    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };

  return (
    <section aria-label={t('trustpilot_title')} className={`min-w-0 ${props.className ?? ''}`}>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-[#1c1c1c]">
        <span className="font-bold">{t('trustpilot_excellent')}</span>
        <TrustpilotStars
          rating={TRUSTPILOT_SCORE}
          label={t('trustpilot_stars', { rating: format.number(TRUSTPILOT_SCORE) })}
          className="size-4"
        />
        <span className="flex items-center gap-1 font-bold">
          <svg viewBox="0 0 24 24" aria-hidden className="size-4" style={{ fill: STAR_GREEN }}>
            <polygon points={STAR_POINTS} />
          </svg>
          Trustpilot
        </span>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
      >
        {TRUSTPILOT_REVIEWS.map((review, index) => (
          <TrustpilotCard
            key={`${review.name}-${review.date}`}
            review={review}
            colour={AVATAR_COLOURS[index % AVATAR_COLOURS.length] ?? AVATAR_COLOURS[0]}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={t('trustpilot_previous')}
          onClick={() => {
            move(-1);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e5e5dd] bg-white text-[#1c1c1c] shadow-sm"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-xs font-semibold text-[#6f6f6f]">{t('trustpilot_count')}</p>
        <button
          type="button"
          aria-label={t('trustpilot_next')}
          onClick={() => {
            move(1);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e5e5dd] bg-white text-[#1c1c1c] shadow-sm"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
};
