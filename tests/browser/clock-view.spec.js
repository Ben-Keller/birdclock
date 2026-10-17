import { test, expect } from '@playwright/test';

const draft = (page) =>
  page.evaluate(() => localStorage.getItem('woodland-hours.draft.v1'));
const angles = (page, selector = '#clock') =>
  page
    .locator(selector)
    .evaluate((el) => [
      el.style.getPropertyValue('--view-pitch'),
      el.style.getPropertyValue('--view-yaw'),
    ]);
async function orbit(page, selector = '#clock-view', dx = 230, dy = 130) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + 10,
    y = box.y + 70;
  expect(
    await page.evaluate(
      ({ x, y }) =>
        !!document.elementFromPoint(x, y)?.closest('.clock-slice, button'),
      { x, y },
    ),
  ).toBe(false);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 14 });
  await page.mouse.up();
}
async function birdPoint(page, hour, root = '#clock') {
  const box = await page
    .locator(`${root} [data-hour="${hour - 1}"] .bird-image`)
    .boundingBox();
  // Use the projected artwork bounds, then verify the real hit target.
  for (const fx of [0.5, 0.4, 0.6])
    for (const fy of [0.5, 0.4, 0.6]) {
      const point = { x: box.x + box.width * fx, y: box.y + box.height * fy };
      const hit = await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('.clock-slice')?.dataset
            .hour,
        point,
      );
      if (hit === String(hour - 1)) return point;
    }
  throw new Error(`Hour ${hour} is not hittable in the tilted clock`);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Reset view', exact: true }),
  ).toBeEnabled();
});

test('background orbit changes perspective while tilted slices still select and swap', async ({
  page,
}) => {
  const original = await draft(page);
  const width = (await page.locator('#clock .clock-face').boundingBox()).width;
  await orbit(page);
  const tilted = await angles(page);
  expect(tilted).not.toEqual(['0deg', '0deg']);
  expect(
    (await page.locator('#clock .clock-face').boundingBox()).width,
  ).toBeLessThan(width);
  expect(await draft(page)).toBe(original);
  await expect(page.locator('#undo-button')).toBeDisabled();
  await page.screenshot({ path: 'test-results/clock-3d-desktop.png' });
  const source = await birdPoint(page, 3),
    target = await birdPoint(page, 9);
  await page.mouse.click(source.x, source.y);
  await expect(
    page.getByRole('button', { name: 'Change bird for hour 3' }),
  ).toContainText('Osprey');
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await expect(page.locator('.bird-drag-preview')).toContainText(
    'Swap with hour 9',
  );
  await page.mouse.up();
  const swapped = JSON.parse(await draft(page));
  expect(swapped.slices[8].bird).toBe('osprey');
  expect(swapped.slices[2].bird).toBe('common-loon');
  expect(await angles(page)).toEqual(tilted);
  await page.locator('#undo-button').click();
  expect(await draft(page)).toBe(original);
  await page
    .getByRole('combobox', { name: 'Clock shape' })
    .selectOption('circle');
  expect(await angles(page)).toEqual(tilted);
  await birdPoint(page, 3);
  await page.screenshot({ path: 'test-results/clock-3d-round.png' });
  const round = await draft(page);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  expect(await angles(page)).toEqual(['0deg', '0deg']);
  expect(await draft(page)).toBe(round);
});

test('keyboard view control and cancelled gestures leave edits and selection intact', async ({
  page,
}) => {
  const original = await draft(page);
  const view = page.locator('#clock-view');
  await view.focus();
  await view.press('ArrowRight');
  await view.press('ArrowUp');
  expect(await angles(page)).toEqual(['5deg', '5deg']);
  const box = await view.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await angles(page)).toEqual(['5deg', '5deg']);
  await view.focus();
  await view.press('Home');
  expect(await angles(page)).toEqual(['0deg', '0deg']);
  await expect(page.locator('#clock .selected')).toHaveAttribute(
    'data-hour',
    '2',
  );
  expect(await draft(page)).toBe(original);
  await expect(page.locator('#undo-button')).toBeDisabled();
});

test('fullscreen perspective supports profile clicks, reset, and reopening', async ({
  page,
}) => {
  const original = await draft(page);
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
  await orbit(page, '.explorer-clock-pane', 170, 100);
  expect(await angles(page, '.fullscreen-clock')).not.toEqual(['0deg', '0deg']);
  const bird = await birdPoint(page, 9, '.fullscreen-clock');
  await page.mouse.click(bird.x, bird.y);
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  await page.getByRole('button', { name: 'Reset clock perspective' }).click();
  expect(await angles(page, '.fullscreen-clock')).toEqual(['0deg', '0deg']);
  await expect(page.locator('#bird-profile-title')).toHaveText('Common loon');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View clock fullscreen' }).click();
  await expect(page.locator('#bird-profile-title')).toHaveText('Osprey');
  await orbit(page, '.explorer-clock-pane', -70, 50);
  expect(await angles(page, '.fullscreen-clock')).not.toEqual(['0deg', '0deg']);
  expect(await draft(page)).toBe(original);
});

test.describe('mobile perspective', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test('touch orbit works outside the face and touch cancellation restores the viewpoint', async ({
    page,
    context,
  }) => {
    const original = await draft(page);
    const client = await context.newCDPSession(page);
    const send = (type, points) =>
      client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const box = await page.locator('#clock-view').boundingBox();
    const start = { x: box.x + 10, y: box.y + 50 };
    await send('touchStart', [start]);
    await send('touchMove', [{ x: start.x + 100, y: start.y + 90 }]);
    await send('touchEnd', []);
    const tilted = await angles(page);
    expect(tilted).not.toEqual(['0deg', '0deg']);
    expect(await draft(page)).toBe(original);
    await page.screenshot({ path: 'test-results/clock-3d-mobile.png' });
    await send('touchStart', [start]);
    await send('touchMove', [{ x: start.x + 40, y: start.y + 30 }]);
    await send('touchCancel', []);
    expect(await angles(page)).toEqual(tilted);
    await page.getByRole('button', { name: 'Reset view', exact: true }).tap();
    expect(await angles(page)).toEqual(['0deg', '0deg']);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
