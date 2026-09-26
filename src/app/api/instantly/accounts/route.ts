import { NextResponse } from 'next/server';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { listAccounts } from '@/services/Instantly';

export const GET = async () => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  return NextResponse.json({ accounts: await listAccounts() });
};
