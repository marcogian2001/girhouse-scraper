import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import {
  CampaignRecoveryError,
  getCampaignRecovery,
  recoverCampaign,
} from '@/libs/CampaignRecovery';
import { CampaignRecoveryValidation } from '@/validations/CampaignRecoveryValidation';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();
  if (!context) {
    return unauthorized();
  }
  const { id } = await props.params;
  const result = await getCampaignRecovery({
    campaignId: id,
    organizationId: context.organizationId,
  });
  return result ? NextResponse.json(result) : notFound();
};

export const POST = async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();
  if (!context) {
    return unauthorized();
  }
  const { id } = await props.params;
  const parsed = CampaignRecoveryValidation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 422 });
  }
  try {
    const result = await recoverCampaign({
      campaignId: id,
      organizationId: context.organizationId,
      request: parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof CampaignRecoveryError)) {
      throw error;
    }
    if (error.message === 'not_found') {
      return notFound();
    }
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
};
