import * as z from 'zod';

export const observationProviderSchema = z.enum([
  'google',
  'apify',
  'parallel',
  'prospeo',
  'millionverifier',
]);
const providerObservationSchema = z.object({
  starts: z.number().int().nonnegative(),
  polls: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
});
export const jobObservationSchema = z.object({
  version: z.literal(1),
  runs: z.number().int().positive(),
  failedRuns: z.number().int().nonnegative(),
  firstStartedAt: z.iso.datetime(),
  lastFinishedAt: z.iso.datetime(),
  elapsedMs: z.number().int().nonnegative(),
  reused: z.number().int().nonnegative(),
  partial: z.boolean(),
  providers: z.partialRecord(observationProviderSchema, providerObservationSchema),
});
export type JobObservation = z.infer<typeof jobObservationSchema>;
export type ObservationProvider = z.infer<typeof observationProviderSchema>;
