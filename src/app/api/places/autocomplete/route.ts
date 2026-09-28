import { NextResponse } from 'next/server';
import * as z from 'zod';
import { getApiContext, unauthorized } from '@/libs/ApiAuth';
import { suggestAreas } from '@/services/GooglePlaces';

const inputSchema = z.string().trim().min(2).max(200);

export const GET = async (request: Request) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const parse = inputSchema.safeParse(new URL(request.url).searchParams.get('input'));

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  return NextResponse.json({ suggestions: await suggestAreas(parse.data) });
};
