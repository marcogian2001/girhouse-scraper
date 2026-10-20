import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashes a value into a fixed-length hex digest.
 * @param value The text to hash.
 * @returns The hex SHA-256 digest.
 */
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Compares a received secret with the expected one in constant time.
 * Both sides are hashed first, so their lengths never leak through an early exit.
 * @param received The secret the caller sent.
 * @param expected The configured secret.
 * @returns Whether the two match.
 */
export const safeEqual = (received: string, expected: string) =>
  timingSafeEqual(
    createHash('sha256').update(received).digest(),
    createHash('sha256').update(expected).digest(),
  );
