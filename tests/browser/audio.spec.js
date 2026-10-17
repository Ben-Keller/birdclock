import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const manifest = JSON.parse(
  await fs.readFile('assets/bird-audio.json', 'utf8'),
);
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  // Track real media elements without replacing browser playback behavior.
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__players = [];
    window.Audio = function (...args) {
      const player = new NativeAudio(...args);
      window.__players.push(player);
      return player;
    };
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test('recordings load only on play and support real pause, resume, progress and credits', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  const player = page.locator('#panel .bird-audio');
  await expect(
    player.getByRole('button', { name: 'Play Osprey recording' }),
  ).toBeVisible();
  expect(
    requests.filter((url) => /\/calls\/|bird-audio\.json/.test(url)),
  ).toEqual([]);
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
  await player.getByRole('button').click();
  await expect(
    player.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__players[0].currentTime))
    .toBeGreaterThan(0);
  await expect(player.locator('.audio-credit')).toContainText(
    'Lawrence Shove / British Library',
  );
  await expect(
    player.getByRole('link', { name: 'CC BY-SA 4.0' }),
  ).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0');
  await expect(player.getByRole('progressbar')).toBeVisible();
  await player.getByRole('button').click();
  await expect(
    player.getByRole('button', { name: 'Resume Osprey recording' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__players[0].paused)).toBe(true);
  const pausedAt = await page.evaluate(() => window.__players[0].currentTime);
  await player.getByRole('button').click();
  await expect(
    player.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__players[0].currentTime))
    .toBeGreaterThan(pausedAt);
  expect(await page.evaluate(() => window.__players.length)).toBe(1);
  expect(requests.filter((url) => /\/calls\/.*\.mp3/.test(url))).toHaveLength(
    1,
  );
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(
    true,
  );
  await page.evaluate(() => {
    const p = window.__players[0];
    p.playbackRate = 16;
  });
  await expect(
    player.getByRole('button', { name: 'Play Osprey recording' }),
  ).toBeVisible();
  await expect(player.getByRole('progressbar')).toBeHidden();
});

test('selection, modal transitions, and fullscreen closing stop the previous recording', async ({
  page,
}) => {
  await page.goto('/');
  const before = await page.evaluate(() =>
    localStorage.getItem('woodland-hours.draft.v1'),
  );
  await page.getByRole('button', { name: 'Play Osprey recording' }).click();
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  await page.locator('#clock [data-hour="4"] .slice-hit').click();
  await expect(
    page.getByRole('button', { name: 'Pause Wood duck recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__players[0].paused && !window.__players[0].getAttribute('src'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  const profile = page.locator('#bird-profile');
  await expect(
    profile.getByRole('button', { name: 'Play Wood duck recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__players.every((p) => p.paused)),
  ).toBe(true);
  await profile
    .getByRole('button', { name: 'Play Wood duck recording' })
    .click();
  await expect(
    profile.getByRole('button', { name: 'Pause Wood duck recording' }),
  ).toBeVisible();
  await page.locator('#explorer-bird').selectOption('mourning-dove');
  await expect(
    profile.getByRole('button', { name: 'Play Mourning dove recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__players.every((p) => p.paused)),
  ).toBe(true);
  await profile
    .getByRole('button', { name: 'Play Mourning dove recording' })
    .click();
  await expect(
    profile.getByRole('button', { name: 'Pause Mourning dove recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__players.filter((p) => !p.paused).length),
  ).toBe(1);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(
    await page.evaluate(() =>
      window.__players.every((p) => p.paused && !p.getAttribute('src')),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem('woodland-hours.draft.v1')),
  ).toBe(before);
});

test('unavailable recordings are honest and browsing profiles fetches no audio', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
  for (const id of Object.keys(manifest.unavailable)) {
    await page.locator('#explorer-bird').selectOption(id);
    await expect(
      page.locator('#bird-profile .audio-unavailable'),
    ).toBeVisible();
    await expect(page.locator('#bird-profile .audio-play')).toHaveCount(0);
  }
  await page.locator('#explorer-bird').selectOption('golden-pheasant');
  await expect(page.locator('#bird-profile .audio-kind')).toContainText(
    'captive',
  );
  expect(
    requests.filter((url) => /\/calls\/|bird-audio\.json/.test(url)),
  ).toEqual([]);
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
});

test('failed playback can retry and missing credit metadata never prevents playback', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/assets/calls/osprey.mp3', (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.continue(),
  );
  await page.route('**/assets/bird-audio.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Osprey recording' }).click();
  await expect(page.locator('.audio-status')).toContainText('couldn’t play');
  await expect(page.locator('.audio-play')).toHaveText('Try again');
  await page.locator('.audio-play').click();
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Recording credits for Osprey' }),
  ).toHaveAttribute('href', 'assets/calls/credits.html#osprey');
  expect(
    await page.evaluate(() => window.__players.filter((p) => !p.paused).length),
  ).toBe(1);
});

test('cancelled loading cannot start playing when its response arrives late', async ({
  page,
}) => {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route('**/assets/calls/osprey.mp3', async (route) => {
    await held;
    await route.fulfill({
      contentType: 'audio/mpeg',
      body: await fs.readFile('assets/calls/osprey.mp3'),
    });
  });
  await page.goto('/');
  try {
    const requested = page.waitForRequest('**/assets/calls/osprey.mp3');
    await page.getByRole('button', { name: 'Play Osprey recording' }).click();
    await requested;
    await page.getByRole('button', { name: 'Cancel Osprey recording' }).click();
    await expect(
      page.getByRole('button', { name: 'Play Osprey recording' }),
    ).toBeVisible();
  } finally {
    release();
  }
  expect(
    await page.evaluate(() =>
      window.__players.every((p) => p.paused && !p.getAttribute('src')),
    ),
  ).toBe(true);
  await page.locator('#clock [data-hour="6"] .slice-hit').click();
  await expect(
    page.getByRole('button', { name: 'Pause Mourning dove recording' }),
  ).toBeVisible();
});

test('clock clicks play automatically without toggling or overlapping recordings', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#clock')).not.toHaveAttribute('inert');
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
  const osprey = page.locator('#clock [data-hour="2"] .slice-hit');
  await osprey.click();
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__players[0].muted)).toBe(false);
  await osprey.click();
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__players.length)).toBe(1);
  await page.getByRole('button', { name: 'Pause Osprey recording' }).click();
  await expect(
    page.getByRole('button', { name: 'Resume Osprey recording' }),
  ).toBeVisible();
  await osprey.click();
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__players.length)).toBe(1);
  await page.locator('#clock [data-hour="4"] .slice-hit').click();
  await expect(
    page.getByRole('button', { name: 'Pause Wood duck recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__players.filter((p) => !p.paused).length),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        window.__players[0].paused && !window.__players[0].getAttribute('src'),
    ),
  ).toBe(true);
});

test('fullscreen slice playback starts before profile data arrives and survives its render', async ({
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
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.getByText('Opening the field guide…')).toBeVisible();
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
  try {
    await page.locator('.fullscreen-clock [data-hour="4"] .slice-hit').click();
    await expect
      .poll(() => page.evaluate(() => window.__players[0]?.currentTime || 0))
      .toBeGreaterThan(0);
  } finally {
    release();
  }
  const profile = page.locator('#bird-profile');
  await expect(
    profile.getByRole('button', { name: 'Pause Wood duck recording' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__players.length)).toBe(1);
  await page.locator('.fullscreen-clock [data-hour="6"] .slice-hit').click();
  await expect(
    profile.getByRole('button', { name: 'Pause Mourning dove recording' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__players.filter((p) => !p.paused).length),
  ).toBe(1);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__players.every((p) => p.paused)))
    .toBe(true);
});

test('dragging and focus stay silent; keyboard activation plays the bird', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#clock')).not.toHaveAttribute('inert');
  const slice = page.locator('#clock [data-hour="2"]');
  await slice.hover();
  await slice.focus();
  await slice.press('ArrowRight');
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute(
    'data-fonts-ready',
    'true',
  );
  await page.evaluate(() => document.fonts.ready);
  const source = await page
    .locator('#clock [data-hour="2"] .bird-image')
    .boundingBox();
  const target = await page
    .locator('#clock [data-hour="8"] .bird-image')
    .boundingBox();
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await expect(page.locator('.bird-drag-preview')).toContainText(
    'Swap with hour 9',
  );
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 9' }),
  ).toContainText('Osprey');
  expect(await page.evaluate(() => window.__players.length)).toBe(0);
  await page.locator('#clock [data-hour="8"]').focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Pause Osprey recording' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
  await page.locator('.fullscreen-clock [data-hour="4"]').focus();
  await page.keyboard.press('Space');
  await expect(
    page
      .locator('#bird-profile')
      .getByRole('button', { name: 'Pause Wood duck recording' }),
  ).toBeVisible();
});

test.describe('touch playback', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test('tapping a clock bird plays its call', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#clock')).not.toHaveAttribute('inert');
    await page.locator('#clock [data-hour="4"] .slice-hit').tap();
    await expect(
      page.getByRole('button', { name: 'Pause Wood duck recording' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => window.__players.filter((p) => !p.paused).length,
      ),
    ).toBe(1);
  });
});

test('every shipped MP3 decodes to non-silent audio in the browser', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (recordings) => {
    const context = new AudioContext();
    const results = [];
    try {
      for (const [id, recording] of Object.entries(recordings)) {
        const response = await fetch(recording.file);
        const decoded = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        const samples = decoded.getChannelData(0);
        const rms = Math.sqrt(
          samples.reduce((sum, v) => sum + v * v, 0) / samples.length,
        );
        results.push({
          id,
          duration: decoded.duration,
          channels: decoded.numberOfChannels,
          rms,
        });
      }
      return results;
    } finally {
      await context.close();
    }
  }, manifest.recordings);
  for (const recording of result) {
    expect(recording.channels, recording.id).toBe(1);
    expect(recording.rms, recording.id).toBeGreaterThan(0.001);
    expect(recording.duration, recording.id).toBeGreaterThan(0.3);
    expect(recording.duration, recording.id).toBeLessThanOrEqual(12.1);
  }
});
