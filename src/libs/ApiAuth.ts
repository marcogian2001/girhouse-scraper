import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { cache } from 'react';
import { auth } from './Auth';
import { resolveOrganizationId } from './Organization';

/**
 * Reads the signed-in session once per render, however many server
 * components ask for it.
 * @returns The session, or null when the request is anonymous.
 */
export const getSession = cache(
  async () => await auth.api.getSession({ headers: await headers() }),
);

/**
 * Reads the signed-in user and the organization they are working in.
 * `src/proxy.ts` does not run over `/api`, so every handler authenticates
 * itself and scopes its queries to the returned organization. This validates
 * the session, unlike the cookie check the proxy uses to redirect, and
 * re-checks the membership behind the active organization. A render shares
 * one lookup between the layout and the page.
 * @returns The user and organization ids, or null when the request is
 * anonymous or the user belongs to no organization.
 */
export const getApiContext = cache(async () => {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const organizationId = await resolveOrganizationId(
    session.user.id,
    session.session.activeOrganizationId,
  );

  return organizationId ? { userId: session.user.id, organizationId } : null;
});

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
