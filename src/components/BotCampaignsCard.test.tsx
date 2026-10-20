import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { BotCampaignsCard } from '@/components/BotCampaignsCard';
import messages from '@/locales/en.json';

const campaigns = [
  { id: 'c1', name: 'Ottico Roma', botManaged: true, createdAt: new Date('2026-10-12') },
  { id: 'c2', name: 'Idraulico Roma', botManaged: false, createdAt: new Date('2026-10-05') },
  { id: 'c3', name: 'Avvocato Milano', botManaged: false, createdAt: new Date('2026-10-06') },
];

/**
 * Mounts the card with the translations it needs.
 * @returns The rendered result.
 */
const renderCard = async () =>
  await render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Rome">
      <BotCampaignsCard campaigns={campaigns} />
    </NextIntlClientProvider>,
  );

describe('Bot campaigns card', () => {
  it('counts the campaigns handled by the bot', async () => {
    await renderCard();

    await expect.element(page.getByText('1 of 3 with the bot')).toBeVisible();
    await expect.element(page.getByRole('tab', { name: 'Sales reps (2)' })).toBeVisible();
  });

  it('shows only the campaigns matching the search', async () => {
    await renderCard();

    await page.getByPlaceholder('Search a campaign').fill('roma');

    await expect.element(page.getByText('Ottico Roma')).toBeVisible();
    await expect.element(page.getByText('Avvocato Milano')).not.toBeInTheDocument();
  });

  it('shows only the bot campaigns under their filter', async () => {
    await renderCard();

    await page.getByRole('tab', { name: 'Bot (1)' }).click();

    await expect.element(page.getByText('Ottico Roma')).toBeVisible();
    await expect.element(page.getByText('Idraulico Roma')).not.toBeInTheDocument();
  });

  it('offers to hand every selected campaign over at once', async () => {
    await renderCard();

    await page.getByRole('checkbox', { name: 'Select all' }).click();

    await expect.element(page.getByText('3 campaigns selected')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Hand to the bot' })).toBeVisible();
  });
});
