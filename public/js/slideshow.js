/* Full-screen slideshow wall for the Photo Booth.
   - cycles through every photo with a crossfade
   - auto-advances; play/pause, next/prev, shuffle, speed, fullscreen
   - live: new photos appear via SSE and are surfaced next ("Just added!")
   Great on a TV/projector at the venue. */

(() => {
  'use strict';

  const show = document.getElementById('show');
  const imgA = document.getElementById('imgA');
  const imgB = document.getElementById('imgB');
  const empty = document.getElementById('empty');
  const newToast = document.getElementById('newToast');
  const controls = document.getElementById('controls');
  const countEl = document.getElementById('count');
  const playBtn = document.getElementById('playBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');

  let photos = [];          // [{id,url,ts}] chronological (oldest -> newest)
  let order = [];           // indices into photos, the play order
  let pos = 0;              // position in order
  let layerA = true;        // which <img> is currently visible
  let playing = true;
  let shuffle = false;
  let intervalMs = 5000;
  const MIN_MS = 2000, MAX_MS = 15000;
  let timer = null;
  let pendingJump = null;   // index (into photos) to show next, for brand-new shots
  const seen = new Set();

  init();

  async function init() {
    await applyBranding();
    await loadPhotos();
    buildOrder();
    wire();
    if (photos.length) { showAt(0, true); start(); }
    connectStream();
  }

  async function applyBranding() {
    let b = {};
    try { b = await fetch('/api/branding').then((r) => r.json()); } catch {}
    const c = b.colors || {};
    const root = document.documentElement.style;
    if (c.background) root.setProperty('--bg', c.background);
    if (c.primary) root.setProperty('--primary', c.primary);
    if (c.secondary) root.setProperty('--secondary', c.secondary);
    if (c.accent) root.setProperty('--accent', c.accent);
    if (b.logo) { const l = document.getElementById('logo'); l.src = `/branding/${b.logo}`; l.hidden = false; }
    document.title = (b.eventTitle ? b.eventTitle + ' · ' : '') + 'Slideshow';
  }

  async function loadPhotos() {
    try {
      const list = await fetch('/api/photos').then((r) => r.json());
      // API is newest-first; show oldest -> newest so it reads like the night unfolding
      photos = list.slice().reverse();
      photos.forEach((p) => seen.add(p.id));
    } catch { photos = []; }
    empty.style.display = photos.length ? 'none' : 'flex';
  }

  function buildOrder() {
    order = photos.map((_, i) => i);
    if (shuffle) shuffleArray(order);
  }

  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      // index-based pseudo-shuffle (Math.random is fine in the browser)
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  function showAt(photoIndex, instant) {
    if (!photos.length) return;
    const photo = photos[photoIndex];
    if (!photo) return;
    const incoming = layerA ? imgB : imgA;
    const outgoing = layerA ? imgA : imgB;
    incoming.onload = () => {
      incoming.classList.add('visible');
      outgoing.classList.remove('visible');
      layerA = !layerA;
    };
    if (instant) { incoming.style.transition = 'none'; requestAnimationFrame(() => { incoming.style.transition = ''; }); }
    incoming.src = photo.url;
    countEl.textContent = `${order.indexOf(photoIndex) + 1} / ${photos.length}`;
  }

  function next() {
    if (!photos.length) return;
    if (pendingJump != null) {
      const pj = pendingJump; pendingJump = null;
      pos = order.indexOf(pj);
      showAt(pj);
      flashNew();
      return;
    }
    pos = (pos + 1) % order.length;
    showAt(order[pos]);
  }

  function prev() {
    if (!photos.length) return;
    pos = (pos - 1 + order.length) % order.length;
    showAt(order[pos]);
  }

  function start() { stop(); if (playing) timer = setInterval(next, intervalMs); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function flashNew() {
    newToast.classList.add('show');
    setTimeout(() => newToast.classList.remove('show'), 2500);
  }

  function connectStream() {
    const es = new EventSource('/api/stream');
    es.addEventListener('photo', (e) => {
      try {
        const p = JSON.parse(e.data);
        if (seen.has(p.id)) return;
        seen.add(p.id);
        photos.push(p);                 // newest at the end (chronological)
        const newIndex = photos.length - 1;
        order.push(newIndex);
        empty.style.display = 'none';
        if (photos.length === 1) { showAt(0, true); start(); }
        else { pendingJump = newIndex; } // surface the fresh shot on the next advance
        countEl.textContent = `${pos + 1} / ${photos.length}`;
      } catch {}
    });
    es.addEventListener('delete', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        const i = photos.findIndex((p) => p.id === id);
        if (i < 0) return;
        photos.splice(i, 1);
        seen.delete(id);
        buildOrder();
        if (pos >= order.length) pos = 0;
        empty.style.display = photos.length ? 'none' : 'flex';
        if (photos.length) showAt(order[pos], true);
      } catch {}
    });
  }

  // ---- controls ----
  function wire() {
    document.getElementById('prevBtn').addEventListener('click', () => { prev(); start(); });
    document.getElementById('nextBtn').addEventListener('click', () => { next(); start(); });
    playBtn.addEventListener('click', togglePlay);
    shuffleBtn.addEventListener('click', toggleShuffle);
    document.getElementById('slowBtn').addEventListener('click', () => changeSpeed(1000));
    document.getElementById('fastBtn').addEventListener('click', () => changeSpeed(-1000));
    document.getElementById('fsBtn').addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { next(); start(); }
      else if (e.key === 'ArrowLeft') { prev(); start(); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key.toLowerCase() === 's') toggleShuffle();
    });

    // tap left/right thirds to navigate
    show.addEventListener('click', (e) => {
      if (e.target.closest('.show-controls')) return;
      const x = e.clientX / window.innerWidth;
      if (x < 0.33) { prev(); start(); }
      else if (x > 0.66) { next(); start(); }
      else togglePlay();
    });

    // auto-hide controls
    let hideTimer = null;
    const reveal = () => {
      controls.classList.add('visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => controls.classList.remove('visible'), 3000);
    };
    ['mousemove', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, reveal));
    reveal();
  }

  function togglePlay() {
    playing = !playing;
    playBtn.textContent = playing ? '⏸' : '▶';
    start();
  }
  function toggleShuffle() {
    shuffle = !shuffle;
    shuffleBtn.classList.toggle('on', shuffle);
    const current = order[pos];
    buildOrder();
    pos = Math.max(0, order.indexOf(current));
  }
  function changeSpeed(delta) {
    intervalMs = Math.min(MAX_MS, Math.max(MIN_MS, intervalMs + delta));
    flashSpeed();
    start();
  }
  function flashSpeed() {
    countEl.textContent = `${(intervalMs / 1000).toFixed(0)}s`;
    setTimeout(() => { countEl.textContent = `${pos + 1} / ${photos.length}`; }, 1200);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
    else document.exitFullscreen && document.exitFullscreen();
  }
})();
