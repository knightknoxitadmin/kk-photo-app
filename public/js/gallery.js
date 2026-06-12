/* Live gallery wall.
   Loads existing photos, then listens for new ones in real time via SSE. */

(() => {
  'use strict';

  const grid = document.getElementById('grid');
  const countEl = document.getElementById('count');
  const emptyEl = document.getElementById('empty');
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbDownload = document.getElementById('lbDownload');
  const lbClose = document.getElementById('lbClose');

  const seen = new Set();
  let total = 0;

  init();

  async function init() {
    await applyBranding();
    await loadInitial();
    connectStream();
    wireLightbox();
  }

  async function applyBranding() {
    let b = {};
    try {
      b = await fetch('/api/branding').then((r) => r.json());
    } catch {
      /* defaults are fine */
    }
    const c = b.colors || {};
    const root = document.documentElement.style;
    if (c.primary) root.setProperty('--primary', c.primary);
    if (c.secondary) root.setProperty('--secondary', c.secondary);
    if (c.background) root.setProperty('--bg', c.background);
    if (c.text) root.setProperty('--text', c.text);
    if (c.accent) root.setProperty('--accent', c.accent);
    if (b.background) root.setProperty('--bg-image', `url('/branding/${b.background}')`);

    const titleEl = document.getElementById('eventTitle');
    titleEl.textContent = b.eventTitle || 'Gallery';
    document.getElementById('eventSubtitle').textContent = b.eventSubtitle || 'Live gallery';
    if (b.logo) {
      // Logo is the wordmark — hide the duplicate text title, keep the tagline.
      titleEl.style.display = 'none';
      const logoEl = document.getElementById('logo');
      logoEl.src = `/branding/${b.logo}`;
      logoEl.hidden = false;
    }
  }

  async function loadInitial() {
    try {
      const photos = await fetch('/api/photos').then((r) => r.json());
      photos.forEach((p) => addTile(p, false));
      updateCount();
    } catch (err) {
      countEl.textContent = 'Could not load photos.';
      console.error(err);
    }
  }

  function connectStream() {
    const es = new EventSource('/api/stream');
    es.addEventListener('photo', (e) => {
      try {
        addTile(JSON.parse(e.data), true);
        updateCount();
      } catch {}
    });
    es.addEventListener('delete', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        const tile = grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (tile) {
          tile.remove();
          total = Math.max(0, total - 1);
          seen.delete(id);
          updateCount();
        }
      } catch {}
    });
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
  }

  function addTile(photo, prepend) {
    if (!photo || !photo.id || seen.has(photo.id)) return;
    seen.add(photo.id);
    total += 1;

    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.id = photo.id;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = photo.url;
    img.alt = 'Party photo';
    tile.appendChild(img);

    tile.addEventListener('click', () => openLightbox(photo.url));

    if (prepend && grid.firstChild) {
      grid.insertBefore(tile, grid.firstChild);
    } else {
      grid.appendChild(tile);
    }
    emptyEl.classList.add('hidden');
  }

  function updateCount() {
    if (total === 0) {
      countEl.textContent = '';
      emptyEl.classList.remove('hidden');
    } else {
      countEl.textContent = `${total} ${total === 1 ? 'photo' : 'photos'} • updating live`;
    }
  }

  // ---- Lightbox ----
  function wireLightbox() {
    lbClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  }
  function openLightbox(url) {
    lbImg.src = url;
    lbDownload.href = url;
    lightbox.classList.add('show');
  }
  function closeLightbox() {
    lightbox.classList.remove('show');
    lbImg.src = '';
  }
})();
