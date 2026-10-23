import { posthog } from 'posthog-js';
import { Env } from '@/libs/Env';

/**
 * Starts PostHog on a lead's demo: page views, clicks, scroll depth and session
 * replays, all filed under the demo slug so one lead's visits sit together.
 * Does nothing without a project key.
 * @param options The demo.
 * @param options.slug The demo slug.
 * @param options.company The business the demo was built for.
 */
export const startDemoAnalytics = (options: { slug: string; company: string }) => {
  if (!Env.NEXT_PUBLIC_POSTHOG_KEY || posthog.__loaded) {
    return;
  }

  posthog.init(Env.NEXT_PUBLIC_POSTHOG_KEY, {
    // Proxied through `next.config.ts`, so ad blockers let it through
    api_host: '/ingest',
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-08-30',
    person_profiles: 'identified_only',
  });
  posthog.identify(options.slug, { company: options.company });
  posthog.register({ demo_slug: options.slug, company: options.company });
};

/**
 * Records one moment of the demo in PostHog, for funnels and drop-off.
 * A no-op until `startDemoAnalytics` ran.
 * @param event The event name, e.g. `demo_scene`.
 * @param properties What to attach to it.
 */
export const captureDemoEvent = (event: string, properties?: Record<string, unknown>) => {
  if (posthog.__loaded) {
    posthog.capture(event, properties);
  }
};
