import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { birdAudioMarkup } from '../src/bird-audio.js';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url));
const birds = JSON.parse(read('assets/birds.json'));
const manifest = JSON.parse(read('assets/bird-audio.json'));
const sources = JSON.parse(read('assets/bird-audio-sources.json'));
const index = JSON.parse(read('assets/bird-audio-index.json'));

test('every bird has a verified local recording or an explicit unavailable reason', () => {
  assert.deepEqual(
    [
      ...Object.keys(manifest.recordings),
      ...Object.keys(manifest.unavailable),
    ].sort(),
    birds.map((bird) => bird.id).sort(),
  );
  assert.deepEqual(
    Object.keys(index).sort(),
    Object.keys(manifest.recordings).sort(),
  );
  assert.deepEqual(
    Object.keys(sources.sources).sort(),
    Object.keys(index).sort(),
  );
  const credits = read('assets/calls/credits.html').toString();
  for (const bird of birds) {
    const recording = manifest.recordings[bird.id];
    if (!recording) {
      assert.ok(manifest.unavailable[bird.id]);
      assert.match(birdAudioMarkup(bird), /not available/);
      assert.doesNotMatch(birdAudioMarkup(bird), /data-action/);
      continue;
    }
    const source = sources.sources[bird.id];
    assert.equal(recording.scientificName, bird.scientificName, bird.id);
    assert.equal(recording.recordist, source.recordist);
    assert.equal(recording.license, source.license);
    assert.match(
      recording.license,
      /^(CC BY(-SA)? [\d.]+|CC0.*|Public domain)$/,
    );
    for (const key of ['sourceUrl', 'licenseUrl'])
      assert.equal(new URL(recording[key]).protocol, 'https:');
    assert.ok(recording.recordist && recording.edits && recording.kind);
    assert.ok(recording.duration > 0.3 && recording.duration <= 12.1, bird.id);
    assert.equal(recording.file, `assets/calls/${bird.id}.mp3`);
    const bytes = read(recording.file);
    assert.equal(bytes.subarray(0, 3).toString(), 'ID3');
    assert.equal(bytes.length, recording.bytes);
    assert.ok(bytes.length < 100000, bird.id);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      recording.sha256,
    );
    assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(index[bird.id], {
      kind: recording.kind,
      duration: recording.duration,
    });
    assert.ok(credits.includes(`id="${bird.id}"`));
    assert.ok(credits.includes(recording.licenseUrl));
  }
});

test('audio UI never preloads media or invents a call for uploaded artwork', () => {
  assert.equal(birdAudioMarkup({ id: 'custom-123', name: 'My bird' }), '');
  const html = birdAudioMarkup({ ...birds[0], name: '<img onerror=alert(1)>' });
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<audio|\.mp3|<img/);
  assert.match(html, /credits\.html#northern-flicker/);
});
