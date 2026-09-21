import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CampaignNameEditor } from '@/components/CampaignNameEditor';
import messages from '@/locales/en.json';

/**
 * Replaces `fetch` so no request leaves the test.
 * @param response The response the rename request gets back.
 * @returns The spy that records the requests.
 */
const stubFetch = (response: Response) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

/**
 * Mounts the editor with the translations it needs.
 * @returns The rendered result.
 */
const renderEditor = async () =>
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignNameEditor campaignId="campaign-1" name="Spring outreach" />
    </NextIntlClientProvider>,
  );

const getField = () => page.getByRole('textbox', { name: 'Campaign name' });

/** Opens the name field the way a user does. */
const openField = async () => {
  await page.getByRole('button', { name: 'Spring outreach' }).dblClick();
};

describe('Campaign name editor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Opening', () => {
    it('shows the name as a heading until it is double-clicked', async () => {
      await renderEditor();

      await expect
        .element(page.getByRole('heading', { name: 'Spring outreach' }))
        .toBeInTheDocument();
      expect(page.getByRole('textbox').elements()).toHaveLength(0);
    });

    it('opens the field filled with the current name on double-click', async () => {
      await renderEditor();

      await openField();

      await expect.element(getField()).toHaveValue('Spring outreach');
    });
  });

  describe('Cancelling', () => {
    it('restores the name on Escape without a request', async () => {
      const fetchSpy = stubFetch(Response.json({}));
      await renderEditor();

      await openField();
      await getField().fill('Something else');
      await userEvent.keyboard('{Escape}');

      await expect
        .element(page.getByRole('heading', { name: 'Spring outreach' }))
        .toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('keeps the name on a blank value without a request', async () => {
      const fetchSpy = stubFetch(Response.json({}));
      await renderEditor();

      await openField();
      await getField().fill('   ');
      await userEvent.keyboard('{Enter}');

      await expect
        .element(page.getByRole('heading', { name: 'Spring outreach' }))
        .toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Saving', () => {
    it('sends the trimmed name and shows it on Enter', async () => {
      const fetchSpy = stubFetch(Response.json({}));
      await renderEditor();

      await openField();
      await getField().fill('  Autumn outreach ');
      await userEvent.keyboard('{Enter}');

      await expect
        .element(page.getByRole('heading', { name: 'Autumn outreach' }))
        .toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/campaigns/campaign-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Autumn outreach' }),
        }),
      );
    });

    it('keeps the old name and shows an error when the request fails', async () => {
      stubFetch(new Response(null, { status: 500 }));
      await renderEditor();

      await openField();
      await getField().fill('Autumn outreach');
      await userEvent.keyboard('{Enter}');

      await expect
        .element(page.getByRole('heading', { name: 'Spring outreach' }))
        .toBeInTheDocument();
      await expect
        .element(page.getByText('This campaign could not be renamed.'))
        .toBeInTheDocument();
    });
  });
});
