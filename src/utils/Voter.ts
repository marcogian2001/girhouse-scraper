import { createHash } from 'node:crypto';

/**
 * Reads the client IP address set by the hosting proxy.
 * @param headers The request headers.
 * @returns The first forwarded address, or null when there is none.
 */
export const getClientIp = (headers: Headers) => {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  if (forwarded) {
    return forwarded;
  }

  return headers.get('x-real-ip')?.trim() ?? null;
};

/**
 * Identifies a voter within one poll without storing their address.
 * Salting with the poll id keeps the same voter unlinkable across polls.
 * @param options The hash options.
 * @param options.pollId The poll being voted on.
 * @param options.ip The voter's IP address, or null when it is unknown.
 * @returns A hex SHA-256 digest.
 */
export const hashVoter = (options: { pollId: string; ip: string | null }) =>
  createHash('sha256')
    .update(`${options.pollId}:${options.ip ?? 'unknown'}`)
    .digest('hex');
