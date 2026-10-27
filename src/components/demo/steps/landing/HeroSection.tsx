import { CalendarCheck, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReviews } from '../../GoogleReviews';
import { GoogleStars, ReviewSourceLogo } from '../../GoogleReviews';
import { WhatsAppIcon } from '../../WhatsAppIcon';
import type { DemoPhoto } from '../LandingStep';
import { HeroButtons, PhotoFrame } from './LandingParts';

type HeroProps = {
  data: DemoSnapshot;
  photos: DemoPhoto[];
  portraitUrl: string | null;
};

const HEADLINE = 'font-(family-name:--demo-heading) leading-tight font-bold tracking-tight';

/**
 * The headline over a full-width photo, with the professional's portrait beside it.
 * The first look of every demo, kept for those built before designs existed.
 * @param props Component props.
 * @returns The hero.
 */
const PhotoHero = (props: HeroProps) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const hero = props.photos.at(0);

  return (
    <div className="relative isolate overflow-hidden px-6 py-16 text-white md:px-12 md:py-24">
      {hero ? (
        <Image src={hero.src} alt="" fill unoptimized className="-z-10 object-cover" />
      ) : null}
      <div
        className={`absolute inset-0 -z-10 ${hero ? 'bg-gradient-to-r from-black/80 via-black/55 to-black/20' : 'bg-gradient-to-br from-(--demo-primary) to-neutral-900'}`}
      />
      <div className="flex flex-col-reverse items-start gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-5">
          {data.city && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs backdrop-blur">
              <MapPin className="size-3.5" />
              {data.city}
            </span>
          )}
          <h3 className={`text-3xl md:text-5xl ${HEADLINE}`}>{data.landing.headline}</h3>
          <p className="text-base text-white/85 md:text-lg">{data.landing.subheadline}</p>
          <HeroButtons ctaLabel={data.landing.ctaLabel} onDark />
        </div>
        {props.portraitUrl && (
          <div className="relative size-28 shrink-0 overflow-hidden rounded-full shadow-2xl ring-4 ring-white/80 md:aspect-[4/5] md:size-auto md:w-56 md:rounded-(--demo-radius)">
            <Image
              src={props.portraitUrl}
              alt={t('landing_portrait_alt', { company: data.company })}
              fill
              unoptimized
              className="object-cover object-top"
            />
          </div>
        )}
      </div>
      {hero?.author && (
        <span className="absolute right-3 bottom-2 text-[10px] text-white/60">
          {t('landing_photo_credit', { author: hero.author })}
        </span>
      )}
    </div>
  );
};

/**
 * The headline beside a large portrait or photo, on the page's light surface.
 * @param props Component props.
 * @returns The hero.
 */
const SplitHero = (props: HeroProps) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const photo = props.portraitUrl ? null : props.photos.at(0);

  return (
    <div className="grid items-center gap-10 bg-(--demo-surface) px-6 py-12 md:grid-cols-2 md:px-12 md:py-16">
      <div className="space-y-5">
        {data.city && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--demo-primary)/10 px-3 py-1 text-xs font-medium text-(--demo-primary)">
            <MapPin className="size-3.5" />
            {data.city}
          </span>
        )}
        <h3 className={`text-3xl md:text-5xl ${HEADLINE}`}>{data.landing.headline}</h3>
        <p className="text-base text-neutral-600 md:text-lg">{data.landing.subheadline}</p>
        <HeroButtons ctaLabel={data.landing.ctaLabel} onDark={false} />
      </div>
      {(props.portraitUrl ?? photo) && (
        <div className="relative isolate pr-3 pb-3">
          <div className="absolute inset-0 top-6 left-6 -z-10 rounded-(--demo-radius) bg-(--demo-accent)/30" />
          {props.portraitUrl ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-(--demo-radius) shadow-xl md:aspect-[4/5]">
              <Image
                src={props.portraitUrl}
                alt={t('landing_portrait_alt', { company: data.company })}
                fill
                unoptimized
                className="object-cover object-top"
              />
            </div>
          ) : (
            photo && (
              <PhotoFrame
                photo={photo}
                className="aspect-[4/3] rounded-(--demo-radius) shadow-xl md:aspect-[4/5]"
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

/**
 * The headline centred on the brand colour, under the professional's portrait.
 * @param props Component props.
 * @returns The hero.
 */
const CenteredHero = (props: HeroProps) => {
  const t = useTranslations('DemoPage');
  const { data } = props;

  return (
    <div className="relative isolate overflow-hidden bg-(--demo-primary) px-6 py-16 text-center text-(--demo-on-primary) md:px-12 md:py-24">
      <div className="absolute -top-24 -right-24 -z-10 size-80 rounded-full bg-(--demo-accent) opacity-40 blur-3xl" />
      <div className="absolute -bottom-28 -left-20 -z-10 size-72 rounded-full bg-white opacity-10 blur-3xl" />
      <div className="mx-auto flex max-w-2xl flex-col items-center space-y-5">
        {props.portraitUrl && (
          <div className="relative size-24 overflow-hidden rounded-full shadow-xl ring-4 ring-white/70">
            <Image
              src={props.portraitUrl}
              alt={t('landing_portrait_alt', { company: data.company })}
              fill
              unoptimized
              className="object-cover object-top"
            />
          </div>
        )}
        {data.city && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs">
            <MapPin className="size-3.5" />
            {data.city}
          </span>
        )}
        <h3 className={`text-3xl md:text-5xl ${HEADLINE}`}>{data.landing.headline}</h3>
        <p className="text-base opacity-85 md:text-lg">{data.landing.subheadline}</p>
        <HeroButtons ctaLabel={data.landing.ctaLabel} onDark />
      </div>
    </div>
  );
};

/**
 * A large headline beside the introduction, over a strip of the business's photos.
 * @param props Component props.
 * @returns The hero.
 */
const EditorialHero = (props: HeroProps) => {
  const { data, photos } = props;

  return (
    <div className="space-y-8 bg-(--demo-surface) px-6 py-12 md:px-12 md:py-16">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div className="space-y-4">
          {data.city && (
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
              <MapPin className="size-3.5" />
              {data.city}
            </p>
          )}
          <h3 className={`text-4xl md:text-6xl ${HEADLINE}`}>{data.landing.headline}</h3>
        </div>
        <div className="space-y-5 md:border-l md:border-(--demo-accent) md:pl-6">
          <p className="text-base text-neutral-600 md:text-lg">{data.landing.subheadline}</p>
          <HeroButtons ctaLabel={data.landing.ctaLabel} onDark={false} />
        </div>
      </div>
      {photos.length > 0 && (
        <div className={`grid gap-3 ${photos.length > 1 ? 'grid-cols-2 md:grid-cols-3' : ''}`}>
          {photos.map((photo, index) => (
            <PhotoFrame
              key={photo.src}
              photo={photo}
              className={`rounded-(--demo-radius) ${photos.length === 1 ? 'aspect-[16/7]' : 'aspect-[3/4]'} ${index === 2 ? 'hidden md:block' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HEROES = {
  photo: PhotoHero,
  split: SplitHero,
  centered: CenteredHero,
  editorial: EditorialHero,
};

/**
 * The rating, WhatsApp and booking promises under the hero.
 * @param props Component props.
 * @param props.reviews The rating shown.
 * @returns The trust bar.
 */
const TrustBar = (props: { reviews: DemoReviews }) => {
  const t = useTranslations('DemoPage');
  const { reviews } = props;

  return (
    <div className="grid gap-3 border-b border-neutral-100 bg-neutral-50 px-6 py-4 text-sm sm:grid-cols-3">
      {reviews.rating !== null && (
        <span className="flex items-center gap-2">
          <ReviewSourceLogo source={reviews.source} className="size-4" />
          <GoogleStars rating={reviews.rating} className="size-3.5" />
          <span className="text-neutral-600">
            {t('landing_trust_reviews', {
              rating: reviews.rating,
              count: reviews.count ?? 0,
              source: reviews.source,
            })}
          </span>
        </span>
      )}
      <span className="flex items-center gap-2 text-neutral-600">
        <WhatsAppIcon className="size-4 text-[#25d366]" />
        {t('landing_trust_whatsapp')}
      </span>
      <span className="flex items-center gap-2 text-neutral-600">
        <CalendarCheck className="size-4 text-(--demo-primary)" />
        {t('landing_trust_booking')}
      </span>
    </div>
  );
};

/**
 * The top of the landing, in the layout its design picked, and the trust bar.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.photos The photos the hero shows.
 * @param props.portraitUrl The professional's portrait, if any.
 * @param props.reviews The rating shown in the trust bar.
 * @returns The hero section content.
 */
export const HeroSection = (props: HeroProps & { reviews: DemoReviews }) => {
  const Hero = HEROES[props.data.design?.hero ?? 'photo'];

  return (
    <>
      <Hero data={props.data} photos={props.photos} portraitUrl={props.portraitUrl} />
      <TrustBar reviews={props.reviews} />
    </>
  );
};
