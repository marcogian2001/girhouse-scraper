import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LeadSearchForm } from '@/components/LeadSearchForm';
import { PLACE_COST_MICROS } from '@/services/Apify';
import { VERIFICATION_COST_MICROS } from '@/services/MillionVerifier';
import { PROCESSOR_RUN_COST_MICROS } from '@/services/Parallel';
import { EMAIL_COST_MICROS } from '@/services/Prospeo';

export default async function NewLeadSearchPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'NewLeadSearchPage' });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {/* Prices live in server-only service modules, so they are handed down */}
      <LeadSearchForm
        pricing={{
          placeMicros: PLACE_COST_MICROS,
          emailMicros: EMAIL_COST_MICROS,
          verificationMicros: VERIFICATION_COST_MICROS,
          runMicros: PROCESSOR_RUN_COST_MICROS,
        }}
      />
    </div>
  );
}
