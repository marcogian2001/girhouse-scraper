import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { DemoTour } from '@/components/demo/DemoTour';
import { getDemoPage } from '@/libs/Demos';
import { getPlaceDetails, pickReviews } from '@/services/GooglePlaces';
import { AppConfig } from '@/utils/AppConfig';
import { readableTextColor } from '@/utils/Colors';
import { DEMO_STEPS } from '@/utils/DemoStats';
import { DemoSlugValidation } from '@/validations/DemoValidation';

type DemoPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Photos the landing preview can use: the hero and the "about" section. */
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
    title: t('meta_title', { company: page.demo.data.company }),
    robots: { index: false, follow: false },
  };
}

export default async function DemoPage(props: DemoPageProps) {
  const { locale, slug } = await props.params;
  setRequestLocale(locale);

  const format = await getFormatter({ locale });
  const { demo, conversation, settings } = await requireDemo(slug);
  const { data } = demo;
  const searchParams = await props.searchParams;
  // Opened from the dashboard: nothing is tracked
  const isPreview = searchParams.anteprima === '1';
  const step = z.coerce.number().int().min(1).max(DEMO_STEPS).safeParse(searchParams.passo);

  // Read live, since Google forbids storing them; the page still works when Google does not answer
  const details = data.placeId ? await getPlaceDetails(data.placeId).catch(() => null) : null;

  const increaseOn = conversation.firstEmailSentAt
    ? new Date(conversation.firstEmailSentAt.getTime() + settings.priceIncreaseDays * 86_400_000)
    : null;

  // The business's colour tints every step through these variables
  const brandStyle: Record<string, string> = {
    '--demo-primary': data.primaryColor,
    '--demo-on-primary': readableTextColor(data.primaryColor),
  };

  return (
    <div
      style={brandStyle}
      className="min-h-svh bg-gradient-to-b from-amber-50/70 via-white to-white"
    >
      <DemoTour
        slug={slug}
        track={!isPreview}
        initialStep={step.success ? step.data : null}
        data={data}
        reviews={details ? pickReviews(details.reviews) : []}
        photos={(details?.photos ?? []).slice(0, PHOTO_COUNT).map((photo, index) => ({
          src: `/api/demo/${slug}/photo/${index}`,
          author: photo.authorAttributions.at(0)?.displayName ?? null,
        }))}
        pricing={{
          price: settings.monthlyPrice,
          newPrice: settings.newMonthlyPrice,
          slots: settings.onboardingSlotsPerMonth,
          increaseOn: increaseOn?.toISOString() ?? null,
          increaseLabel: increaseOn
            ? format.dateTime(increaseOn, {
                day: 'numeric',
                month: 'long',
                timeZone: AppConfig.timeZone,
              })
            : null,
        }}
        whatsappNumber={settings.whatsappBusinessNumber}
      />
    </div>
  );
}
