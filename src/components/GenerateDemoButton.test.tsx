import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { GenerateDemoButton } from '@/components/GenerateDemoButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import messages from '@/locales/it.json';
import '@/styles/global.css';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn<() => void>() }));
vi.mock(import('@/libs/I18nNavigation'), () => ({
  useRouter: () => ({
    refresh,
    back: refresh,
    forward: refresh,
    push: refresh,
    replace: refresh,
    prefetch: refresh,
  }),
}));

/**
 * Mounts the actual demo form inside the card used by the dashboard.
 * @returns The rendered result.
 */
const renderForm = async () => {
  // The app layout supplies Geist; use its system fallback in this isolated card.
  document.documentElement.style.setProperty('--font-geist-sans', 'Arial');

  return await render(
    <NextIntlClientProvider locale="it" messages={messages}>
      <main className="mx-auto w-full max-w-2xl p-4 font-sans">
        <Card>
          <CardHeader>
            <CardTitle>Demo</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateDemoButton conversationId="test-conversation" />
          </CardContent>
        </Card>
      </main>
    </NextIntlClientProvider>,
  );
};

const field = () => page.getByRole('textbox', { name: messages.ConversationDemoCard.label_slug });
const submit = () =>
  page.getByRole('button', { name: messages.ConversationDemoCard.button_generate });

describe('Generate demo form', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });

  it('submits the normalized slug with Enter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    await renderForm();
    await field().fill('  Studio-ROSSI  ');
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => refresh.mock.calls.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/replies/test-conversation/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'studio-rossi' }),
    });
  });

  it('keeps automatic generation when the field is blank', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    await renderForm();
    await submit().click();
    await expect.poll(() => refresh.mock.calls.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ slug: '' }),
      }),
    );
  });

  it.each(['studio rossi', 'api-studio', 'a'.repeat(61)])(
    'rejects invalid input %s without a request',
    async (slug) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await renderForm();
      await field().fill(slug);
      await submit().click();
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent(messages.ConversationDemoCard.error_slug_invalid);
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect.element(field()).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it.each([
    ['slug_taken', messages.ConversationDemoCard.error_slug_taken],
    ['demo_exists', messages.ConversationDemoCard.error_demo_exists],
  ])('shows the conflict %s and keeps the typed slug', async (errorCode, text) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: errorCode }, { status: 409 }),
    );
    await renderForm();
    await field().fill('studio-rossi');
    await submit().click();
    await expect.element(page.getByRole('alert')).toHaveTextContent(text);
    await expect.element(field()).toHaveValue('studio-rossi');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables editing and duplicate submission while building', async () => {
    const pending = Promise.withResolvers<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
    await renderForm();
    await submit().click();
    await expect.element(field()).toBeDisabled();
    await expect
      .element(page.getByRole('button', { name: messages.ConversationDemoCard.building }))
      .toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    pending.resolve(Response.json({}));
    await expect.element(field()).toBeEnabled();
  });

  it('recovers from a network error without losing the slug', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Local simulated failure'));
    await renderForm();
    await field().fill('studio-rossi');
    await submit().click();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(messages.ConversationDemoCard.error_generate);
    await expect.element(field()).toBeEnabled();
    await expect.element(field()).toHaveValue('studio-rossi');
  });

  it.each([
    [1440, 1000],
    [768, 1024],
    [390, 844],
    [320, 740],
  ])('fits the card at %i by %i', async (width, height) => {
    await page.viewport(width, height);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 409 }));
    await renderForm();
    await field().fill('studio-rossi');
    await submit().click();
    await expect.element(page.getByRole('alert')).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const input = field().element().getBoundingClientRect();
    expect(input.left).toBeGreaterThanOrEqual(0);
    expect(input.right).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `../../vitest-test-results/demo-slug-${width}.png` });
  });
});
