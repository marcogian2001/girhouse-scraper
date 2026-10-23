import { expect, test } from '@playwright/test';

const ID = '00000000-0000-0000-0000-000000000000';

test.describe('Reply automation API', () => {
  test.describe('Authentication', () => {
    const anonymousRequests = [
      { name: 'import replies', method: 'POST', path: '/api/replies/import' },
      { name: 'read a conversation status', method: 'GET', path: `/api/replies/${ID}/status` },
      {
        name: 'override a classification',
        method: 'PATCH',
        path: `/api/replies/classifications/${ID}`,
      },
      { name: 'approve a reply', method: 'POST', path: `/api/replies/outbound/${ID}/approve` },
      { name: 'discard a reply', method: 'POST', path: `/api/replies/outbound/${ID}/discard` },
      { name: 'add an objection', method: 'POST', path: '/api/objections' },
      { name: 'edit an objection', method: 'PATCH', path: `/api/objections/${ID}` },
      { name: 'delete an objection', method: 'DELETE', path: `/api/objections/${ID}` },
      { name: 'save automation settings', method: 'PUT', path: '/api/automation/settings' },
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
  });

  test.describe('Demo pages', () => {
    test('refuses to build a demo without a session', async ({ page }) => {
      const response = await page.request.post(`/api/replies/${ID}/demo`, {
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(401);
    });

    test('answers 404 for an unknown demo page', async ({ page }) => {
      const response = await page.request.get('/it/demo/sconosciuta-a1B2c3D4e5', {
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(404);
    });

    test('ignores events for an unknown demo', async ({ page }) => {
      const response = await page.request.post('/api/demo/sconosciuta-a1B2c3D4e5/events', {
        data: { type: 'open', sessionId: 'abcdef123456' },
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(404);
    });

    test('refuses a malformed demo event', async ({ page }) => {
      const response = await page.request.post('/api/demo/sconosciuta-a1B2c3D4e5/events', {
        data: { type: 'step', sessionId: 'abcdef123456', step: 99 },
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(422);
    });
  });

  test.describe('Instantly webhook', () => {
    const reply = {
      event_type: 'reply_received',
      timestamp: '2026-10-17T09:00:00.000Z',
      campaign_id: 'unknown-campaign',
      lead_email: 'mario@example.com',
      reply_text: 'Mi interessa',
    };

    test('refuses a delivery without the secret', async ({ page }) => {
      const response = await page.request.post('/api/webhooks/instantly', {
        data: reply,
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(401);
    });

    test('refuses a delivery with a wrong secret', async ({ page }) => {
      const response = await page.request.post(
        '/api/webhooks/instantly?secret=wrong-secret-value',
        {
          data: reply,
          failOnStatusCode: false,
        },
      );

      expect(response.status()).toBe(401);
    });

    test('ignores a reply for a campaign the platform did not push', async ({ page }) => {
      // Set by whoever runs the suite; without it every delivery is refused
      test.skip(!process.env.INSTANTLY_WEBHOOK_SECRET, 'INSTANTLY_WEBHOOK_SECRET is not set');

      const response = await page.request.post(
        `/api/webhooks/instantly?secret=${process.env.INSTANTLY_WEBHOOK_SECRET}`,
        { data: reply },
      );

      expect(await response.json()).toStrictEqual({ status: 'ignored' });
    });
  });

  test.describe('GHL webhook', () => {
    const delivery = {
      contact_id: 'ghl-contact-test',
      email: 'nobody@example.com',
      customData: { event: 'appointment_booked' },
    };

    test('refuses a delivery without the secret', async ({ page }) => {
      const response = await page.request.post('/api/webhooks/ghl', {
        data: delivery,
        failOnStatusCode: false,
      });

      expect(response.status()).toBe(401);
    });

    test('ignores a contact the platform does not know', async ({ page }) => {
      test.skip(!process.env.GHL_WEBHOOK_SECRET, 'GHL_WEBHOOK_SECRET is not set');

      const response = await page.request.post(
        `/api/webhooks/ghl?secret=${process.env.GHL_WEBHOOK_SECRET}`,
        { data: delivery },
      );

      expect(await response.json()).toStrictEqual({ status: 'ignored' });
    });
  });
});
