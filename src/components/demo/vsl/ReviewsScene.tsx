import { useTranslations } from 'next-intl';
import { ReviewFunnel } from '../ReviewFunnel';

/**
 * The review system on its own: the customer is asked for a rating and five stars are
 * tapped by themselves, to show where a good rating goes.
 * @param props Component props.
 * @param props.company The business.
 * @param props.customer The example customer.
 * @returns The scene.
 */
export const ReviewsScene = (props: { company: string; customer: string }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-neutral-200 md:p-8">
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold tracking-wider text-(--demo-primary) uppercase">
          {t('funnel_kicker')}
        </p>
        <h2 className="text-2xl font-bold tracking-tight">{t('funnel_title')}</h2>
        <p className="text-sm text-neutral-600">{t('funnel_subtitle')}</p>
      </div>
      <ReviewFunnel company={props.company} customer={props.customer} isAutoplay />
    </div>
  );
};
