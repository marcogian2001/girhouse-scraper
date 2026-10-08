import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { summarizeLeadSearch } from '@/utils/LeadSearchSummary';
import '@/styles/global.css';
import { LeadSearchSummary } from './LeadSearchSummary';
import { LeadTable } from './LeadTable';

const mount = async (measured: boolean) => {
  const summary = summarizeLeadSearch({
    leads: [],
    websiteFilter: 'any',
    allowedCategories: [],
    jobs: [
      {
        type: 'lead_research',
        status: 'done',
        observation: measured
          ? {
              version: 1,
              runs: 2,
              failedRuns: 0,
              elapsedMs: 2500,
              firstStartedAt: '2026-10-08T10:00:00.000Z',
              lastFinishedAt: '2026-10-08T10:01:00.000Z',
              reused: 1,
              partial: false,
              providers: {
                parallel: { starts: 1, polls: 1, reads: 0, elapsedMs: 1000, failed: 0 },
              },
            }
          : null,
      },
    ],
  });
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <div className="mx-auto max-w-4xl p-4" style={{ fontFamily: 'Arial, sans-serif' }}>
        <LeadSearchSummary summary={summary} validEmails={0} reusedPlaces={0} />
      </div>
    </NextIntlClientProvider>,
  );
};

describe('Lead search measurement display', () => {
  it('shows missing historical measurements without inventing zero elapsed time', async () => {
    await mount(false);
    await page.getByText('Observed time and operations', { exact: true }).click();
    await expect
      .element(page.getByText(/Decision maker research: 0\/1 jobs measured/u))
      .toHaveTextContent('Processing: Unavailable');
    await expect
      .element(page.getByText(/Decision maker research: 0\/1 jobs measured/u))
      .toHaveTextContent('Partial data');
  });

  it('separates processing time, observed interval and provider polls on mobile', async () => {
    await page.viewport(390, 844);
    await mount(true);
    await page.getByText('Observed time and operations', { exact: true }).click();
    await expect
      .element(page.getByText(/Decision maker research: 1\/1 jobs measured/u))
      .toHaveTextContent('Processing: 3 s');
    await expect
      .element(page.getByText(/Decision maker research: 1\/1 jobs measured/u))
      .toHaveTextContent('Observed interval: 60 s');
    await expect
      .element(page.getByText(/parallel: starts 1/u))
      .toHaveTextContent('Status checks 1');
    await page.screenshot({ path: 'vitest-test-results/lead-summary-mobile.png' });
    await page.viewport(1100, 800);
    await page.screenshot({ path: 'vitest-test-results/lead-summary-desktop.png' });
  });

  it('shows catch-all review and blocked reasons in the mobile list', async () => {
    await page.viewport(390, 844);
    const base = {
      city: 'Test',
      category: 'Centro estetico',
      description: null,
      phone: null,
      website: null,
      domain: null,
      hasWebsite: false,
      firstName: null,
      lastName: null,
      role: null,
      emailSource: null,
      email: 'test@example.com',
      emailVerification: 'catch_all' as const,
    };
    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LeadTable
          leads={[
            { ...base, id: 'one', company: 'Review example', status: 'ready' },
            {
              ...base,
              id: 'two',
              company: 'Blocked example',
              status: 'failed',
              errorMessage: 'Unknown request outcome',
            },
          ]}
        />
      </NextIntlClientProvider>,
    );
    await expect.element(page.getByText('Requires review', { exact: true }).last()).toBeVisible();
    await expect
      .element(page.getByText('Unknown request outcome', { exact: true }).last())
      .toBeVisible();
  });
});
