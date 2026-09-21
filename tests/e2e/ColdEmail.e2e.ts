import { expect, test } from '@playwright/test';

test.describe('Cold email dashboard', () => {
  test.describe('Access control', () => {
    // Asserted on the redirect itself rather than on the rendered sign-in page,
    // so the check exercises the proxy gate and nothing downstream of it.
    const protectedPages = [
      { name: 'the campaigns list', path: '/dashboard/campaigns', signIn: '/sign-in' },
      { name: 'a campaign', path: '/dashboard/campaigns/new', signIn: '/sign-in' },
      { name: 'the knowledge base', path: '/dashboard/knowledge', signIn: '/sign-in' },
      {
        name: 'the Italian campaigns list',
        path: '/it/dashboard/campaigns',
        signIn: '/it/sign-in',
      },
    ] as const;

    for (const page of protectedPages) {
      test(`redirects an anonymous visitor away from ${page.name}`, async ({ request }) => {
        const response = await request.get(page.path, { maxRedirects: 0 });

        expect(response.status()).toBe(307);
        expect(response.headers().location).toContain(page.signIn);
      });
    }
  });
});
