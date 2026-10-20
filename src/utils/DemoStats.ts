import type { demoEventSchema } from '@/models/Schema';

/** The demo walks through this many steps; reaching the last one counts as watched. */
export const DEMO_STEPS = 6;

/** How often a visible demo tab reports in. */
export const HEARTBEAT_SECONDS = 15;

type DemoEvent = Pick<typeof demoEventSchema.$inferSelect, 'type' | 'step'>;

/**
 * Names how far a lead went: the follow-ups and the GHL field read this.
 * @param opened Whether the demo was opened at all.
 * @param maxStep The furthest step reached.
 * @returns The behaviour.
 */
const behaviorOf = (opened: boolean, maxStep: number) => {
  if (!opened) {
    return 'not_opened' as const;
  }

  return maxStep >= DEMO_STEPS ? ('complete' as const) : ('partial' as const);
};

/**
 * Sums up how a lead went through their demo.
 * @param events Every event recorded on the demo.
 * @returns Whether it was opened, how far the lead got, and for how long.
 */
export const summarizeDemo = (events: DemoEvent[]) => {
  const opened = events.length > 0;
  const maxStep = Math.max(0, ...events.map((event) => event.step ?? 0));
  const heartbeats = events.filter((event) => event.type === 'heartbeat').length;

  return {
    opened,
    maxStep,
    secondsOnPage: heartbeats * HEARTBEAT_SECONDS,
    whatsappClicked: events.some((event) => event.type === 'whatsapp_click'),
    phoneLeft: events.some((event) => event.type === 'phone_submitted'),
    booked: events.some((event) => event.type === 'booked'),
    behavior: behaviorOf(opened, maxStep),
  };
};
