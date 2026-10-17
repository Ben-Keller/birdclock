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
  await expect(page.locator('html')).toHaveAttribute(
    'data-fonts-ready',
    'true',
  );
  await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => ({ name: entry.name, bytes: entry.encodedBodySize })),
  );
  expect(
    resources.reduce((sum, resource) => sum + resource.bytes, 0),
  ).toBeLessThan(180000);
  expect(
    await page.evaluate(
      () =>
        performance.getEntriesByType('navigation')[0].encodedBodySize +
        performance
          .getEntriesByType('resource')
          .reduce((sum, r) => sum + r.encodedBodySize, 0),
    ),
  ).toBeLessThan(350000);
  const artwork = resources.filter((resource) =>
    /\/previews\/clock\//.test(resource.name),
  );
  expect(artwork).toHaveLength(0);
  expect(requests.some((url) => /\/previews\/woods\//.test(url))).toBe(false);
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

  expect(
    await page.evaluate(() => {
      const firstFrame =
        performance.getEntriesByName('clock-first-frame')[0].startTime;
      return performance
        .getEntriesByType('resource')
        .filter((entry) => /\/dist\/fonts-|\.woff2$/.test(entry.name))
        .every((entry) => entry.startTime >= firstFrame);
    }),
  ).toBe(true);
  const face = await page.locator('#clock svg').elementHandle();
  await page.locator('#clock [data-hour="8"] .slice-hit').click();
  expect(await face.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  expect(requests.some((url) => /\/dist\/bird-explorer-/.test(url))).toBe(true);
  expect(requests.some((url) => /bird-profiles\.json/.test(url))).toBe(true);
  expect(
    await page.locator('svg [id]').evaluateAll((elements) => {
      const ids = elements.map((element) => element.id);
      return new Set(ids).size === ids.length;
    }),
  ).toBe(true);
  await expect(
    page.locator('.fullscreen-clock .bird-image').first(),
  ).toHaveAttribute('href', /\/previews\/birds\//);
});

for (const source of ['default', 'saved', 'shared']) {
  test(`${source} complete clock appears before the app module arrives`, async ({
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
    let initialFace;
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
      await expect(page.locator('#clock .clock-slice')).toHaveCount(12);
      await expect
        .poll(() =>
          page.evaluate(
            () => performance.getEntriesByName('clock-first-frame').length,
          ),
        )
        .toBe(1);
      await expect(page.locator('#clock')).toBeVisible();
      await expect(page.locator('#clock')).toHaveAttribute('inert');
      await expect(page.locator('#panel')).toBeEmpty();
      initialFace = await page.locator('#clock svg').elementHandle();
      const expected =
        source === 'default'
          ? []
          : config.slices
              .filter(
                (slice) =>
                  !defaultConfig().slices.some(
                    (initial) => initial.bird === slice.bird,
                  ),
              )
              .map((slice) => `${slice.bird}.webp`);
      expect([...requests].sort()).toEqual(expected.sort());
      await expect(page.locator('#clock [data-hour="0"]')).toHaveAttribute(
        'aria-label',
        new RegExp(
          birds.find((bird) => bird.id === config.slices[0].bird).name,
        ),
      );
    } finally {
      release();
    }
    await expect(page.locator('#reset-view-button')).toBeEnabled();
    await expect(page.locator('#clock')).not.toHaveAttribute('inert');
    expect(await initialFace.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    await expect(page.locator('#clock .bird-image').first()).toHaveAttribute(
      'href',
      source === 'default'
        ? /^data:image\/webp;base64,/
        : new RegExp(
            `^(assets/previews/clock/${config.slices[0].bird}.webp|data:image/webp;base64,)`,
          ),
    );
  });
}

test('a returning customized clock paints with image, font, and editor requests blocked', async ({
  page,
}) => {
  const config = defaultConfig();
  config.slices.forEach((slice, i) => {
    slice.bird = birds[i + 24].id;
  });
  await page.addInitScript(
    (config) =>
      localStorage.setItem('woodland-hours.draft.v1', JSON.stringify(config)),
    config,
  );
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            JSON.parse(
              localStorage.getItem('birdclock.clock-artwork.v1') || '{}',
            ).birds || {},
          ).length,
      ),
    )
    .toBe(12);
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/dist/app-*.js', async (route) => {
    await pending;
    await route.continue();
  });
  await page.route('**/assets/**', (route) => route.abort());
  try {
    await page.reload({ waitUntil: 'commit' });
    await expect
      .poll(() =>
        page.evaluate(
          () => performance.getEntriesByName('clock-first-frame').length,
        ),
      )
      .toBe(1);
    await expect(page.locator('#clock')).toBeVisible();
    await expect(page.locator('#clock .bird-image')).toHaveCount(12);
    expect(
      await page
        .locator('#clock image')
        .evaluateAll((images) =>
          images.every((image) =>
            image.getAttribute('href').startsWith('data:'),
          ),
        ),
    ).toBe(true);
    await expect(page.locator('#clock [data-hour="0"]')).toHaveAttribute(
      'aria-label',
      new RegExp(birds[24].name),
    );
    await expect(page.locator('#panel')).toBeEmpty();
    await page.screenshot({ path: 'test-results/clock-before-editor.png' });
  } finally {
    release();
  }
  await expect(page.locator('#reset-view-button')).toBeEnabled();
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
