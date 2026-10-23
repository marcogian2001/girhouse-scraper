import { FlaskConical } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { CampaignTestsTable } from '@/components/CampaignTestsTable';
import { InstantlySyncButton } from '@/components/InstantlySyncButton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getApiContext } from '@/libs/ApiAuth';
import { getCampaignTests } from '@/libs/CampaignTests';
import {
  getInstantlySyncedAt,
  refreshInstantlyStatsIfStale,
  syncInstantlyStats,
} from '@/libs/InstantlySync';
import { logger } from '@/libs/Logger';
import { AppConfig } from '@/utils/AppConfig';

/**
 * Reads when Instantly was last copied, copying it first when it never was, so the
 * first view already counts old campaigns; a stale copy is refreshed in the background.
 * @returns When Instantly was last copied, or null when it could not be.
 */
const ensureInstantlyCopy = async () => {
  const syncedAt = await getInstantlySyncedAt();

  if (syncedAt) {
    await refreshInstantlyStatsIfStale(syncedAt);

    return syncedAt;
  }

  await syncInstantlyStats().catch((error: unknown) => {
    logger.warn('The first Instantly sync failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return await getInstantlySyncedAt();
};

export default async function CampaignTestsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'CampaignTestsPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const syncedAt = context ? await ensureInstantlyCopy() : null;
  const tests = context ? await getCampaignTests({ organizationId: context.organizationId }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {syncedAt
              ? t('synced_at', {
                  date: format.dateTime(syncedAt, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: AppConfig.timeZone,
                  }),
                })
              : t('never_synced')}
          </span>
          <InstantlySyncButton />
        </div>
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
        <CampaignTestsTable tests={tests} />
      )}
    </div>
  );
}
