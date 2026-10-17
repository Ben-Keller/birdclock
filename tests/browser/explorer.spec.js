import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const catalogue = JSON.parse(await fs.readFile('assets/birds.json', 'utf8'));
const draft = 'woodland-hours.draft.v1';
async function open(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
}

test('fullscreen slices and keyboard open profiles without changing the design or undo history', async ({
  page,
}) => {
  await open(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), draft);
  const slice = page.locator('.fullscreen-clock [data-hour="8"]');
  await slice.focus();
  await slice.press('Enter');
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  await expect(page.locator('#bird-profile-title')).toBeFocused();
  await expect(page.locator('.bird-map svg')).toHaveAttribute(
    'aria-label',
    /Common loon/,
  );
  const regional = await page.locator('.bird-map svg').getAttribute('viewBox');
  await page.getByRole('button', { name: 'World', exact: true }).click();
  expect(await page.locator('.bird-map svg').getAttribute('viewBox')).not.toBe(
    regional,
  );
  await expect(page.locator('.occurrence-layer')).toBeVisible();
  await page.getByRole('button', { name: 'Regional', exact: true }).click();
  await expect(page.locator('.occurrence-layer')).not.toBeVisible();
  await expect(
    page.locator('.regional-occurrences image').first(),
  ).toBeVisible();
  await slice.focus();
  await slice.press('ArrowRight');
  await expect(page.locator('#bird-profile-title')).toHaveText('Bald eagle');
  await expect(page.locator('.fullscreen-clock [data-hour="9"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View clock fullscreen' }),
  ).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), draft)).toBe(
    before,
  );
  await expect(page.locator('#undo-button')).toBeDisabled();
});

test('all 48 researched birds render with local map assets and source links', async ({
  page,
}) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await open(page);
  for (const bird of catalogue) {
    await page.locator('#explorer-bird').selectOption(bird.id);
    await expect(page.locator('#bird-profile-title')).toHaveText(bird.name);
    await expect(page.locator('.occurrence-layer')).toHaveAttribute(
      'href',
      `assets/maps/${bird.id}.png`,
    );
    await expect(page.locator('.profile-story p')).toHaveCount(2);
    await expect(page.locator('.profile-sources a')).not.toHaveCount(0);
  }
  await page.locator('#explorer-bird').selectOption('african-grey-parrot');
  await expect(page.locator('.conservation-badge')).toHaveText('Endangered');
  await expect(page.locator('.fullscreen-clock .selected')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('profile loading failures can retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/assets/bird-profiles.json', async (route) => {
    if (++requests === 1)
      return route.fulfill({ status: 503, body: 'unavailable' });
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & share' }).click();
  await expect(
    page.getByRole('button', { name: /Download bird files/ }),
  ).toBeVisible();
  await expect(page.locator('#bird-profile')).toHaveCount(0);
});

test('a profile request finishing after close cannot replace another dialog', async ({
  page,
}) => {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route('**/assets/bird-profiles.json', async (route) => {
    await held;
    await route.fulfill({
      contentType: 'application/json',
      body: await fs.readFile('assets/bird-profiles.json', 'utf8'),
    });
  });
  await page.goto('/');
  const pending = page.waitForRequest('**/assets/bird-profiles.json');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await pending;
  await expect(page.getByText('Opening the field guide…')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & share' }).click();
  const finished = page.waitForResponse('**/assets/bird-profiles.json');
  release();
  await finished;
  await expect(
    page.getByRole('button', { name: /Download bird files/ }),
  ).toBeVisible();
  await expect(page.locator('#bird-profile')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
});

test('mobile explorer has no horizontal overflow and a slice opens a readable profile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  // Pick a point well inside the ninth slice, clear of the clock hands.
  const svg = await page.locator('.fullscreen-clock svg').boundingBox();
  await page.mouse.click(svg.x + svg.width * 0.18, svg.y + svg.height * 0.5);
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  await expect(page.locator('#bird-profile-title')).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Close dialog' }),
  ).toBeInViewport();
  expect(
    await page
      .locator('.bird-explorer')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: '/tmp/birdclock-profile-mobile.png' });
});

test('desktop field guide layout and maps stay inside the full-height dialog', async ({
  page,
}) => {
  await open(page);
  await page.screenshot({ path: '/tmp/birdclock-explorer-desktop.png' });
  await page.locator('.bird-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/birdclock-explorer-map.png' });
  await page.locator('#explorer-bird').selectOption('kokako');
  await page.locator('.bird-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/birdclock-explorer-nz-map.png' });
  const box = await page.locator('#modal').boundingBox();
  expect(box.height).toBeLessThanOrEqual(1000);
  expect(
    await page
      .locator('#modal')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
