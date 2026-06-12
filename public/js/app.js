/* Party Photo Booth — capture logic
   - opens the device camera (getUserMedia)
   - live Polaroid preview with filters (what-you-see-is-what-you-get)
   - 3-2-1 countdown
   - composites the photo into a Polaroid: white border + Knight Knox logo in the
     bottom strip, no watermark on the image itself
   - uploads the result to the shared gallery
*/

(() => {
  'use strict';

  // ---- Filter catalogue: name -> CSS filter string (used for preview AND canvas) ----
  const FILTERS = {
    none:    { label: 'Original', css: 'none' },
    bw:      { label: 'B&W',      css: 'grayscale(1) contrast(1.1)' },
    sepia:   { label: 'Sepia',    css: 'sepia(0.8) contrast(1.05)' },
    vivid:   { label: 'Vivid',    css: 'saturate(1.7) contrast(1.15)' },
    vintage: { label: 'Vintage',  css: 'sepia(0.35) saturate(1.3) contrast(0.95) brightness(1.05)' },
    cool:    { label: 'Cool',     css: 'hue-rotate(-15deg) saturate(1.3) brightness(1.05)' },
    warm:    { label: 'Warm',     css: 'sepia(0.25) saturate(1.4) hue-rotate(-10deg) brightness(1.05)' },
    noir:    { label: 'Noir',     css: 'grayscale(1) contrast(1.5) brightness(0.92)' }
  };

  // ---- DOM ----
  const video = document.getElementById('video');
  const previewImg = document.getElementById('previewImg');
  const polaroidLive = document.getElementById('polaroidLive');
  const captionLogo = document.getElementById('captionLogo');
  const countdownEl = document.getElementById('countdown');
  const flashEl = document.getElementById('flash');
  const statusMsg = document.getElementById('statusMsg');
  const filtersEl = document.getElementById('filters');
  const liveControls = document.getElementById('liveControls');
  const reviewControls = document.getElementById('reviewControls');
  const shutterBtn = document.getElementById('shutterBtn');
  const flipBtn = document.getElementById('flipBtn');
  const timerToggle = document.getElementById('timerToggle');
  const retakeBtn = document.getElementById('retakeBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const canvas = document.getElementById('canvas');
  const toast = document.getElementById('toast');

  // ---- State ----
  let branding = null;
  let stream = null;
  let facingMode = 'user';        // 'user' (front) or 'environment' (back)
  let currentFilter = 'none';
  let countdownEnabled = true;
  let capturedDataUrl = null;
  let photoLogoImage = null;      // preloaded grey logo, stamped in the white Polaroid strip
  let busy = false;

  // ---- Polaroid geometry (output canvas) ----
  const CARD_W = 1080;                       // card width
  const PAD = 50;                            // white border (top/left/right)
  const PHOTO = CARD_W - PAD * 2;            // square photo window (980)
  const CAPTION_H = 300;                     // thick white bottom strip for the logo
  const CARD_H = PAD + PHOTO + CAPTION_H;    // total card height

  // ---- Boot ----
  init();

  async function init() {
    await loadBranding();
    buildFilterChips();
    await startCamera();
    wireControls();
  }

  // ---- Branding ----
  async function loadBranding() {
    try {
      branding = await fetch('/api/branding').then((r) => r.json());
    } catch {
      branding = {};
    }
    applyTheme(branding);
  }

  function applyTheme(b) {
    const c = (b && b.colors) || {};
    const root = document.documentElement.style;
    if (c.primary) root.setProperty('--primary', c.primary);
    if (c.secondary) root.setProperty('--secondary', c.secondary);
    if (c.background) root.setProperty('--bg', c.background);
    if (c.text) root.setProperty('--text', c.text);
    if (c.accent) root.setProperty('--accent', c.accent);
    if (b && b.background) {
      root.setProperty('--bg-image', `url('/branding/${b.background}')`);
    }

    const titleEl = document.getElementById('eventTitle');
    const sub = document.getElementById('eventSubtitle');
    titleEl.textContent = b.eventTitle || 'Photo Booth';
    sub.textContent = b.eventSubtitle || '';
    document.title = b.eventTitle ? `${b.eventTitle} · Photo Booth` : 'Photo Booth';

    if (b && b.logo) {
      // White logo for the dark UI header. The logo is the wordmark, so hide the text title.
      titleEl.style.display = 'none';
      const logoEl = document.getElementById('logo');
      logoEl.src = `/branding/${b.logo}`;
      logoEl.hidden = false;
    }

    // Grey logo for the white Polaroid caption strip (live preview + baked into the photo).
    const photoLogoFile = (b && (b.photoLogo || b.logo)) || null;
    if (photoLogoFile) {
      const src = `/branding/${photoLogoFile}`;
      captionLogo.src = src;
      photoLogoImage = new Image();
      photoLogoImage.crossOrigin = 'anonymous';
      photoLogoImage.src = src;
    }
  }

  // ---- Filters ----
  function buildFilterChips() {
    const list = (branding && branding.filters && branding.filters.length)
      ? branding.filters
      : Object.keys(FILTERS);

    filtersEl.innerHTML = '';
    list.forEach((key) => {
      const def = FILTERS[key];
      if (!def) return;
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (key === currentFilter ? ' active' : '');
      chip.textContent = def.label;
      chip.dataset.filter = key;
      chip.addEventListener('click', () => setFilter(key));
      filtersEl.appendChild(chip);
    });
    applyPreviewFilter();
  }

  function setFilter(key) {
    currentFilter = key;
    document.querySelectorAll('.filter-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.filter === key);
    });
    applyPreviewFilter();
  }

  function applyPreviewFilter() {
    const css = (FILTERS[currentFilter] || FILTERS.none).css;
    video.style.filter = css;
    previewImg.style.filter = css;
  }

  // ---- Camera ----
  async function startCamera() {
    stopCamera();
    showStatus('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1707 } },
        audio: false
      });
      video.srcObject = stream;
      video.classList.toggle('mirror', facingMode === 'user');
      await video.play().catch(() => {});
    } catch (err) {
      showStatus(
        'Camera unavailable. Allow camera access in your browser, and make sure the site is opened over HTTPS.'
      );
      console.error(err);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  // ---- Controls ----
  function wireControls() {
    shutterBtn.addEventListener('click', onShutter);
    flipBtn.addEventListener('click', () => {
      facingMode = facingMode === 'user' ? 'environment' : 'user';
      startCamera();
    });
    timerToggle.addEventListener('click', () => {
      countdownEnabled = !countdownEnabled;
      timerToggle.style.opacity = countdownEnabled ? '1' : '0.45';
      showToast(countdownEnabled ? 'Countdown on' : 'Countdown off');
    });
    retakeBtn.addEventListener('click', resetToLive);
    uploadBtn.addEventListener('click', uploadPhoto);
  }

  async function onShutter() {
    if (busy || !stream) return;
    busy = true;
    shutterBtn.disabled = true;

    if (countdownEnabled) {
      await runCountdown(3);
    }
    fireFlash();
    capture();

    busy = false;
    shutterBtn.disabled = false;
  }

  function runCountdown(from) {
    return new Promise((resolve) => {
      let n = from;
      countdownEl.textContent = n;
      countdownEl.classList.add('show');
      const tick = () => {
        n -= 1;
        if (n <= 0) {
          countdownEl.classList.remove('show');
          resolve();
          return;
        }
        countdownEl.textContent = n;
        countdownEl.classList.remove('show');
        // restart pop animation
        void countdownEl.offsetWidth;
        countdownEl.classList.add('show');
        setTimeout(tick, 900);
      };
      setTimeout(tick, 900);
    });
  }

  function fireFlash() {
    flashEl.classList.remove('fire');
    void flashEl.offsetWidth;
    flashEl.classList.add('fire');
  }

  // ---- Capture + composite (Polaroid) ----
  function capture() {
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;

    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    // White Polaroid card
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Square cover-crop of the live video into the photo window
    let sx, sy, sw, sh;
    if (vw / vh > 1) {
      sh = vh; sw = vh; sx = (vw - sw) / 2; sy = 0;
    } else {
      sw = vw; sh = vw; sx = 0; sy = (vh - sh) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, PAD, PHOTO, PHOTO);
    ctx.clip();
    // mirror front-camera shots so the saved photo matches the live (mirrored) preview
    if (facingMode === 'user') {
      ctx.translate(2 * PAD + PHOTO, 0);
      ctx.scale(-1, 1);
    }
    ctx.filter = (FILTERS[currentFilter] || FILTERS.none).css;
    ctx.drawImage(video, sx, sy, sw, sh, PAD, PAD, PHOTO, PHOTO);
    ctx.restore();

    // subtle inner edge around the photo for a printed-photo feel
    ctx.filter = 'none';
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD + 1, PAD + 1, PHOTO - 2, PHOTO - 2);

    // Knight Knox (grey) logo centered in the white caption strip — no watermark on the photo
    const logo = photoLogoImage;
    if (logo && logo.complete && logo.naturalWidth) {
      const lw = CARD_W * 0.5;
      const lh = lw * (logo.naturalHeight / logo.naturalWidth);
      const lx = (CARD_W - lw) / 2;
      const ly = PAD + PHOTO + (CAPTION_H - lh) / 2;
      ctx.drawImage(logo, lx, ly, lw, lh);
    }

    capturedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // show review
    previewImg.src = capturedDataUrl;
    previewImg.style.filter = 'none'; // filter already baked in
    previewImg.classList.remove('hidden');
    polaroidLive.classList.add('hidden');
    liveControls.classList.add('hidden');
    filtersEl.classList.add('hidden');
    reviewControls.classList.add('show');
  }

  function resetToLive() {
    capturedDataUrl = null;
    previewImg.classList.add('hidden');
    polaroidLive.classList.remove('hidden');
    liveControls.classList.remove('hidden');
    filtersEl.classList.remove('hidden');
    reviewControls.classList.remove('show');
    uploadBtn.disabled = false;
    uploadBtn.textContent = '⬆︎ Add to Gallery';
    applyPreviewFilter();
  }

  async function uploadPhoto() {
    if (!capturedDataUrl) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    try {
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedDataUrl })
      });
      if (!res.ok) throw new Error('Upload failed');
      showToast('🎉 Added to the gallery!');
      setTimeout(resetToLive, 900);
    } catch (err) {
      console.error(err);
      showToast('Upload failed — try again');
      uploadBtn.disabled = false;
      uploadBtn.textContent = '⬆︎ Add to Gallery';
    }
  }

  // ---- UI helpers ----
  function showStatus(msg) {
    if (!msg) {
      statusMsg.classList.add('hidden');
      return;
    }
    statusMsg.textContent = msg;
    statusMsg.classList.remove('hidden');
  }

  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  window.addEventListener('pagehide', stopCamera);
})();
