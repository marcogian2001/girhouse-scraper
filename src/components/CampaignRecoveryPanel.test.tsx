import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { CampaignRecoveryPanel } from './CampaignRecoveryPanel';

vi.mock(import('@/libs/I18nNavigation'), () => ({
  useRouter: () => ({
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
  }),
}));
const mount = async (uncertain = 0, status = 200) => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ resumed: 1 }, { status }));
  vi.stubGlobal('fetch', request);
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignRecoveryPanel
        campaignId="campaign"
        budgetMicros={1_000_000}
        reason="Budget stopped"
        review={{
          revision: 'a'.repeat(64),
          ledgerConsistent: true,
          recordedMicros: 0,
          reservedMicros: 0,
          operations: [],
          candidates: [],
          running: false,
          uncertain,
          manual: 0,
          resumable: 1,
        }}
      />
    </NextIntlClientProvider>,
  );
  return request;
};
const requestBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== 'string') {
    throw new TypeError('Missing JSON body');
  }
  const parsed: unknown = JSON.parse(body);
  return parsed;
};
describe('Campaign recovery controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires review and sends the total limit with the snapshot revision', async () => {
    const request = await mount();
    const resume = page.getByRole('button', { name: 'Resume 1 reviewed jobs' });
    await expect.element(resume).toBeDisabled();
    await page.getByRole('checkbox').click();
    await resume.click();
    await expect.poll(() => request.mock.calls.length).toBe(1);
    const body = request.mock.calls[0]?.[1]?.body;
    expect(requestBody(body)).toStrictEqual({
      budgetUsd: 1,
      revision: 'a'.repeat(64),
      reviewed: true,
      action: 'resume',
    });
    expect(request.mock.calls[0]?.[0]).toBe('/api/campaigns/campaign/recovery');
  });

  it('permits a limit increase while unknown requests keep resume disabled', async () => {
    const request = await mount(1);
    await page.getByRole('spinbutton').fill('2');
    await page.getByRole('checkbox').click();
    await expect
      .element(page.getByRole('button', { name: 'Resume 1 reviewed jobs' }))
      .toBeDisabled();
    await page.getByRole('button', { name: 'Increase limit only' }).click();
    await expect.poll(() => request.mock.calls.length).toBe(1);
    expect(requestBody(request.mock.calls[0]?.[1]?.body)).toMatchObject({
      budgetUsd: 2,
      action: 'increase',
    });
  });

  it('invalidates review when the amount changes and displays rejected updates', async () => {
    await mount(0, 409);
    await page.getByRole('checkbox').click();
    await page.getByRole('spinbutton').fill('2');
    const resume = page.getByRole('button', { name: 'Resume 1 reviewed jobs' });
    await expect.element(resume).toBeDisabled();
    await page.getByRole('checkbox').click();
    await resume.click();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(messages.CampaignRecoveryPanel.error_update);
  });
});
