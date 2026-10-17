import { test, expect } from '@playwright/test';
import { defaultConfig, encodeConfig } from '../../src/model.js';
import birds from '../../assets/birds.json' with { type: 'json' };

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
  ).toBeLessThan(280000);
  const artwork = resources.filter((resource) =>
    /\/previews\/clock\//.test(resource.name),
  );
  expect(artwork).toHaveLength(12);
  expect(
    artwork.reduce((sum, resource) => sum + resource.bytes, 0),
  ).toBeLessThan(60000);
  expect(
    artwork.every((resource) => resource.bytes > 0 && resource.bytes < 7000),
  ).toBe(true);
  expect(
    requests.some((url) => /\/previews\/birds(?:-large)?\//.test(url)),
  ).toBe(false);
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
  await expect(
    page.locator('.fullscreen-clock .bird-image').first(),
  ).toHaveAttribute('href', /\/previews\/birds\//);
});

for (const source of ['default', 'saved', 'shared']) {
  test(`${source} clock thumbnails start before the app module arrives`, async ({
    page,
  }) => {
    const config = defaultConfig();
    if (source !== 'default')
      config.slices.forEach((slice, i) => {
        slice.bird = birds[i + 24].id;
      });
    if (source === 'saved')
      await page.addInitScript((config) => {
        localStorage.setItem('woodland-hours.draft.v1', JSON.stringify(config));
      }, config);
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/dist/app-*.js', async (route) => {
      await pending;
      await route.continue();
    });
    const requests = new Set();
    page.on('request', (request) => {
      if (/\/previews\/clock\//.test(request.url()))
        requests.add(request.url().split('/').pop());
    });
    try {
      await page.goto(
        source === 'shared' ? `/#design=${encodeConfig(config)}` : '/',
        { waitUntil: 'commit' },
      );
      await expect.poll(() => requests.size).toBe(12);
      expect([...requests].sort()).toEqual(
        config.slices.map((slice) => `${slice.bird}.webp`).sort(),
      );
      await expect(page.locator('#clock .clock-slice')).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.locator('#clock .clock-slice')).toHaveCount(12);
    await expect(page.locator('#clock .bird-image').first()).toHaveAttribute(
      'href',
      `assets/previews/clock/${config.slices[0].bird}.webp`,
    );
  });
}

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
