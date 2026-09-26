import * as z from 'zod';
import { Env } from '@/libs/Env';
import { requireEnv } from '@/utils/Helpers';

const MILLIONVERIFIER_API_URL = 'https://api.millionverifier.com/api/v3';

/** List price of one verification on the smallest credit pack, in millionths of a US dollar. */
export const VERIFICATION_COST_MICROS = 3700;

/** How long MillionVerifier may spend on one address before answering. */
const VERIFY_TIMEOUT_SECONDS = 20;

const verifyResponseSchema = z.object({
  result: z.string(),
  error: z.string().nullish(),
});

export type VerificationResult = 'valid' | 'catch_all' | 'invalid' | 'unknown';

/**
 * Maps a MillionVerifier result onto the verdicts the app acts on.
 * Disposable addresses count as invalid: nobody reads them.
 * @param result The `result` field of the response.
 * @returns The verdict.
 */
export const toVerificationResult = (result: string): VerificationResult => {
  if (result === 'ok') {
    return 'valid';
  }

  if (result === 'catch_all') {
    return 'catch_all';
  }

  if (result === 'invalid' || result === 'disposable') {
    return 'invalid';
  }

  return 'unknown';
};

/**
 * Checks whether an email address can receive mail.
 * @param email The address to verify.
 * @returns The verdict.
 * @throws {Error} When the API key is missing or MillionVerifier rejects the request.
 */
export const verifyEmail = async (email: string) => {
  const apiKey = requireEnv('MILLIONVERIFIER_API_KEY', Env.MILLIONVERIFIER_API_KEY);

  const params = new URLSearchParams({
    api: apiKey,
    email,
    timeout: String(VERIFY_TIMEOUT_SECONDS),
  });

  const response = await fetch(`${MILLIONVERIFIER_API_URL}/?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`MillionVerifier failed with ${response.status}: ${await response.text()}`);
  }

  const body = verifyResponseSchema.parse(await response.json());

  if (body.error) {
    throw new Error(`MillionVerifier failed: ${body.error}`);
  }

  return toVerificationResult(body.result);
};
