import * as Sentry from '@sentry/nextjs';

const sentryOptions: Sentry.NodeOptions | Sentry.EdgeOptions = {
  // Sentry DSN
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable Spotlight in development
  spotlight: process.env.NODE_ENV === 'development',

  integrations: [Sentry.consoleLoggingIntegration()],

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
};

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node races IPv6 and IPv4 giving each address 250ms: on a network without IPv6 a slow
    // IPv4 handshake runs out too, and GHL, Google and database calls fail with ETIMEDOUT
    const net = await import('node:net');
    net.setDefaultAutoSelectFamilyAttemptTimeout(1000);
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // Node.js Sentry configuration
      Sentry.init(sentryOptions);
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      // Edge Sentry configuration
      Sentry.init(sentryOptions);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
