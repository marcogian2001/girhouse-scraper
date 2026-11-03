import { Clock, Globe, MapPin, Navigation, Phone, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReviews } from '../GoogleReviews';
import { GoogleLogo, GoogleStars } from '../GoogleReviews';
import { SceneLabel } from './SceneLabel';

const ACTIONS = [
  { key: 'video_google_call', icon: Phone },
  { key: 'video_google_directions', icon: Navigation },
  { key: 'video_google_site', icon: Globe },
] as const;

const TABS = ['video_google_tab_all', 'video_google_tab_maps', 'video_google_tab_images'] as const;

/** The other results, blurred: other businesses, never named. */
const OTHER_RESULTS = ['w-2/3', 'w-1/2', 'w-3/5'] as const;

/**
 * Turns a business name into the address its example site would have.
 * @param options The business.
 * @param options.company The business name.
 * @param options.website Its own website, when it has one.
 * @returns The host name to show.
 */
const siteHostOf = (options: { company: string; website: string | null }) => {
  if (options.website && URL.canParse(options.website)) {
    return new URL(options.website).hostname.replace(/^www\./u, '');
  }

  const name = options.company
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '');

  return `${name || 'tuaattivita'}.it`;
};

/**
 * The profile on the right of the results: name, rating when it has reviews, category,
 * buttons, address and hours.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews The reviews the demo found.
 * @param props.photo The business's own photo, if any.
 * @returns The profile.
 */
const GoogleProfile = (props: {
  data: DemoSnapshot;
  reviews: DemoReviews;
  photo: string | undefined;
}) => {
  const t = useTranslations('DemoPage');
  const { data, reviews } = props;

  return (
    <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200">
      {props.photo && (
        <div className="relative aspect-[2.6] bg-neutral-100 max-md:hidden">
          <Image src={props.photo} alt="" fill unoptimized className="object-cover" />
        </div>
      )}
      <div className="space-y-2.5 p-3 md:p-4">
        <div>
          <h3 className="text-lg font-semibold wrap-anywhere text-neutral-950">{data.company}</h3>
          {reviews.rating && reviews.count ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-600">
              {reviews.rating}
              <GoogleStars rating={reviews.rating} />
              {t('video_google_reviews', { count: reviews.count })}
            </p>
          ) : null}
          {data.category && <p className="text-sm text-neutral-600">{data.category}</p>}
        </div>

        <ul className="grid grid-cols-3 gap-2">
          {ACTIONS.map((action) => (
            <li
              key={action.key}
              className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium text-[#1a73e8] ring-1 ring-neutral-200"
            >
              <action.icon className="size-4" />
              {t(action.key)}
            </li>
          ))}
        </ul>

        <ul className="space-y-1 text-sm text-neutral-700 max-md:hidden">
          {data.address && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#1a73e8]" />
              {data.address}
            </li>
          )}
          {data.openingHours.length > 0 && (
            <li className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-[#1a73e8]" />
              {t('video_google_hours')}
            </li>
          )}
        </ul>
      </div>
    </article>
  );
};

/**
 * How the business could show on Google: the search someone would make, the results page
 * with its site on top and the others blurred, and a cared for profile next to it. Only
 * true facts: no rating is shown when it has no reviews.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews The reviews the demo found.
 * @param props.photo The business's own photo, if any.
 * @returns The scene.
 */
export const GoogleScene = (props: {
  data: DemoSnapshot;
  reviews: DemoReviews;
  photo: string | undefined;
}) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const search = [data.category ?? data.company, data.city].filter(Boolean).join(' ');
  const host = siteHostOf({ company: data.company, website: data.website });

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <SceneLabel>{t('video_google_label')}</SceneLabel>

      <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-neutral-200">
        <header className="space-y-3 border-b border-neutral-100 px-4 pt-4 md:px-6">
          <div className="flex items-center gap-3">
            <GoogleLogo className="size-7 shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-neutral-200 px-4 py-2.5 shadow-sm">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-800 first-letter:uppercase md:text-base">
                {search}
              </span>
              <Search className="size-4 shrink-0 text-[#4285f4]" />
            </div>
          </div>
          <ul className="flex gap-5 text-sm text-neutral-500">
            {TABS.map((tab, index) => (
              <li
                key={tab}
                className={`pb-2 ${index === 0 ? 'border-b-2 border-[#1a73e8] font-medium text-[#1a73e8]' : ''}`}
              >
                {t(tab)}
              </li>
            ))}
          </ul>
        </header>

        <div className="grid gap-3 p-3 md:grid-cols-[1.5fr_1fr] md:gap-4 md:p-6">
          <ol className="min-w-0 space-y-3 md:space-y-4">
            <li className="animate-in rounded-2xl p-3 ring-2 ring-emerald-500 duration-700 fade-in slide-in-from-bottom-3">
              <p className="flex items-center gap-2 text-xs text-neutral-600">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--demo-primary) text-[10px] font-bold text-(--demo-on-primary)">
                  {data.company.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 truncate">{host}</span>
              </p>
              <p className="mt-1 text-base leading-snug text-[#1a0dab] md:text-lg">
                {[data.company, data.category, data.city].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">
                {data.landing.subheadline}
              </p>
            </li>
            {OTHER_RESULTS.map((width, index) => (
              <li
                key={width}
                aria-hidden
                className={`space-y-1.5 px-3 opacity-70 blur-[2px] ${index > 1 ? 'max-md:hidden' : ''}`}
              >
                <span className="block h-2.5 w-28 rounded-full bg-neutral-300" />
                <span className={`block h-3.5 rounded-full bg-[#8ab4f8] ${width}`} />
                <span className="block h-2.5 w-full rounded-full bg-neutral-200" />
                <span className="block h-2.5 w-4/5 rounded-full bg-neutral-200" />
              </li>
            ))}
          </ol>

          <GoogleProfile data={data} reviews={props.reviews} photo={props.photo} />
        </div>
      </div>
    </div>
  );
};
