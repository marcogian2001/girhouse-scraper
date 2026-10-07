import { NextIntlClientProvider } from 'next-intl';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import type { CampaignSettingsInput } from '@/validations/CampaignValidation';
import { CampaignSettingsValidation } from '@/validations/CampaignValidation';
import { CampaignSettingsForm } from './CampaignSettingsForm';

const BudgetForm = (props: { save: (settings: CampaignSettingsInput) => void }) => {
  const form = useForm<CampaignSettingsInput>({
    defaultValues: {
      name: 'Test',
      emailCount: 1,
      delaysDays: [0],
      processor: 'core',
      copywritingModel: 'claude-opus-5',
      copywritingEffort: 'high',
      copywritingBatch: true,
      knowledgeAssetIds: [],
    },
  });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <form
        onSubmit={form.handleSubmit((settings) => {
          props.save(CampaignSettingsValidation.parse(settings));
        })}
      >
        <CampaignSettingsForm
          form={form}
          knowledgeAssets={[]}
          contactCount={1}
          costBasis={{
            fromHistory: false,
            tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
          }}
        />
        <button type="submit">Submit</button>
      </form>
    </NextIntlClientProvider>
  );
};

describe('Campaign budget field', () => {
  it('submits an untouched optional budget without invalid numbers', async () => {
    const save = vi.fn<(settings: CampaignSettingsInput) => void>();
    await render(<BudgetForm save={save} />);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save.mock.calls[0]?.[0].budgetUsd).toBeNull();
  });

  it('submits a numeric budget and allows clearing it', async () => {
    const save = vi.fn<(settings: CampaignSettingsInput) => void>();
    await render(<BudgetForm save={save} />);
    const field = page.getByRole('spinbutton', {
      name: 'Campaign operating budget (USD, optional)',
    });
    await field.fill('25.50');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save.mock.calls[0]?.[0].budgetUsd).toBe(25.5);
    await field.fill('');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => save.mock.calls.length).toBe(2);
    expect(save.mock.calls[1]?.[0].budgetUsd).toBeNull();
  });
});
