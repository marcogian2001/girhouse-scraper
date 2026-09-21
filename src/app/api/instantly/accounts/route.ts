import { NextResponse } from 'next/server';
import { getApiUserId, unauthorized } from '@/libs/ApiAuth';
import { listAccounts } from '@/services/Instantly';

export const GET = async () => {
  const userId = await getApiUserId();

  if (!userId) {
    return unauthorized();
  }

  return NextResponse.json({ accounts: await listAccounts() });
};
