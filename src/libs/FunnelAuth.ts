import { safeEqual } from '@/utils/Secrets';

/**
 * Tells whether a request comes from girhouse.com: it carries the funnel secret in the
 * `x-funnel-secret` header.
 * @param request The request.
 * @param secret The funnel secret; unset, nobody is let in.
 * @returns True when the header matches the secret.
 */
export const isFunnelCaller = (request: Request, secret?: string) => {
  const header = request.headers.get('x-funnel-secret');

  return Boolean(secret && header && safeEqual(header, secret));
};
