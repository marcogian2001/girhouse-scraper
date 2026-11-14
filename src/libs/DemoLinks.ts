import { getBaseUrl } from '@/utils/Helpers';
import { Env } from './Env';

/**
 * Builds the public link of a demo, on the demo domain when there is one.
 * @param slug The demo slug.
 * @returns The absolute URL of the Italian demo page.
 */
export const demoUrl = (slug: string) =>
  Env.DEMO_URL ? `${Env.DEMO_URL}/${slug}` : `${getBaseUrl()}/it/demo/${slug}`;
