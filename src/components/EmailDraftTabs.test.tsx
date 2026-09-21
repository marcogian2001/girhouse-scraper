import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { EmailDraftTabs } from '@/components/EmailDraftTabs';
import messages from '@/locales/en.json';

const drafts = [
  { id: 'draft-1', stepIndex: 1, subject: 'First subject', body: 'First body' },
  { id: 'draft-2', stepIndex: 2, subject: 'Second subject', body: 'Second body' },
  { id: 'draft-3', stepIndex: 3, subject: 'Third subject', body: 'Third body' },
];

/**
 * Mounts the tabs with the translations the editor inside them needs.
 * @returns The rendered result.
 */
const renderTabs = async () =>
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EmailDraftTabs drafts={drafts} delaysDays={[3, 4, 0]} />
    </NextIntlClientProvider>,
  );

describe('Email draft tabs', () => {
  describe('Selection', () => {
    it('opens the first email', async () => {
      await renderTabs();

      await expect
        .element(page.getByRole('tab', { name: 'Email 1' }))
        .toHaveAttribute('data-state', 'active');
    });

    it('opens the email whose tab is clicked', async () => {
      await renderTabs();

      await page.getByRole('tab', { name: 'Email 3' }).click();

      await expect
        .element(page.getByRole('tab', { name: 'Email 3' }))
        .toHaveAttribute('data-state', 'active');
      await expect
        .element(page.getByRole('tab', { name: 'Email 1' }))
        .toHaveAttribute('data-state', 'inactive');
    });

    it('renders one tab per draft', async () => {
      await renderTabs();

      await expect.element(page.getByRole('tab', { name: 'Email 2' })).toBeInTheDocument();
      expect(page.getByRole('tab').elements()).toHaveLength(drafts.length);
    });
  });

  describe('Unsaved edits', () => {
    it('keeps an edit made before switching tab', async () => {
      await renderTabs();

      const subject = page.getByLabelText('Subject').first();

      await subject.fill('Edited before switching');
      await page.getByRole('tab', { name: 'Email 2' }).click();
      await page.getByRole('tab', { name: 'Email 1' }).click();

      await expect.element(subject).toHaveValue('Edited before switching');
    });
  });
});
