import { escapeHTML as esc } from './clock.js';
import recordings from '../assets/bird-audio-index.json' with { type: 'json' };

const playIcon = '<path d="m8 5 11 7-11 7V5Z"/>';
const pauseIcon = '<path d="M8 5v14M16 5v14"/>';
let audio = null,
  currentId = null,
  state = 'idle',
  failure = '',
  timeout,
  credits,
  creditsRequest;

function refreshProgress() {
  document
    .querySelectorAll('[data-audio-bird] progress')
    .forEach((progress) => {
      progress.value =
        progress.closest('[data-audio-bird]').dataset.audioBird === currentId &&
        audio?.duration
          ? Math.min(1, audio.currentTime / audio.duration) || 0
          : 0;
    });
}

export function birdAudioMarkup(bird) {
  if (bird.id.startsWith('custom-')) return '';
  const recording = recordings[bird.id];
  if (!recording)
    return '<p class="audio-unavailable">A licensed recording is not available for this bird yet.</p>';
  return `<div class="bird-audio" data-audio-bird="${esc(bird.id)}" data-audio-name="${esc(bird.name)}">
    <div class="audio-toolbar"><button type="button" class="audio-play" data-action="bird-audio" aria-label="Play ${esc(bird.name)} recording" aria-pressed="false"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${playIcon}</svg><span>Listen</span></button><span class="audio-kind">${esc(recording.kind)} · ${Math.round(recording.duration)} s</span><a class="audio-source" href="assets/calls/credits.html#${esc(bird.id)}" target="_blank" rel="noopener noreferrer" aria-label="Recording credits for ${esc(bird.name)}" title="Recording credits">ⓘ</a></div>
    <progress class="audio-progress" max="1" value="0" aria-label="Playback progress" hidden></progress><p class="audio-status" role="status" hidden></p><p class="audio-credit" hidden></p>
  </div>`;
}

async function loadCredits() {
  if (credits) return credits;
  if (!creditsRequest) {
    creditsRequest = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('assets/bird-audio.json', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Recording credits unavailable');
        const data = await response.json();
        if (data.version !== 1 || !data.recordings)
          throw new Error('Invalid recording credits');
        credits = data.recordings;
        return credits;
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => {
      creditsRequest = null;
    });
  }
  return creditsRequest;
}

export function refreshBirdAudio(visibleBirdId) {
  if (visibleBirdId && currentId && visibleBirdId !== currentId)
    return stopBirdAudio();
  document.querySelectorAll('[data-audio-bird]').forEach((root) => {
    const id = root.dataset.audioBird;
    const active = id === currentId;
    const playing = active && state === 'playing';
    const loading = active && state === 'loading';
    const paused = active && state === 'paused';
    const failed = active && state === 'error';
    const button = root.querySelector('.audio-play');
    button.setAttribute('aria-pressed', String(playing || loading));
    button.setAttribute('aria-busy', String(loading));
    button.setAttribute(
      'aria-label',
      `${loading ? 'Cancel' : playing ? 'Pause' : paused ? 'Resume' : 'Play'} ${root.dataset.audioName} recording`,
    );
    button.querySelector('svg').innerHTML = playing ? pauseIcon : playIcon;
    button.querySelector('span').textContent = loading
      ? 'Loading…'
      : playing
        ? 'Pause'
        : paused
          ? 'Resume'
          : failed
            ? 'Try again'
            : 'Listen';
    const progress = root.querySelector('progress');
    progress.hidden = !(playing || paused || loading);
    const status = root.querySelector('.audio-status');
    status.hidden = !failed;
    status.textContent = failed ? failure : '';
    const credit = credits?.[id];
    const caption = root.querySelector('.audio-credit');
    caption.hidden = !credit;
    if (credit) {
      caption.innerHTML = `${esc(credit.recordist)} · <a href="${esc(credit.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a> · <a href="${esc(credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(credit.license)}</a><span>${esc(credit.edits)}</span>`;
    }
  });
  refreshProgress();
}

export function stopBirdAudio() {
  clearTimeout(timeout);
  const previous = audio;
  audio = null;
  currentId = null;
  state = 'idle';
  failure = '';
  if (previous) {
    previous.pause();
    previous.removeAttribute('src');
    previous.load();
  }
  refreshBirdAudio();
}

function failPlayback(player, message) {
  if (audio !== player) return;
  clearTimeout(timeout);
  audio = null;
  state = 'error';
  failure = message;
  player.pause();
  player.removeAttribute('src');
  player.load();
  refreshBirdAudio();
}

export function toggleBirdAudio(button) {
  const root = button.closest('[data-audio-bird]');
  const id = root?.dataset.audioBird;
  if (!recordings[id]) return;
  if (id === currentId && state === 'loading') return stopBirdAudio();
  if (id === currentId && state === 'playing') return audio.pause();
  playBirdAudio(id);
}

export function playBirdAudio(id) {
  if (!recordings[id]) return stopBirdAudio();
  // Selecting an already-playing slice should not pause it or overlap clips.
  if (id === currentId && ['playing', 'loading'].includes(state)) return;
  if (id !== currentId || state !== 'paused') {
    stopBirdAudio();
    currentId = id;
    audio = new Audio();
    audio.preload = 'none';
    audio.src = `assets/calls/${id}.mp3`;
    const player = audio;
    const fail = () => {
      failPlayback(
        player,
        'The recording couldn’t play. Check your connection and try again.',
      );
    };
    player.addEventListener('playing', () => {
      if (audio !== player) return;
      clearTimeout(timeout);
      state = 'playing';
      refreshBirdAudio();
    });
    player.addEventListener('pause', () => {
      if (audio !== player || state !== 'playing') return;
      clearTimeout(timeout);
      state = 'paused';
      refreshBirdAudio();
    });
    player.addEventListener('ended', () => {
      if (audio === player) stopBirdAudio();
    });
    player.addEventListener('error', fail);
    player.addEventListener('timeupdate', () => {
      if (audio === player) refreshProgress();
    });
    player.addEventListener('waiting', () => {
      if (audio !== player) return;
      clearTimeout(timeout);
      timeout = setTimeout(fail, 15000);
    });
  }
  const player = audio;
  state = 'loading';
  failure = '';
  refreshBirdAudio();
  // Call play in the click gesture; neither the credits nor another API is
  // needed to start playback. No audio element or request exists before this.
  const playback = player.play();
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    failPlayback(player, 'The recording is taking too long. Try again.');
  }, 15000);
  playback?.catch(() => {
    failPlayback(player, 'The recording couldn’t play. Try again.');
  });
  loadCredits()
    .then(() => refreshBirdAudio())
    .catch(() => {
      // The always-visible credits link remains usable if this request fails.
    });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopBirdAudio();
  });
  window.addEventListener('pagehide', stopBirdAudio);
}
