import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { VerificationResult } from '@/services/MillionVerifier';

const REOON_API_URL = 'https://emailverifier.reoon.com/api/v1/verify';

/** List price of one power-mode verification on the smallest instant credit pack, in millionths of a US dollar. */
export const VERIFICATION_COST_MICROS = 1000;

/** A power-mode check talks to the mail server, which can take a while on slow providers. */
const VERIFY_TIMEOUT_MS = 30_000;

const verifyResponseSchema = z.object({
  status: z.string(),
  is_deliverable: z.boolean().nullish(),
});

/**
 * Maps a Reoon power-mode answer onto the verdicts the app acts on.
 * A role account such as info@ is fine for a small business, as long as it delivers.
 * @param response The parsed response.
 * @returns The verdict.
 */
export const toReoonVerdict = (
  response: z.infer<typeof verifyResponseSchema>,
): VerificationResult => {
  if (response.status === 'safe') {
    return 'valid';
  }

  if (response.status === 'role_account') {
    return response.is_deliverable ? 'valid' : 'unknown';
  }

  if (response.status === 'catch_all') {
    return 'catch_all';
  }

  return response.status === 'unknown' ? 'unknown' : 'invalid';
};

/**
 * Tells whether a second opinion on addresses MillionVerifier could not settle is configured.
 * @returns Whether the Reoon API key is set.
 */
export const hasReoon = () => Boolean(Env.REOON_API_KEY);

/**
 * Checks an address MillionVerifier could not settle, such as one at Tiscali or Yahoo.
 * A slow or failed check counts as unknown, since this is only a second opinion.
 * @param email The address to verify.
 * @returns The verdict.
 */
export const verifyEmailPower = async (email: string) => {
  const params = new URLSearchParams({ email, key: Env.REOON_API_KEY ?? '', mode: 'power' });

  const response = await fetch(`${REOON_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  }).catch(() => null);

  if (!response?.ok) {
    return 'unknown';
  }

  const body = verifyResponseSchema.safeParse(await response.json().catch(() => null));

  return body.success ? toReoonVerdict(body.data) : 'unknown';
};
