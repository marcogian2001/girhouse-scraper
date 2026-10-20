import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { updateAutomationSettings } from '@/libs/AutomationSettings';
import { AutomationSettingsValidation } from '@/validations/AutomationValidation';

export const PUT = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = AutomationSettingsValidation.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  const settings = await updateAutomationSettings({
    organizationId: context.organizationId,
    settings: parse.data,
  });

  return NextResponse.json({ settings });
};
