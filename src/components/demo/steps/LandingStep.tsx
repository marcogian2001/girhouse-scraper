'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { DemoSnapshot } from '@/models/Schema';
import { demoThemeVariables } from '@/utils/DemoDesign';
import { demoFontVariables } from '../DemoFonts';
import type { DemoReviews } from '../GoogleReviews';
import { GoogleReviews } from '../GoogleReviews';
import { ReviewFunnel } from '../ReviewFunnel';
import type { LandingSection } from '../TourScenes';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { AboutSection } from './landing/AboutSection';
import { ContactSection } from './landing/ContactSection';
import { FaqSection } from './landing/FaqSection';
import { HeroSection } from './landing/HeroSection';
import { HighlightsSection } from './landing/HighlightsSection';
import { SectionHeading } from './landing/LandingParts';
import { ServicesSection } from './landing/ServicesSection';
import { StepsSection } from './landing/StepsSection';

export type DemoPhoto = { src: string; author: string | null };

/** Photos after the hero and the about one, shown as a strip under the about section. */
const GALLERY_SIZE = 4;

/**
 * Counts the photos the hero takes from the front of the list, the rest going to the about section.
 * @param options The layout.
 * @param options.data The demo snapshot.
 * @param options.hasPortrait Whether the professional's portrait is known.
 * @returns How many photos the hero shows.
 */
const heroPhotoCount = (options: { data: DemoSnapshot; hasPortrait: boolean }) => {
  const hero = options.data.design?.hero ?? 'photo';

  if (hero === 'editorial') {
    return 3;
  }

  if (hero === 'centered' || (hero === 'split' && options.hasPortrait)) {
    return 0;
  }

  return 1;
};

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
 * The landing page Girhouse would build, revealed one section at a time inside a browser frame.
 * Sections without data never appear, so nothing is made up.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.reviews Real reviews, already picked, with their source.
 * @param props.photos The business's photos: Google's, the copied ones, then its MioDottore profile's.
 * @param props.sections The sections revealed so far.
 * @returns The landing preview.
 */
export const LandingStep = (props: {
  data: DemoSnapshot;
  reviews: DemoReviews;
  photos: DemoPhoto[];
  sections: LandingSection[];
}) => {
  const t = useTranslations('DemoPage');
  const { data } = props;
  const portraitUrl = data.directory?.portraitUrl ?? data.images?.portraitUrl ?? null;
  const heroCount = heroPhotoCount({ data, hasPortrait: portraitUrl !== null });
  const aboutPhoto = props.photos.at(heroCount);
  const gallery = props.photos.slice(heroCount + 1, heroCount + 1 + GALLERY_SIZE);
  // Without a logo, the professional's face stands for the business
  const navImage = data.logoUrl ?? portraitUrl;
  const latest = props.sections.at(-1);
  const host = data.website && URL.canParse(data.website) ? new URL(data.website).hostname : null;
  const theme = {
    ...demoThemeVariables({ primaryColor: data.primaryColor, design: data.design }),
    ...demoFontVariables(data.design?.fonts),
  };
  // The body sections alternate between white and the design's surface
  const body: LandingSection[] = props.sections.filter(
    (section) => section !== 'hero' && section !== 'funnel' && section !== 'contact',
  );

  const content: Record<LandingSection, React.ReactNode> = {
    hero: (
      <HeroSection
        data={data}
        photos={props.photos.slice(0, heroCount)}
        portraitUrl={portraitUrl}
        reviews={props.reviews}
      />
    ),
    services: <ServicesSection data={data} />,
    highlights: <HighlightsSection data={data} />,
    about: <AboutSection data={data} photo={aboutPhoto} gallery={gallery} />,
    steps: <StepsSection data={data} />,
    reviews: (
      <div className="space-y-5 px-6 py-12 md:px-12">
        <h4 className="font-(family-name:--demo-heading) text-2xl font-bold tracking-tight md:text-3xl">
          {t('landing_reviews_title')}
        </h4>
        <GoogleReviews reviews={props.reviews} />
      </div>
    ),
    faq: <FaqSection data={data} />,
    funnel: (
      <div className="space-y-5 border-y-4 border-dashed border-(--demo-primary)/30 bg-gradient-to-b from-amber-50/60 to-white px-6 py-12 md:px-12">
        <div className="space-y-1">
          <SectionHeading kicker={t('funnel_kicker')} title={t('funnel_title')} />
          <p className="text-sm text-neutral-600">{t('funnel_subtitle')}</p>
        </div>
        <ReviewFunnel company={data.company} customer={data.chat.customerName} />
      </div>
    ),
    contact: <ContactSection data={data} />,
  };

  return (
    <div
      style={theme}
      className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-neutral-500">
          {host ?? data.company}
        </span>
      </div>

      {/* Fits between the tour's header and Gigi's bar, so the site scrolls inside the frame */}
      <div className="relative h-[calc(100svh-var(--demo-bar-h,12rem)-8rem)] min-h-80 overflow-y-auto scroll-smooth font-(family-name:--demo-body) md:h-[calc(100svh-9rem)]">
        <nav className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            {navImage ? (
              <Image
                src={navImage}
                alt=""
                width={36}
                height={36}
                unoptimized
                className={
                  data.logoUrl
                    ? 'size-9 rounded-lg object-contain'
                    : 'size-9 rounded-full object-cover object-top'
                }
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--demo-primary) text-sm font-semibold text-(--demo-on-primary)">
                {initialsOf(data.company)}
              </span>
            )}
            <span className="truncate font-(family-name:--demo-heading) text-sm font-semibold">
              {data.company}
            </span>
          </div>
          <div className="hidden items-center gap-5 text-sm text-neutral-600 md:flex">
            <span>{t('landing_nav_services')}</span>
            <span>{t('landing_nav_reviews')}</span>
            <span>{t('landing_nav_contact')}</span>
          </div>
          <span className="shrink-0 rounded-(--demo-pill) bg-(--demo-primary) px-4 py-2 text-xs font-semibold text-(--demo-on-primary)">
            {data.landing.ctaLabel}
          </span>
        </nav>

        {props.sections.map((section) => (
          <section
            key={section}
            ref={section === latest ? scrollFrameTo : undefined}
            className={`animate-in duration-700 fade-in slide-in-from-bottom-6 ${body.indexOf(section) % 2 === 1 ? 'bg-(--demo-surface)' : ''}`}
          >
            {content[section]}
          </section>
        ))}
      </div>

      {props.sections.includes('contact') && (
        <span className="absolute right-4 bottom-4 flex size-12 animate-pop items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl">
          <WhatsAppIcon className="size-7" />
        </span>
      )}
    </div>
  );
};
