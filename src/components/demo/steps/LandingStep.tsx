'use client';

import {
  CalendarCheck,
  Clock,
  HeartPulse,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { DemoSnapshot } from '@/models/Schema';
import type { DemoReview } from '../GoogleReviews';
import { GoogleLogo, GoogleReviews, GoogleStars } from '../GoogleReviews';
import { ReviewFunnel } from '../ReviewFunnel';
import type { LandingSection } from '../TourScenes';
import { WhatsAppIcon } from '../WhatsAppIcon';

export type DemoPhoto = { src: string; author: string | null };

const SERVICE_ICONS = [HeartPulse, Sparkles, ShieldCheck, CalendarCheck, Star, Clock];

/**
 * Builds a monogram for a business without a logo.
 * @param company The business name.
 * @returns Up to two initials.
 */
const initialsOf = (company: string) =>
  company
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

/**
 * Scrolls the browser frame, and only the frame, to the section that just appeared.
 * @param node The new section.
 */
const scrollFrameTo = (node: HTMLElement | null) => {
  node?.parentElement?.scrollTo({ top: node.offsetTop - 12, behavior: 'smooth' });
};

/**
 * The hero of the landing: photo, headline, buttons and the trust bar.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.photo The hero photo, if Google has one.
 * @returns The hero section content.
 */
const HeroSection = (props: { data: DemoSnapshot; photo: DemoPhoto | undefined }) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const hero = props.photo;

  return (
    <>
      <div className="relative isolate overflow-hidden px-6 py-16 text-white md:px-12 md:py-24">
        {hero ? (
          <Image src={hero.src} alt="" fill unoptimized className="-z-10 object-cover" />
        ) : null}
        <div
          className={`absolute inset-0 -z-10 ${hero ? 'bg-gradient-to-r from-black/80 via-black/55 to-black/20' : 'bg-gradient-to-br from-(--demo-primary) to-neutral-900'}`}
        />
        <div className="max-w-xl space-y-5">
          {data.city && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs backdrop-blur">
              <MapPin className="size-3.5" />
              {data.city}
            </span>
          )}
          <h3 className="text-3xl leading-tight font-bold tracking-tight md:text-5xl">
            {data.landing.headline}
          </h3>
          <p className="text-base text-white/85 md:text-lg">{data.landing.subheadline}</p>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-900 shadow">
              <CalendarCheck className="size-4" />
              {data.landing.ctaLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-5 py-3 text-sm font-semibold text-white shadow">
              <WhatsAppIcon className="size-4" />
              {t('landing_write')}
            </span>
          </div>
        </div>
        {hero?.author && (
          <span className="absolute right-3 bottom-2 text-[10px] text-white/60">
            {t('landing_photo_credit', { author: hero.author })}
          </span>
        )}
      </div>
      <div className="grid gap-3 border-b border-neutral-100 bg-neutral-50 px-6 py-4 text-sm sm:grid-cols-3">
        {data.rating !== null && (
          <span className="flex items-center gap-2">
            <GoogleLogo className="size-4" />
            <GoogleStars rating={data.rating} className="size-3.5" />
            <span className="text-neutral-600">
              {t('landing_trust_reviews', {
                rating: data.rating,
                count: data.reviewsCount ?? 0,
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
    </>
  );
};

/**
 * The services the business offers, as cards.
 * @param props Component props.
 * @param props.services The services from the snapshot.
 * @returns The services section content.
 */
const ServicesSection = (props: { services: DemoSnapshot['landing']['services'] }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="space-y-6 px-6 py-12 md:px-12">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
          {t('landing_nav_services')}
        </p>
        <h4 className="text-2xl font-bold tracking-tight">{t('landing_services_title')}</h4>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {props.services.map((service, index) => {
          const Icon = SERVICE_ICONS[index % SERVICE_ICONS.length] ?? Sparkles;

          return (
            <div
              key={service.name}
              className="space-y-2 rounded-2xl border border-neutral-200 p-5 transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-(--demo-primary)/10 text-(--demo-primary)">
                <Icon className="size-5" />
              </span>
              <p className="font-semibold">{service.name}</p>
              {service.description && (
                <p className="text-sm leading-relaxed text-neutral-600">{service.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Who the business is, next to its second Google photo.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.photo The second photo, if Google has one.
 * @returns The about section content.
 */
const AboutSection = (props: { data: DemoSnapshot; photo: DemoPhoto | undefined }) => {
  const t = useTranslations('DemoPage');
  const aboutPhoto = props.photo;

  return (
    <div className="grid items-center gap-8 bg-neutral-50 px-6 py-12 md:grid-cols-2 md:px-12">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
          {t('landing_about_kicker')}
        </p>
        <h4 className="text-2xl font-bold tracking-tight">
          {t('landing_about_title', { company: props.data.company })}
        </h4>
        <p className="leading-relaxed text-neutral-600">{props.data.landing.about}</p>
      </div>
      {aboutPhoto && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-lg">
          <Image src={aboutPhoto.src} alt="" fill unoptimized className="object-cover" />
        </div>
      )}
    </div>
  );
};

/**
 * Opening hours, address, phone, a booking band and the footer.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The contact section content.
 */
const ContactSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const { data } = props;

  return (
    <>
      <div className="grid gap-8 px-6 py-12 md:grid-cols-2 md:px-12">
        {data.openingHours.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="size-5 text-(--demo-primary)" />
              {t('landing_hours')}
            </h4>
            <dl className="divide-y divide-neutral-100 text-sm">
              {data.openingHours.map((row) => (
                <div key={row.day} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-neutral-500 capitalize">{row.day}</dt>
                  <dd className="font-medium">{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="space-y-3 text-sm">
          <h4 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="size-5 text-(--demo-primary)" />
            {t('landing_contact')}
          </h4>
          {data.address && <p>{data.address}</p>}
          {data.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-neutral-400" />
              {data.phone}
            </p>
          )}
          <div className="mt-4 space-y-3 rounded-2xl bg-(--demo-primary) p-5 text-(--demo-on-primary)">
            <p className="font-semibold">{t('landing_cta_band', { company: data.company })}</p>
            <span className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-semibold text-neutral-900">
              {data.landing.ctaLabel}
            </span>
          </div>
        </div>
      </div>
      <footer className="border-t border-neutral-100 px-6 py-5 text-center text-xs text-neutral-400">
        {t('landing_footer', { company: data.company })}
      </footer>
    </>
  );
};

/**
 * The landing page Girhouse would build, revealed one section at a time inside a browser frame.
 * Sections without data never appear, so nothing is made up.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews Real Google reviews, already picked.
 * @param props.photos The business's Google photos.
 * @param props.sections The sections revealed so far.
 * @returns The landing preview.
 */
export const LandingStep = (props: {
  data: DemoSnapshot;
  reviews: DemoReview[];
  photos: DemoPhoto[];
  sections: LandingSection[];
}) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const hero = props.photos.at(0);
  const aboutPhoto = props.photos.at(1);
  const latest = props.sections.at(-1);
  const host = data.website && URL.canParse(data.website) ? new URL(data.website).hostname : null;

  const reveal = (section: LandingSection) => ({
    ref: section === latest ? scrollFrameTo : undefined,
    className: 'animate-in fade-in slide-in-from-bottom-6 duration-700',
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-neutral-500">
          {host ?? data.company}
        </span>
      </div>

      <div className="relative h-[70svh] min-h-[460px] overflow-y-auto scroll-smooth md:h-[calc(100svh-9rem)]">
        <nav className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            {data.logoUrl ? (
              <Image
                src={data.logoUrl}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="size-9 rounded-lg object-contain"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--demo-primary) text-sm font-semibold text-(--demo-on-primary)">
                {initialsOf(data.company)}
              </span>
            )}
            <span className="truncate text-sm font-semibold">{data.company}</span>
          </div>
          <div className="hidden items-center gap-5 text-sm text-neutral-600 md:flex">
            <span>{t('landing_nav_services')}</span>
            <span>{t('landing_nav_reviews')}</span>
            <span>{t('landing_nav_contact')}</span>
          </div>
          <span className="shrink-0 rounded-full bg-(--demo-primary) px-4 py-2 text-xs font-semibold text-(--demo-on-primary)">
            {data.landing.ctaLabel}
          </span>
        </nav>

        <section {...reveal('hero')}>
          <HeroSection data={data} photo={hero} />
        </section>

        {props.sections.includes('services') && (
          <section {...reveal('services')}>
            <ServicesSection services={data.landing.services} />
          </section>
        )}

        {props.sections.includes('about') && (
          <section {...reveal('about')}>
            <AboutSection data={data} photo={aboutPhoto} />
          </section>
        )}

        {props.sections.includes('reviews') && (
          <section {...reveal('reviews')}>
            <div className="space-y-5 px-6 py-12 md:px-12">
              <h4 className="text-2xl font-bold tracking-tight">{t('landing_reviews_title')}</h4>
              <GoogleReviews
                rating={data.rating}
                count={data.reviewsCount}
                reviews={props.reviews}
              />
            </div>
          </section>
        )}

        {props.sections.includes('funnel') && (
          <section {...reveal('funnel')}>
            <div className="space-y-5 border-y-4 border-dashed border-(--demo-primary)/30 bg-gradient-to-b from-amber-50/60 to-white px-6 py-12 md:px-12">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
                  {t('funnel_kicker')}
                </p>
                <h4 className="text-2xl font-bold tracking-tight">{t('funnel_title')}</h4>
                <p className="text-sm text-neutral-600">{t('funnel_subtitle')}</p>
              </div>
              <ReviewFunnel company={data.company} customer={data.chat.customerName} />
            </div>
          </section>
        )}

        {props.sections.includes('contact') && (
          <section {...reveal('contact')}>
            <ContactSection data={data} />
          </section>
        )}
      </div>

      {props.sections.includes('contact') && (
        <span className="absolute right-4 bottom-4 flex size-12 animate-pop items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl">
          <WhatsAppIcon className="size-7" />
        </span>
      )}
    </div>
  );
};
