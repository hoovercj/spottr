import { test, expect } from '@playwright/test';

test('home screen renders the app title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spottr' })).toBeVisible();
});

test('start a workout, log a set, complete it', async ({ page }) => {
  // Fresh IDB so the seed runs and we land on a known PPL routine.
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases?.();
    if (dbs) {
      await Promise.all(
        dbs.map(
          (d) =>
            new Promise<void>((resolve) => {
              if (!d.name) return resolve();
              const req = indexedDB.deleteDatabase(d.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      );
    }
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Spottr' })).toBeVisible();

  // First "Start"/"Start workout" button surfaces on today's card if today
  // isn't a rest day; otherwise the routine-week list always has at least
  // one non-rest day with its own small "Start" button.
  const startButton = page.getByRole('button', { name: /^start( workout)?$/i }).first();
  await expect(startButton).toBeEnabled();
  await startButton.click();

  // Either today's card starts the session inline (lands on /workout) or a
  // non-today day opens a preview drawer with its own "Start workout" footer
  // button. Cover both.
  if (
    await page
      .getByRole('button', { name: /^start workout$/i })
      .first()
      .isVisible()
  ) {
    await page
      .getByRole('button', { name: /^start workout$/i })
      .first()
      .click();
  }
  await page.waitForURL(/\/workout(?:$|\?)/, { timeout: 10_000 });

  // Tap the first lift in the session to navigate into its logging screen.
  await page
    .getByRole('link')
    .filter({ hasText: /.+ sets$/ })
    .first()
    .click();
  await page.waitForURL(/\/lift\//, { timeout: 5_000 });

  // Tap the first set's "Log set" checkbox (the SetTable's per-row check).
  const logCheckbox = page.getByRole('checkbox', { name: /^Log set 1/i });
  await expect(logCheckbox).toBeVisible();
  await logCheckbox.check();
  await expect(logCheckbox).toBeChecked();

  // Back to the workout overview, then complete.
  await page
    .getByRole('link', { name: /workout/i })
    .first()
    .click();
  await page.waitForURL(/\/workout(?:$|\?)/, { timeout: 5_000 });
  const completeButton = page.getByRole('button', { name: /^complete$/i });
  await expect(completeButton).toBeEnabled();
  await completeButton.click();

  // Land back on home; the previously-active day should no longer show
  // "Start workout" because either it's completed today, or we're back to
  // the picker for tomorrow.
  await page.waitForURL(/^[^/]*\/\/[^/]+\/spottr\/$/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Spottr' })).toBeVisible();
});
