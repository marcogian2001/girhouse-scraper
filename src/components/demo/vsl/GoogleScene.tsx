import { Clock, Globe, MapPin, Navigation, Phone, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReviews } from '../GoogleReviews';
import { GoogleLogo, GoogleStars } from '../GoogleReviews';

const ACTIONS = [
  { key: 'video_google_call', icon: Phone },
  { key: 'video_google_directions', icon: Navigation },
  { key: 'video_google_site', icon: Globe },
] as const;

/**
 * How the business could show on Google: the search someone would make and a cared for
 * profile. Only true facts: no rating is shown when it has no reviews.
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
  const { data, reviews } = props;
  const search = [data.category ?? data.company, data.city].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="mx-auto w-fit rounded-full bg-(--demo-primary) px-4 py-1.5 text-center text-sm font-semibold text-(--demo-on-primary) shadow">
        {t('video_google_label')}
      </p>

      <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-3 shadow-lg">
        <GoogleLogo className="size-6 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-neutral-800 first-letter:uppercase">
          {search}
        </span>
        <Search className="size-5 shrink-0 text-[#4285f4]" />
      </div>

      <article className="animate-in overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-neutral-200 duration-700 fade-in slide-in-from-bottom-4">
        {props.photo && (
          <div className="relative aspect-[2.4] bg-neutral-100">
            <Image src={props.photo} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div className="space-y-3 p-5">
          <div>
            <h2 className="text-xl font-semibold wrap-anywhere text-neutral-950">{data.company}</h2>
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
                className="flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium text-[#1a73e8] ring-1 ring-neutral-200"
              >
                <action.icon className="size-5" />
                {t(action.key)}
              </li>
            ))}
          </ul>

          <ul className="space-y-1.5 text-sm text-neutral-700">
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
    </div>
  );
};
