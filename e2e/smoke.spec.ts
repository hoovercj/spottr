import { test, expect } from '@playwright/test';

test('home screen renders the app title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spottr' })).toBeVisible();
});
