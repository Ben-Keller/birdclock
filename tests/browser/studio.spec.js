import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  await page.goto('/');
  await expect(page.locator('#panel details, #panel summary')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Bird size' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Wood grain' })).toBeVisible();
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
  // Large synchronous stdin writes can stall on macOS. Give the independent
  // Python validator a file instead, and always bound its execution time.
  const directory = mkdtempSync(path.join(tmpdir(), 'birdclock-zip-test-'));
  const archivePath = path.join(directory, 'birds.zip');
  writeFileSync(archivePath, bytes);
  try {
    return JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    index = json.loads(archive.read('birds.json'))
    assert all(archive.read(bird['file']) for bird in index['birds'])
    print(json.dumps({'names': archive.namelist(), 'index': index}))
`,
          archivePath,
        ],
        { timeout: 15000 },
      ).toString(),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
    .selectOption('Waterbirds');
  await page
    .getByRole('combobox', { name: 'Region', exact: true })
    .selectOption('North America');
  await expect(page.locator('.bird-card')).toHaveCount(4);
  await page
    .getByRole('combobox', { name: 'On your clock' })
    .selectOption('used');
  await expect(page.locator('.bird-card')).toHaveCount(2);
  await expect(page.locator('.bird-card')).toContainText([
    'Common loon',
    'Wood duck',
  ]);
  await page.getByRole('searchbox', { name: 'Search birds' }).fill('mallard');
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
  await expect(page.locator('#reset-view-button')).toBeEnabled();
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
  await expect(page.locator('#reset-view-button')).toBeEnabled();
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
  await expect(page.locator('#reset-view-button')).toBeEnabled();
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
  await expect(page.locator('#reset-view-button')).toBeEnabled();
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

async function birdPoint(page, hour) {
  const box = await page
    .locator(`#clock [data-hour="${hour - 1}"] .bird-image`)
    .boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clockDraft(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('woodland-hours.draft.v1')),
  );
}

test('reset view preserves the customized design, uploaded birds and edit history', async ({
  page,
}) => {
  const original = await clockDraft(page);
  const imported = structuredClone(original);
  imported.customBirds.push({
    id: 'custom-reset-test',
    name: 'My bird',
    scientificName: 'Your illustration',
    region: 'Custom',
    group: 'Custom',
    asset: `data:image/webp;base64,${(await fs.readFile('assets/birds/american-goldfinch.webp')).toString('base64')}`,
  });
  Object.assign(imported.slices[2], {
    bird: 'custom-reset-test',
    scale: 1.4,
    rotation: 25,
    x: 15,
    y: -20,
    flip: true,
  });
  imported.slices[0].wood = 'cherry';
  Object.assign(imported.face, {
    shape: 'circle',
    numbers: 'roman',
    grain: 0.8,
    background: '#e8dfcc',
  });
  await page.locator('#json-input').setInputFiles({
    name: 'customized-clock.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My bird');
  const customized = await clockDraft(page);
  await page.locator('#clock-view').focus();
  await page.locator('#clock-view').press('ArrowRight');
  await page.locator('#clock-view').press('ArrowUp');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const restored = await clockDraft(page);
  expect(restored).toEqual(customized);
  expect(
    await page
      .locator('#clock')
      .evaluate((el) => [
        el.style.getPropertyValue('--view-pitch'),
        el.style.getPropertyValue('--view-yaw'),
      ]),
  ).toEqual(['0deg', '0deg']);
  await expect(
    page.getByRole('button', { name: 'Reset view', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My bird');
  await page.getByRole('button', { name: 'Undo last change' }).click();
  expect(await clockDraft(page)).toEqual(original);
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('Osprey');
  await page.getByRole('button', { name: 'Redo last change' }).click();
  expect(await clockDraft(page)).toEqual(restored);
  await page.reload();
  await expect(page.locator('#reset-view-button')).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('My bird');
  expect(await clockDraft(page)).toEqual(restored);
  await page.getByRole('button', { name: 'Change bird for hour 3' }).click();
  await expect(
    page.getByRole('button', { name: 'Choose My bird', exact: true }),
  ).toBeVisible();
});

test('dragging birds swaps their placement, preserves woods, and supports undo and reload', async ({
  page,
}) => {
  await page
    .getByRole('slider', { name: 'Bird size', exact: true })
    .press('End');
  await page.getByRole('button', { name: /Flip bird/ }).click();
  await page
    .getByRole('slider', { name: 'Rotate bird', exact: true })
    .press('ArrowRight');
  await page
    .getByRole('slider', { name: 'Horizontal', exact: true })
    .press('ArrowRight');
  await page
    .getByRole('slider', { name: 'Vertical', exact: true })
    .press('ArrowLeft');
  const before = await clockDraft(page);
  const source = await birdPoint(page, 3),
    destination = await birdPoint(page, 9);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await expect(page.locator('.bird-drag-preview')).toContainText(
    'Swap with hour 9',
  );
  await expect(page.locator('#clock [data-hour="8"]')).toHaveClass(
    /drop-target/,
  );
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.screenshot({ path: 'test-results/bird-drag-desktop.png' });
  await page.mouse.up();
  const after = await clockDraft(page);
  expect(after.slices[8]).toMatchObject({
    bird: 'osprey',
    scale: 1.5,
    rotation: 5,
    x: 1,
    y: -1,
    flip: true,
  });
  expect(after.slices[2]).toMatchObject({
    bird: 'common-loon',
    scale: 1,
    rotation: 0,
    x: 0,
    y: 0,
    flip: false,
  });
  expect(after.slices.map((s) => s.wood)).toEqual(
    before.slices.map((s) => s.wood),
  );
  expect(after.slices.map((s) => s.grain)).toEqual(
    before.slices.map((s) => s.grain),
  );
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 9' }),
  ).toContainText('Osprey');
  await expect(page.locator('.bird-drag-preview')).toBeHidden();
  await expect(page.locator('.drag-source, .drop-target')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo last change' }).click();
  expect(await clockDraft(page)).toEqual(before);
  await page.getByRole('button', { name: 'Redo last change' }).click();
  expect(await clockDraft(page)).toEqual(after);
  await page.reload();
  await expect(page.locator('#reset-view-button')).toBeEnabled();
  expect(await clockDraft(page)).toEqual(after);
});

test('cancelled and same-hour drags leave the design intact, and clicks still select', async ({
  page,
}) => {
  const before = await clockDraft(page);
  const source = await birdPoint(page, 3),
    destination = await birdPoint(page, 9);
  for (const end of [
    { x: 8, y: 8 },
    { x: source.x + 15, y: source.y },
    destination,
  ]) {
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    if (end === destination) await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await clockDraft(page)).toEqual(before);
    await expect(page.locator('.bird-drag-preview')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Undo last change' }),
    ).toBeDisabled();
  }
  await page.mouse.click(destination.x, destination.y);
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 9' }),
  ).toBeVisible();
  expect(await clockDraft(page)).toEqual(before);
});

test('keyboard swapping wraps between twelve and one and is undoable', async ({
  page,
}) => {
  const before = await clockDraft(page);
  await page.locator('#clock [data-hour="2"]').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  const after = await clockDraft(page);
  expect(after.slices[0].bird).toBe('great-horned-owl');
  expect(after.slices[11].bird).toBe('northern-flicker');
  expect(after.slices.map((s) => s.wood)).toEqual(
    before.slices.map((s) => s.wood),
  );
  await expect(page.locator('#clock [data-hour="0"]')).toBeFocused();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  expect(await clockDraft(page)).toEqual(before);
});

test.describe('touch bird dragging', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test('touch drags swap birds on a round clock and cancellation is harmless', async ({
    page,
  }) => {
    await page
      .getByRole('combobox', { name: 'Clock shape', exact: true })
      .selectOption('circle');
    await page.locator('#clock').scrollIntoViewIfNeeded();
    const before = await clockDraft(page);
    const source = await birdPoint(page, 3),
      destination = await birdPoint(page, 9);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, point) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{ ...point, id: 1 }] : [],
      });
    await touch('touchStart', source);
    await touch('touchMove', destination);
    await expect(page.locator('.bird-drag-preview')).toContainText(
      'Swap with hour 9',
    );
    await page.screenshot({ path: 'test-results/bird-drag-touch.png' });
    await touch('touchEnd');
    const after = await clockDraft(page);
    expect(after.slices[8].bird).toBe('osprey');
    expect(after.slices[2].bird).toBe('common-loon');
    expect(after.slices.map((s) => s.wood)).toEqual(
      before.slices.map((s) => s.wood),
    );
    await touch('touchStart', destination);
    await touch('touchMove', source);
    await touch('touchCancel');
    expect(await clockDraft(page)).toEqual(after);
    await expect(page.locator('.bird-drag-preview')).toBeHidden();
    await page.getByRole('button', { name: 'Undo last change' }).click();
    expect(await clockDraft(page)).toEqual(before);
    await cdp.detach();
  });
});

test('clock tooltips support hover, keyboard navigation and dismissal', async ({
  page,
}) => {
  const tooltip = page.getByRole('tooltip');
  const draft = await page.evaluate(() =>
    localStorage.getItem('woodland-hours.draft.v1'),
  );
  await page.locator('#clock [data-hour="8"] .slice-hit').hover();
  await expect(tooltip).toHaveText('9 o’clock: Common loon, Cherry');
  await expect(page.locator('#clock [data-hour="8"]')).toHaveAttribute(
    'aria-describedby',
    'clock-tooltip',
  );
  await tooltip.hover();
  // Allow the pointer-leave grace period to elapse while hovering the tooltip.
  await page.waitForTimeout(180);
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.locator('#clock [data-hour="9"] .slice-hit').hover();
  await expect(tooltip).toHaveText('10 o’clock: Bald eagle, Maple');
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  await page.locator('#clock [data-hour="2"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toHaveText('4 o’clock: Anna’s hummingbird, Cherry');
  await expect(page.locator('#clock [data-hour="3"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(page.locator('#clock [data-hour="3"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('5 o’clock: Wood duck');
  expect(
    await page.evaluate(() => localStorage.getItem('woodland-hours.draft.v1')),
  ).toBe(draft);

  await page
    .getByRole('button', { name: 'Choose Mahogany for hour 5' })
    .click();
  await page.locator('#clock [data-hour="4"] .slice-hit').hover();
  await expect(tooltip).toHaveText('5 o’clock: Wood duck, Mahogany');
  await page.getByRole('button', { name: 'Save & share' }).click();
  await expect(tooltip).toBeHidden();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#clock').scrollIntoViewIfNeeded();
  await page.locator('#clock [data-hour="11"] .slice-hit').hover();
  await expect(tooltip).toContainText('12 o’clock');
  const bounds = await tooltip.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.y).toBeGreaterThanOrEqual(12);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(378);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(832);
  await page.screenshot({ path: 'test-results/clock-tooltip-mobile.png' });
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
