import { expect, test } from '@playwright/test';

test.describe('I18n', () => {
  test.describe('Language switching', () => {
    test('serves the sign-in page in English by default', async ({ page }) => {
      await page.goto('/sign-in');

      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
    });

    test('switches the sign-in page to Italian from the URL', async ({ page }) => {
      await page.goto('/it/sign-in');

      await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
    });

    test('switches the sign-up page to Italian from the URL', async ({ page }) => {
      await page.goto('/sign-up');

      await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();

      await page.goto('/it/sign-up');

      await expect(page.getByRole('heading', { name: 'Crea un account' })).toBeVisible();
    });
  });
});
