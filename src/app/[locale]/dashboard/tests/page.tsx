import { FlaskConical } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { RateBase } from '@/components/CampaignTestsTable';
import { CampaignTestsTable } from '@/components/CampaignTestsTable';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getApiContext } from '@/libs/ApiAuth';
import { getCampaignTests } from '@/libs/CampaignTests';
import { Link } from '@/libs/I18nNavigation';

export default async function CampaignTestsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'CampaignTestsPage' });
  const context = await getApiContext();
  const { base: baseParam } = await props.searchParams;
  const base: RateBase = baseParam === 'step' ? 'step' : 'contacted';

  const tests = context ? await getCampaignTests({ organizationId: context.organizationId }) : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {tests.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FlaskConical className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">{t('label_base')}</span>
            {(['contacted', 'step'] as const).map((option) => (
              <Button
                key={option}
                asChild
                size="sm"
                variant={option === base ? 'default' : 'outline'}
              >
                <Link href={`/dashboard/tests/?base=${option}`}>{t(`base_${option}`)}</Link>
              </Button>
            ))}
            {base === 'step' && (
              <span className="text-xs text-muted-foreground">{t('hint_step')}</span>
            )}
          </div>

          <CampaignTestsTable tests={tests} base={base} />
        </>
      )}
    </div>
  );
}
