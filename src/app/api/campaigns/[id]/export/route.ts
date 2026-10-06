import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { loadCampaignExport } from '@/libs/Campaigns';
import { buildCampaignCsv, toCsvDownload } from '@/utils/CampaignExport';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const { campaigns, ...rows } = await loadCampaignExport({
    organizationId: context.organizationId,
    campaignId: id,
  });
  const [campaign] = campaigns;

  if (!campaign) {
    return notFound();
  }

  const csv = buildCampaignCsv({ emailCount: campaign.emailCount, ...rows });

  return toCsvDownload({ fileName: `${campaign.name}.csv`, csv });
};
