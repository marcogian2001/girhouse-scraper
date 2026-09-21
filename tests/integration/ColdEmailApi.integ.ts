import { expect, test } from '@playwright/test';

const CAMPAIGN_ID = '00000000-0000-0000-0000-000000000000';

test.describe('Cold email API', () => {
  test.describe('Authentication', () => {
    // `src/proxy.ts` does not run over `/api`: each handler reads the Better Auth
    // session itself through `getApiUserId` and refuses the request on its own.
    const anonymousRequests = [
      { name: 'list campaigns', method: 'GET', path: '/api/campaigns' },
      { name: 'create campaign', method: 'POST', path: '/api/campaigns' },
      { name: 'read campaign status', method: 'GET', path: `/api/campaigns/${CAMPAIGN_ID}/status` },
      { name: 'approve drafts', method: 'POST', path: `/api/campaigns/${CAMPAIGN_ID}/approve` },
      { name: 'push to Instantly', method: 'POST', path: `/api/campaigns/${CAMPAIGN_ID}/push` },
      { name: 'edit a draft', method: 'PATCH', path: `/api/drafts/${CAMPAIGN_ID}` },
      { name: 'list knowledge assets', method: 'GET', path: '/api/knowledge' },
      { name: 'delete a knowledge asset', method: 'DELETE', path: `/api/knowledge/${CAMPAIGN_ID}` },
      { name: 'list Instantly mailboxes', method: 'GET', path: '/api/instantly/accounts' },
      { name: 'run the job worker', method: 'POST', path: '/api/jobs/process' },
    ] as const;

    for (const request of anonymousRequests) {
      test(`refuses to ${request.name} without a session`, async ({ page }) => {
        const response = await page.request.fetch(request.path, {
          method: request.method,
          data: request.method === 'GET' || request.method === 'DELETE' ? undefined : {},
          failOnStatusCode: false,
        });

        expect(response.status()).toBe(401);
      });
    }

    test('leaves the Better Auth endpoints reachable', async ({ page }) => {
      const response = await page.request.get('/api/auth/get-session');

      expect(response.status()).toBe(200);
    });
  });
});
