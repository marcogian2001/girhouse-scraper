import { CampaignTestCard } from '@/components/CampaignTestCard';
import { getCampaignTests } from '@/libs/CampaignTests';

/**
 * Loads a pushed campaign's test record on its own, so the campaign page can
 * stream it in instead of waiting for its outcome and cost queries.
 * @param props Component props.
 * @param props.organizationId The organization the campaign belongs to.
 * @param props.campaignId The campaign.
 * @returns The test card, or nothing when the campaign has no test yet.
 */
export const CampaignTestSection = async (props: {
  organizationId: string;
  campaignId: string;
}) => {
  const [test] = await getCampaignTests(props);

  return test ? <CampaignTestCard test={test} /> : null;
};
