import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function openBirdFiles(page, scope = 'single') {
  await page.getByRole('button', { name: 'Save & share' }).click();
  await page.getByRole('button', { name: /Download bird files/ }).click();
  if (scope !== 'clock')
    await page.locator('#download-scope').selectOption(scope);
}

async function getDownload(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return {
    name: file.suggestedFilename(),
    bytes: await fs.readFile(await file.path()),
  };
}

async function imageInfo(page, bytes, mime) {
  return page.evaluate(
    async ({ bytes, mime }) => {
      const binary = Uint8Array.from(atob(bytes), (value) =>
        value.charCodeAt(0),
      );
      const url = URL.createObjectURL(new Blob([binary], { type: mime }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          corner: [...context.getImageData(0, 0, 1, 1).data],
          visible: context
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value, index) => index % 4 === 3 && value > 0),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { bytes: bytes.toString('base64'), mime },
  );
}

function readZip(bytes) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import io, json, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    assert archive.testzip() is None
    index = json.loads(archive.read('birds.json'))
    assert all(archive.read(bird['file']) for bird in index['birds'])
    print(json.dumps({'names': archive.namelist(), 'index': index}))
`,
      ],
      { input: bytes },
    ).toString(),
  );
}

for (const [format, extension, mime] of [
  ['PNG', 'png', 'image/png'],
  ['JPEG', 'jpg', 'image/jpeg'],
  ['WebP', 'webp', 'image/webp'],
  ['SVG', 'svg', 'image/svg+xml'],
]) {
  test(`downloads an actual ${format} with original size and correct background`, async ({
    page,
  }) => {
    await openBirdFiles(page);
    await page.getByRole('radio', { name: new RegExp(`^${format}`) }).check();
    const { name, bytes } = await getDownload(
      page,
      page.getByRole('button', { name: `Download ${format}`, exact: true }),
    );
    expect(name).toBe(`osprey.${extension}`);
    const dimensions = await page
      .locator('#download-preview img')
      .evaluate((image) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
    const info = await imageInfo(page, bytes, mime);
    expect({ width: info.width, height: info.height }).toEqual(dimensions);
    expect(info.visible).toBe(true);
    if (format === 'JPEG') {
      expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
      expect(info.corner).toEqual([255, 255, 255, 255]);
    } else {
      expect(info.corner[3]).toBe(0);
    }
    if (format === 'PNG') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    if (format === 'WebP')
      expect(bytes).toEqual(await fs.readFile('assets/birds/osprey.webp'));
    if (format === 'SVG') {
      expect(bytes.toString()).toContain('not vector paths');
      expect(bytes.toString()).toContain('href="data:image/png;base64,');
    }
    await expect(
      page.getByRole('status').filter({ hasText: 'Your download is ready' }),
    ).toBeVisible();
  });
}

test('clock and entire-library ZIPs are valid and include the correct species and hours', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Save & share' }).click();
  await page.getByRole('button', { name: /Download bird files/ }).click();
  await expect(page.locator('#download-scope')).toHaveValue('clock');
  const clock = await getDownload(
    page,
    page.getByRole('button', { name: 'Download ZIP' }),
  );
  const zip = readZip(clock.bytes);
  expect(zip.index.birds).toHaveLength(12);
  expect(zip.names).toHaveLength(14);
  expect(zip.index.birds.find((bird) => bird.id === 'osprey').hours).toEqual([
    3,
  ]);
  expect(
    zip.index.birds.find((bird) => bird.id === 'common-loon').hours,
  ).toEqual([9]);
  await page.locator('#download-scope').selectOption('library');
  await page.getByRole('radio', { name: /^WebP/ }).check();
  const library = await getDownload(
    page,
    page.getByRole('button', { name: 'Download ZIP' }),
  );
  expect(library.name).toBe('woodland-hours-library-webp.zip');
  expect(readZip(library.bytes).index.birds).toHaveLength(48);
});

test('combined library filters and normalized search preserve the clock when downloading', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change bird for hour 3' }).click();
  await page
    .getByRole('combobox', { name: 'Bird group' })
    .selectOption('Songbirds');
  await page
    .getByRole('combobox', { name: 'Region', exact: true })
    .selectOption('New Zealand');
  await expect(page.locator('.bird-card')).toHaveCount(3);
  await page
    .getByRole('combobox', { name: 'On your clock' })
    .selectOption('used');
  await expect(page.locator('.bird-card')).toHaveCount(1);
  await expect(page.locator('.bird-card')).toContainText(
    'New Zealand bellbird',
  );
  await page.getByRole('searchbox', { name: 'Search birds' }).fill('tui');
  await expect(page.locator('.bird-card')).toHaveCount(0);
  await page
    .locator('.empty-state')
    .getByRole('button', { name: 'Clear filters' })
    .click();
  await expect(page.locator('.bird-card')).toHaveCount(48);
  await expect(
    page.getByRole('searchbox', { name: 'Search birds' }),
  ).toBeFocused();
  await page
    .getByRole('combobox', { name: 'Bird group' })
    .selectOption('Parrots');
  await page
    .getByRole('combobox', { name: 'Region', exact: true })
    .selectOption('Africa');
  await page
    .getByRole('combobox', { name: 'On your clock' })
    .selectOption('unused');
  await expect(page.locator('.bird-card')).toHaveCount(1);
  await expect(page.locator('.bird-card')).toContainText('African grey parrot');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page
    .getByRole('searchbox', { name: 'Search birds' })
    .fill('  annas hummingbird  ');
  await expect(page.locator('.bird-card')).toHaveCount(1);
  await expect(page.locator('.bird-card')).toContainText('Anna’s hummingbird');
  await page.getByRole('searchbox', { name: 'Search birds' }).fill('Kokako');
  await expect(page.locator('.bird-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openBirdFiles(page);
  await page.locator('#download-bird').selectOption('kokako');
  await expect(page.locator('#download-bird')).toHaveValue('kokako');
  await getDownload(
    page,
    page.getByRole('button', { name: 'Download PNG', exact: true }),
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('Osprey');
  await expect(
    page.getByRole('button', { name: 'Save & share' }),
  ).toBeFocused();
});

test('an image network failure has a useful message and can be retried', async ({
  page,
}) => {
  await openBirdFiles(page);
  await page.route('**/assets/birds/osprey.webp', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await expect(page.locator('#download-progress')).toContainText(
    'Please try again',
  );
  await expect(
    page.getByRole('button', { name: 'Download PNG', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/assets/birds/osprey.webp');
  await getDownload(
    page,
    page.getByRole('button', { name: 'Download PNG', exact: true }),
  );
});

test('uploaded rectangular artwork downloads and travels in a JSON backup', async ({
  page,
}) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#884422';
    context.fillRect(10, 10, 20, 10);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#bird-input').setInputFiles({
    name: 'My custom bird.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My custom bird');
  await page.getByRole('button', { name: 'Change bird for hour 3' }).click();
  await page
    .getByRole('combobox', { name: 'Bird group' })
    .selectOption('Custom');
  await page
    .getByRole('combobox', { name: 'On your clock' })
    .selectOption('used');
  await expect(page.locator('.bird-card')).toHaveCount(1);
  await expect(page.locator('.bird-card')).toContainText('My custom bird');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openBirdFiles(page);
  const bird = await getDownload(
    page,
    page.getByRole('button', { name: 'Download PNG', exact: true }),
  );
  const info = await imageInfo(page, bird.bytes, 'image/png');
  expect(info.width).toBe(64);
  expect(info.height).toBe(32);
  expect(info.corner[3]).toBe(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save & share' }).click();
  const backup = await getDownload(
    page,
    page.getByRole('button', { name: /Download configuration/ }),
  );
  expect(JSON.parse(backup.bytes).customBirds).toHaveLength(1);
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await page.locator('#confirm-action').click();
  await page.locator('#json-input').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: backup.bytes,
  });
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My custom bird');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My custom bird');
});

test('wood changes support undo and bird swaps recover on refresh', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Choose Mahogany for hour 3' })
    .click();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(
    page.getByRole('button', { name: 'Choose Maple for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Redo last change' }).click();
  await expect(
    page.getByRole('button', { name: 'Choose Mahogany for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Change bird for hour 3' }).click();
  await page
    .getByRole('button', { name: 'Choose Common loon', exact: true })
    .click();
  await expect(page.locator('#clock [data-hour="8"]')).toHaveAttribute(
    'aria-label',
    /Osprey/,
  );
  await page.reload();
  await expect(page.locator('#clock [data-hour="8"]')).toHaveAttribute(
    'aria-label',
    /Osprey/,
  );
  await expect(
    page.getByRole('button', { name: 'Choose Mahogany for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('clock PNG includes the rendered design at 2400 px', async ({ page }) => {
  await page.getByRole('button', { name: 'Save & share' }).click();
  await page.screenshot({ path: 'test-results/desktop-exports.png' });
  const clock = await getDownload(
    page,
    page.getByRole('button', { name: /Download clock image/ }),
  );
  const info = await imageInfo(page, clock.bytes, 'image/png');
  expect(info.width).toBe(2400);
  expect(info.height).toBe(2400);
  expect(info.visible).toBe(true);
});

test('opening a shared link keeps the previous draft available through undo', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Choose Mahogany for hour 3' })
    .click();
  const shared = await page.evaluate(async () => {
    const { defaultConfig, encodeConfig } = await import('/src/model.js');
    const config = defaultConfig();
    config.name = 'Shared birds';
    return encodeConfig(config);
  });
  await page.goto('about:blank');
  await page.goto(`/#design=${shared}`);
  await expect(
    page.getByRole('button', { name: 'Choose Maple for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Undo last change' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(
    page.getByRole('button', { name: 'Choose Mahogany for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Choose Mahogany for hour 3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('woodland-hours.saved.v1')),
  ).toBeNull();
});

test('mobile editor, bird library and download panel fit without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  await noOverflow();
  await page.screenshot({
    path: 'test-results/mobile-editor.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Change bird for hour 3' }).click();
  await noOverflow();
  await page.screenshot({ path: 'test-results/mobile-library.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openBirdFiles(page);
  await noOverflow();
  await page
    .getByRole('button', { name: 'Download PNG', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-downloads.png' });
  await getDownload(
    page,
    page.getByRole('button', { name: 'Download PNG', exact: true }),
  );
  await expect(
    page.getByRole('button', { name: 'Close dialog' }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await noOverflow();
});

test('desktop preview, dialog keyboard focus and fullscreen live hands work together', async ({
  page,
}) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.querySelectorAll('img')].map((image) => image.decode()),
    );
  });
  await page.screenshot({
    path: 'test-results/desktop-editor.png',
    fullPage: true,
  });
  await openBirdFiles(page, 'clock');
  await expect(
    page.getByRole('heading', { name: 'A little bird to take with you.' }),
  ).toBeFocused();
  await page.screenshot({ path: 'test-results/desktop-downloads.png' });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Save & share' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  const hand = page.locator('.fullscreen-clock .clock-hands path').nth(1);
  const before = await hand.getAttribute('transform');
  await expect.poll(() => hand.getAttribute('transform')).not.toBe(before);
});

test('closing the download dialog cancels the pending bird export', async ({
  page,
}) => {
  const downloads = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await openBirdFiles(page);
  let releaseNetwork;
  const networkGate = new Promise((resolve) => {
    releaseNetwork = resolve;
  });
  await page.route('**/assets/birds/osprey.webp', async (route) => {
    await networkGate;
    await route.fulfill({
      path: 'assets/birds/osprey.webp',
      contentType: 'image/webp',
    });
  });
  await page.evaluate(() => {
    window.pendingDownloadForm = document.querySelector('#bird-download-form');
  });
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await expect(page.locator('#bird-download-form')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.keyboard.press('Escape');
  releaseNetwork();
  // The detached form loses aria-busy in the export's finally block.
  await expect
    .poll(() =>
      page.evaluate(() => window.pendingDownloadForm.hasAttribute('aria-busy')),
    )
    .toBe(false);
  expect(downloads).toEqual([]);
});
