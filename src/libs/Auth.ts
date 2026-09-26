import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins/organization';
import * as schema from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import { db } from './DB';
import { Env } from './Env';
import { createPersonalOrganization, resolveOrganizationId } from './Organization';

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
      organization: schema.organizationSchema,
      member: schema.memberSchema,
      invitation: schema.invitationSchema,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createPersonalOrganization(user);
        },
      },
    },
    session: {
      create: {
        // Every sign-in starts inside an organization, so no page has to handle none
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await resolveOrganizationId(session.userId),
          },
        }),
      },
    },
  },
  // `nextCookies` lets server actions set the session cookie without extra plumbing
  plugins: [organization(), nextCookies()],
});
