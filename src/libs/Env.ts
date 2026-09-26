import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

export const Env = createEnv({
  server: {
    ARCJET_KEY: z.string().startsWith('ajkey_').optional(),
    DATABASE_URL: z.string().min(1),
    // Signs every session cookie: rotating it logs everyone out
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.string().optional(),
    // Optional like `ARCJET_KEY`, so builds and tests run without secrets.
    // Each service asserts its own key at call time, see `src/services/`.
    PARALLEL_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
    INSTANTLY_API_KEY: z.string().min(1).optional(),
    APIFY_API_TOKEN: z.string().min(1).optional(),
    PROSPEO_API_KEY: z.string().min(1).optional(),
    MILLIONVERIFIER_API_KEY: z.string().min(1).optional(),
    JOBS_SECRET: z.string().min(16).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_LOGGING_LEVEL: z
      .enum(['error', 'info', 'debug', 'warning', 'trace', 'fatal'])
      .default('info'),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    ARCJET_KEY: process.env.ARCJET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    PARALLEL_API_KEY: process.env.PARALLEL_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    INSTANTLY_API_KEY: process.env.INSTANTLY_API_KEY,
    APIFY_API_TOKEN: process.env.APIFY_API_TOKEN,
    PROSPEO_API_KEY: process.env.PROSPEO_API_KEY,
    MILLIONVERIFIER_API_KEY: process.env.MILLIONVERIFIER_API_KEY,
    JOBS_SECRET: process.env.JOBS_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_LOGGING_LEVEL: process.env.NEXT_PUBLIC_LOGGING_LEVEL,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NODE_ENV: process.env.NODE_ENV,
  },
});
