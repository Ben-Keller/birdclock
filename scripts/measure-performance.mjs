import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const output = process.argv[3];
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const runs = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200000,
      uploadThroughput: 93750,
      connectionType: 'cellular4g',
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.loadMetrics = { lcp: 0, cls: 0, longTasks: 0, clockReady: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.loadMetrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.loadMetrics.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.loadMetrics.longTasks += Math.max(0, entry.duration - 50);
      }).observe({ type: 'longtask', buffered: true });
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll('#clock .clock-slice').length === 12) {
          window.loadMetrics.clockReady = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document, { subtree: true, childList: true });
    });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#clock .clock-slice');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    const result = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const navigation = performance.getEntriesByType('navigation')[0];
      const birdURLs = new Set(
        [...document.querySelectorAll('#clock .bird-image')].map(
          (image) => new URL(image.getAttribute('href'), location.href).href,
        ),
      );
      const birdResources = resources.filter((item) => birdURLs.has(item.name));
      return {
        ...window.loadMetrics,
        clockWithArtworkReady: Math.max(
          window.loadMetrics.clockReady,
          ...birdResources.map((item) => item.responseEnd),
        ),
        clockArtworkDownloaded: Math.max(
          ...birdResources.map((item) => item.responseEnd),
        ),
        clockArtworkBytes: birdResources.reduce(
          (sum, item) => sum + item.encodedBodySize,
          0,
        ),
        clockArtworkStart: Math.min(
          ...birdResources.map((item) => item.startTime),
        ),
        fcp: performance.getEntriesByName('first-contentful-paint')[0]
          ?.startTime,
        load: navigation.loadEventEnd,
        bytes:
          navigation.transferSize +
          resources.reduce((sum, item) => sum + item.transferSize, 0),
        requests: resources.filter((item) => item.transferSize > 0).length + 1,
        resources: resources.map(
          ({ name, transferSize, startTime, responseEnd }) => ({
            name,
            transferSize,
            startTime,
            responseEnd,
          }),
        ),
      };
    });
    runs.push(result);
    console.log(
      JSON.stringify({ run: run + 1, ...result, resources: undefined }),
    );
    await context.close();
  }
  const median = {};
  for (const key of [
    'fcp',
    'lcp',
    'clockReady',
    'clockWithArtworkReady',
    'clockArtworkDownloaded',
    'clockArtworkBytes',
    'clockArtworkStart',
    'load',
    'bytes',
    'requests',
    'cls',
    'longTasks',
  ])
    median[key] = runs.map((run) => run[key]).sort((a, b) => a - b)[1];
  const report = {
    url,
    measuredAt: new Date().toISOString(),
    conditions: {
      viewport: '390×844 @2x',
      cpuSlowdown: 4,
      latencyMs: 150,
      downloadBytesPerSecond: 200000,
      cache: 'disabled; fresh context per run',
    },
    median,
    runs,
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ median }));
} finally {
  await browser.close();
}
