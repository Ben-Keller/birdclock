import { test, expect } from '@playwright/test';

test('startup stays within its asset budget and defers optional panels and original artwork', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('#clock .clock-slice')).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => ({ name: entry.name, bytes: entry.encodedBodySize })),
  );
  expect(
    resources.reduce((sum, resource) => sum + resource.bytes, 0),
  ).toBeLessThan(450000);
  expect(requests.some((url) => /\/assets\/(birds|woods)\//.test(url))).toBe(
    false,
  );
  expect(
    requests.some((url) =>
      /\.ttf|bird-profiles\.json|\/maps\/|\/dist\/bird-(downloads|explorer)-/.test(
        url,
      ),
    ),
  ).toBe(false);
  expect(requests.filter((url) => /\/dist\/.*\.js$/.test(url))).toHaveLength(4);

  const face = await page.locator('#clock svg').elementHandle();
  await page.locator('#clock [data-hour="8"] .slice-hit').click();
  expect(await face.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  expect(requests.some((url) => /\/dist\/bird-explorer-/.test(url))).toBe(true);
  expect(requests.some((url) => /bird-profiles\.json/.test(url))).toBe(true);
});

test('a failed optional panel offers a working reload while keeping the saved design', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/dist/bird-explorer-*.js', (route) => {
    if (fail) {
      fail = false;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(
    page.getByText('This panel couldn’t load. Reload the studio to try again.'),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    localStorage.getItem('woodland-hours.draft.v1'),
  );
  await page.getByRole('button', { name: 'Reload studio' }).click();
  await expect(page.locator('#reset-view-button')).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem('woodland-hours.draft.v1')),
  ).toBe(draft);
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
});
