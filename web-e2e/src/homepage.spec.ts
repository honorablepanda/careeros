import { test, expect } from '@playwright/test';

test('homepage loads and shows welcome text', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page.getByText(/welcome/i)).toBeVisible();
});
