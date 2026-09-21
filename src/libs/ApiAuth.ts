import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from './Auth';

/**
 * Reads the signed-in user for an API route.
 * `src/proxy.ts` does not run over `/api`, so every handler authenticates
 * itself and scopes its queries to the returned id. This validates the session
 * against the database, unlike the cookie check the proxy uses to redirect.
 * @returns The user id, or null when the request is anonymous.
 */
export const getApiUserId = async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user.id ?? null;
};

/**
 * Builds the response for an unauthenticated API request.
 * @returns A 401 JSON response.
 */
export const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

/**
 * Builds the response for a resource the user cannot see.
 * @returns A 404 JSON response.
 */
export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
