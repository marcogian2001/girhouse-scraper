import * as z from 'zod';
import { Env } from '@/libs/Env';
import { requireEnv } from '@/utils/Helpers';

const PROSPEO_API_URL = 'https://api.prospeo.io';

/**
 * List price of one found email, in millionths of a US dollar. Prospeo only
 * bills a match, and a record enriched again within 90 days is free.
 */
export const EMAIL_COST_MICROS = 10_000;

const enrichResponseSchema = z.object({
  error: z.boolean(),
  error_code: z.string().nullish(),
  free_enrichment: z.boolean().nullish(),
  person: z
    .object({
      email: z
        .object({
          status: z.string().nullish(),
          email: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export type EmailMatch = { email: string; charged: boolean };

/**
 * Reads the email out of an enrich-person response.
 * @param body The parsed JSON response.
 * @returns The verified email and whether it was billed, or null when there is none.
 * @throws {Error} When Prospeo reports an error other than a missing match.
 */
export const parseEnrichResponse = (body: unknown): EmailMatch | null => {
  const response = enrichResponseSchema.parse(body);

  if (response.error) {
    if (response.error_code === 'NO_MATCH') {
      return null;
    }

    throw new Error(`Prospeo enrich-person failed: ${response.error_code ?? 'unknown error'}`);
  }

  const email = response.person?.email;

  if (!email?.email || email.status !== 'VERIFIED') {
    return null;
  }

  return { email: email.email.toLowerCase(), charged: !response.free_enrichment };
};

/**
 * Looks up the verified work email of a person at a company.
 * @param options The call options.
 * @param options.firstName The person's first name.
 * @param options.lastName The person's last name.
 * @param options.domain The company's website domain.
 * @returns The verified email and whether it was billed, or null when there is none.
 * @throws {Error} When the API key is missing or Prospeo rejects the request.
 */
export const findEmail = async (options: {
  firstName: string;
  lastName: string;
  domain: string;
}) => {
  const apiKey = requireEnv('PROSPEO_API_KEY', Env.PROSPEO_API_KEY);

  const response = await fetch(`${PROSPEO_API_URL}/enrich-person`, {
    method: 'POST',
    headers: {
      'X-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      only_verified_email: true,
      data: {
        first_name: options.firstName,
        last_name: options.lastName,
        company_website: options.domain,
      },
    }),
  });

  // A missing match comes back as a 400 with an error code in the body
  if (!response.ok && response.status !== 400) {
    throw new Error(
      `Prospeo enrich-person failed with ${response.status}: ${await response.text()}`,
    );
  }

  return parseEnrichResponse(await response.json());
};
