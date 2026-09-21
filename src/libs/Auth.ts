import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import * as schema from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import { db } from './DB';
import { Env } from './Env';

export const auth = betterAuth({
  secret: requireEnv('BETTER_AUTH_SECRET', Env.BETTER_AUTH_SECRET),
  baseURL: Env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.userSchema,
      session: schema.sessionSchema,
      account: schema.accountSchema,
      verification: schema.verificationSchema,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Lets server actions set the session cookie without extra plumbing
  plugins: [nextCookies()],
});
