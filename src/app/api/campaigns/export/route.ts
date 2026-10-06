import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { loadCampaignExport } from '@/libs/Campaigns';
import { buildCampaignCsv, toCsvDownload } from '@/utils/CampaignExport';

export const GET = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  // Exports the same campaigns the list shows: active ones unless archived are asked for
  const isArchived = new URL(request.url).searchParams.get('view') === 'archived';

  const { campaigns, ...rows } = await loadCampaignExport({
    organizationId: context.organizationId,
    archived: isArchived,
  });

  const csv = buildCampaignCsv({
    // Campaigns of different lengths share the columns of the longest one
    emailCount: Math.max(0, ...campaigns.map((campaign) => campaign.emailCount)),
    campaignNames: new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    ...rows,
  });
  const date = new Date().toISOString().slice(0, 10);

  const prefix = isArchived ? 'archived-campaigns' : 'campaigns';

  return toCsvDownload({ fileName: `${prefix}-${date}.csv`, csv });
};
