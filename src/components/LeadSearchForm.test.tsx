import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import messages from '@/locales/en.json';
import { LeadSearchValidation } from '@/validations/LeadSearchValidation';
import { LeadSearchForm } from './LeadSearchForm';

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
vi.mock(import('@/components/LocationCombobox'), () => ({
  LocationCombobox: (props: {
    id: string;
    onValueChange: (value: { label: string; placeId: string }) => void;
  }) => (
    <input
      id={props.id}
      onChange={(event) => {
        props.onValueChange({ label: event.target.value, placeId: 'area' });
      }}
    />
  ),
}));

const submitSearch = async () => {
  await page.getByRole('textbox', { name: 'Search name', exact: true }).fill('Test');
  const terms = page.getByRole('textbox', { name: 'What to search for' });
  await terms.fill('beauty');
  await userEvent.keyboard('{Enter}');
  await page.getByRole('textbox', { name: 'Where', exact: true }).fill('Test');
  await page.getByRole('button', { name: 'Start the search' }).click();
};

const mount = async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'search' }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ id: 'search' }, { status: 201 }));
  vi.stubGlobal('fetch', request);
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LeadSearchForm
        pricing={{
          placeMicros: 0,
          emailMicros: 0,
          verificationMicros: 0,
          runMicros: { lite: 0, base: 0, core: 0, pro: 0 },
        }}
      />
    </NextIntlClientProvider>,
  );
  return request;
};

const submittedCategories = (body: BodyInit | null | undefined) => {
  if (typeof body !== 'string') {
    throw new TypeError('Missing request body');
  }
  return LeadSearchValidation.parse(JSON.parse(body)).allowedCategories;
};

const categories = () => page.getByRole('textbox', { name: 'Allowed Maps categories (optional)' });

describe('Lead search category field', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits an untouched optional filter as an empty list', async () => {
    const request = await mount();
    await submitSearch();
    await expect.poll(() => request.mock.calls.length).toBe(1);
    expect(submittedCategories(request.mock.calls[0]?.[1]?.body)).toStrictEqual([]);
  });

  it('submits comma and newline categories and allows clearing the filter', async () => {
    const request = await mount();
    await categories().fill(' Centro   ESTETICO, Estetista\ncentro estetico');
    await submitSearch();
    await expect.poll(() => request.mock.calls.length).toBe(1);
    expect(submittedCategories(request.mock.calls[0]?.[1]?.body)).toStrictEqual([
      'centro estetico',
      'estetista',
    ]);
    await categories().fill('');
    await page.getByRole('button', { name: 'Start the search' }).click();
    await expect.poll(() => request.mock.calls.length).toBe(2);
    expect(submittedCategories(request.mock.calls[1]?.[1]?.body)).toStrictEqual([]);
  });
});
