import { FlaskConical } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { CampaignTestsTable } from '@/components/CampaignTestsTable';
import { EmptyState } from '@/components/EmptyState';
import { InstantlySyncButton } from '@/components/InstantlySyncButton';
import { PageHeader } from '@/components/PageHeader';
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
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
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
          </>
        }
      />

      {tests.length === 0 ? (
        <EmptyState
          icon={<FlaskConical />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <CampaignTestsTable tests={tests} />
      )}
    </div>
  );
}
