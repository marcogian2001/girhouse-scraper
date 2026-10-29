import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import type { DemoTourProps } from '@/components/demo/DemoTour';
import { DemoTour } from '@/components/demo/DemoTour';
import { DemoVsl } from '@/components/demo/vsl/DemoVsl';
import { loadDemoReviews } from '@/libs/DemoReviews';
import { getDemoPage } from '@/libs/Demos';
import { getDemoPhotos, getDemoVoices } from '@/libs/DemoVsl';
import { AppConfig } from '@/utils/AppConfig';
import { readableTextColor } from '@/utils/Colors';
import { DEMO_STEPS } from '@/utils/DemoStats';
import { DemoSlugValidation } from '@/validations/DemoValidation';

type DemoPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Google photos the landing preview can use: the hero and the "about" section. */
const PHOTO_COUNT = 2;

/**
 * Loads a demo from its slug, or answers with a 404 page.
 * @param slug The slug in the URL.
 * @returns The demo, its conversation and the organization's settings.
 */
const requireDemo = async (slug: string) => {
  const page = DemoSlugValidation.safeParse(slug).success ? await getDemoPage(slug) : null;

  if (!page) {
    notFound();
  }

  return page;
};

export async function generateMetadata(props: DemoPageProps): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const t = await getTranslations({ locale, namespace: 'DemoPage' });
  const page = await requireDemo(slug);

  return {
    // Absolute, so the lead sees the brand rather than the dashboard's name
    title: {
      absolute: `${t('meta_title', { company: page.demo.data.company })} · ${AppConfig.brandName}`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function DemoPage(props: DemoPageProps) {
  const { locale, slug } = await props.params;
  setRequestLocale(locale);

  const format = await getFormatter({ locale });
  const { demo, settings } = await requireDemo(slug);
  const { data } = demo;
  const searchParams = await props.searchParams;
  // Opened from the dashboard: nothing is tracked
  const isPreview = searchParams.anteprima === '1';
  const step = z.coerce.number().int().min(1).max(DEMO_STEPS).safeParse(searchParams.passo);

  const { reviews, details } = await loadDemoReviews({
    data,
    formatWhen: (date) => format.dateTime(date, { month: 'long', year: 'numeric' }),
  });
  const { directory } = data;

  // Every build or rebuild of the demo starts its countdown again
  const increaseOn = new Date(demo.generatedAt.getTime() + settings.priceIncreaseDays * 86_400_000);

  // The business's colour tints every step through these variables
  const brandStyle: Record<string, string> = {
    '--demo-primary': data.primaryColor,
    '--demo-on-primary': readableTextColor(data.primaryColor),
  };

  // The team can open either version from the dashboard; the lead sees the one the demo is set to
  const version =
    searchParams.versione === 'a' || searchParams.versione === 'b'
      ? searchParams.versione
      : demo.version;
  // Version B shows once its script is written; until then the link keeps version A
  const vsl = version === 'b' ? demo.vsl : null;

  const tourProps: DemoTourProps = {
    slug,
    track: !isPreview,
    initialStep: step.success ? step.data : null,
    data,
    reviews,
    photos: [
      ...(details?.photos ?? []).slice(0, PHOTO_COUNT).map((photo, index) => ({
        src: `/api/demo/${slug}/photo/${index}`,
        author: photo.authorAttributions.at(0)?.displayName ?? null,
      })),
      ...(data.images?.photos ?? []).map((src) => ({ src, author: null })),
      ...(directory?.photos ?? []).map((src) => ({ src, author: null })),
    ],
    pricing: {
      price: settings.monthlyPrice,
      newPrice: settings.newMonthlyPrice,
      slots: settings.onboardingSlotsPerMonth,
      increaseOn: increaseOn.toISOString(),
      increaseLabel: format.dateTime(increaseOn, {
        day: 'numeric',
        month: 'long',
        timeZone: AppConfig.timeZone,
      }),
    },
    whatsappNumber: settings.whatsappBusinessNumber,
  };

  return (
    <div
      style={brandStyle}
      className="min-h-svh bg-gradient-to-b from-amber-50/70 via-white to-white"
    >
      {vsl ? (
        <DemoVsl
          {...tourProps}
          vsl={vsl}
          voices={await getDemoVoices(demo.id)}
          vslPhotos={await getDemoPhotos(demo.id)}
        />
      ) : (
        <DemoTour {...tourProps} />
      )}
    </div>
  );
}
