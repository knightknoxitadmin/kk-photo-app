/* Face-tracking props engine for the Photo Booth.
   Uses MediaPipe Tasks-Vision FaceLandmarker (loaded from CDN) to detect faces in
   the live video, then draws fun props (hats, glasses, mustaches...) that follow each
   face's position, scale and tilt. The same draw routine is reused at capture time so
   the props get baked into the saved Polaroid.

   Exposes window.BoothProps. */

window.BoothProps = (function () {
  'use strict';

  // ---- Prop artwork (inline SVG → Image, so there are no extra network requests) ----
  const ART = {
    sailor:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 140'>
        <ellipse cx='110' cy='120' rx='98' ry='18' fill='#1d33ff'/>
        <path d='M28 120 Q24 44 110 44 Q196 44 192 120 Z' fill='#ffffff' stroke='#d7dbe2' stroke-width='3'/>
        <rect x='62' y='104' width='96' height='18' rx='9' fill='#1d33ff'/>
        <path d='M110 122 l-10 16 h20 z' fill='#1d33ff'/>
        <circle cx='110' cy='56' r='10' fill='#1d33ff'/>
      </svg>`,
    partyhat:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 210'>
        <polygon points='80,8 28,184 132,184' fill='#45b6a7'/>
        <polygon points='80,8 60,76 80,68 100,76' fill='#1d33ff'/>
        <circle cx='62' cy='120' r='8' fill='#ffd23f'/>
        <circle cx='95' cy='150' r='8' fill='#ffffff'/>
        <circle cx='80' cy='95' r='7' fill='#ffffff'/>
        <circle cx='80' cy='8' r='15' fill='#ffd23f'/>
        <rect x='26' y='180' width='108' height='16' rx='8' fill='#ffffff'/>
      </svg>`,
    crown:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 140'>
        <path d='M20 116 L20 44 L70 84 L110 26 L150 84 L200 44 L200 116 Z' fill='#ffd23f' stroke='#e0b32c' stroke-width='3'/>
        <rect x='20' y='110' width='180' height='20' rx='5' fill='#f0b929'/>
        <circle cx='20' cy='44' r='9' fill='#1d33ff'/>
        <circle cx='110' cy='26' r='9' fill='#45b6a7'/>
        <circle cx='200' cy='44' r='9' fill='#1d33ff'/>
        <circle cx='110' cy='120' r='6' fill='#ffffff'/>
      </svg>`,
    mustache:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 92'>
        <path d='M120 28 C100 8 58 8 28 34 C8 52 40 72 72 58 C98 47 110 40 120 56 C130 40 142 47 168 58 C200 72 232 52 212 34 C182 8 140 8 120 28 Z' fill='#3a2b22'/>
      </svg>`,
    bowtie:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 92'>
        <polygon points='100,46 18,12 18,80' fill='#1d33ff'/>
        <polygon points='100,46 182,12 182,80' fill='#1d33ff'/>
        <rect x='85' y='30' width='30' height='32' rx='7' fill='#15259c'/>
      </svg>`,
    bunny:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 250'>
        <ellipse cx='78' cy='115' rx='30' ry='108' transform='rotate(-12 78 115)' fill='#ffffff' stroke='#ecc6d3' stroke-width='4'/>
        <ellipse cx='142' cy='115' rx='30' ry='108' transform='rotate(12 142 115)' fill='#ffffff' stroke='#ecc6d3' stroke-width='4'/>
        <ellipse cx='78' cy='120' rx='14' ry='80' transform='rotate(-12 78 120)' fill='#ff9db4'/>
        <ellipse cx='142' cy='120' rx='14' ry='80' transform='rotate(12 142 120)' fill='#ff9db4'/>
      </svg>`,
    dogears:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 170'>
        <path d='M52 8 C6 26 4 120 36 158 C66 138 70 70 84 30 Z' fill='#7b4a2b'/>
        <path d='M228 8 C274 26 276 120 244 158 C214 138 210 70 196 30 Z' fill='#7b4a2b'/>
        <path d='M52 8 C20 26 18 104 40 140 C60 124 64 64 78 34 Z' fill='#925c38'/>
        <path d='M228 8 C260 26 262 104 240 140 C220 124 216 64 202 34 Z' fill='#925c38'/>
      </svg>`,
    dognose:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'>
        <ellipse cx='60' cy='48' rx='36' ry='28' fill='#2b2b2b'/>
        <ellipse cx='54' cy='38' rx='13' ry='8' fill='#5d5d5d'/>
      </svg>`,
    starshades:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 130'>
        <rect x='126' y='52' width='28' height='12' rx='4' fill='#15259c'/>
        <rect x='2' y='50' width='26' height='9' rx='4' fill='#15259c'/>
        <rect x='252' y='50' width='26' height='9' rx='4' fill='#15259c'/>
        <g transform='translate(80,62)'>
          <polygon points='0,-50 12.3,-17 47.6,-15.5 20,6.5 29.4,40.5 0,21 -29.4,40.5 -20,6.5 -47.6,-15.5 -12.3,-17' fill='#1d33ff' stroke='#15259c' stroke-width='4'/>
        </g>
        <g transform='translate(200,62)'>
          <polygon points='0,-50 12.3,-17 47.6,-15.5 20,6.5 29.4,40.5 0,21 -29.4,40.5 -20,6.5 -47.6,-15.5 -12.3,-17' fill='#1d33ff' stroke='#15259c' stroke-width='4'/>
        </g>
      </svg>`,
    shades:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 264 104'>
        <rect x='20' y='30' width='96' height='54' rx='24' fill='#15259c'/>
        <rect x='148' y='30' width='96' height='54' rx='24' fill='#15259c'/>
        <rect x='112' y='42' width='40' height='12' rx='6' fill='#15259c'/>
        <rect x='2' y='34' width='22' height='9' rx='4' fill='#15259c'/>
        <rect x='240' y='34' width='22' height='9' rx='4' fill='#15259c'/>
        <rect x='30' y='40' width='30' height='14' rx='7' fill='#3650ff' opacity='.6'/>
        <rect x='158' y='40' width='30' height='14' rx='7' fill='#3650ff' opacity='.6'/>
      </svg>`
  };

  // ---- Prop sets. Each piece anchors to a face region via `pos`. ----
  // pos handlers: hat, partyhat, crown, ears, glasses, mustache, nose, bowtie
  const PROPS = [
    { key: 'none', label: 'None', emoji: '🚫', pieces: [] },
    { key: 'sailor', label: 'Sailor', emoji: '⚓', pieces: [{ art: 'sailor', pos: 'hat' }] },
    { key: 'stache', label: "'Stache", emoji: '👨', pieces: [{ art: 'mustache', pos: 'mustache' }] },
    { key: 'sailorstache', label: "Sailor + 'Stache", emoji: '🧜', pieces: [{ art: 'sailor', pos: 'hat' }, { art: 'mustache', pos: 'mustache' }] },
    { key: 'party', label: 'Party Hat', emoji: '🎉', pieces: [{ art: 'partyhat', pos: 'partyhat' }] },
    { key: 'bowtie', label: 'Bow Tie', emoji: '🎀', pieces: [{ art: 'bowtie', pos: 'bowtie' }] },
    { key: 'dapper', label: 'Dapper', emoji: '🎩', pieces: [{ art: 'bowtie', pos: 'bowtie' }, { art: 'mustache', pos: 'mustache' }] },
    { key: 'bunny', label: 'Bunny', emoji: '🐰', pieces: [{ art: 'bunny', pos: 'ears' }] },
    { key: 'dog', label: 'Dog', emoji: '🐶', pieces: [{ art: 'dogears', pos: 'ears' }, { art: 'dognose', pos: 'nose' }] },
    { key: 'star', label: 'Star Shades', emoji: '⭐', pieces: [{ art: 'starshades', pos: 'glasses' }] },
    { key: 'shades', label: 'Cool Shades', emoji: '😎', pieces: [{ art: 'shades', pos: 'glasses' }] },
    { key: 'crown', label: 'Crown', emoji: '👑', pieces: [{ art: 'crown', pos: 'crown' }] }
  ];

  // FaceMesh landmark indices we use
  const I = { FORE: 10, CHIN: 152, REYE: 33, LEYE: 263, FR: 234, FL: 454, NOSE: 1, PHIL: 164 };

  const images = {};      // art key -> HTMLImageElement
  let landmarker = null;
  let ready = false;
  let loading = false;
  let failed = false;
  let currentKey = 'none';
  let latestFaces = [];
  let video = null;
  let overlay = null;
  let getFacing = () => 'user';
  let lastVideoTime = -1;
  let rafId = null;

  function buildImages() {
    Object.keys(ART).forEach((k) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ART[k].replace(/\s+/g, ' '));
      images[k] = img;
    });
  }

  async function load() {
    if (ready || loading || failed) return;
    loading = true;
    try {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/vision_bundle.mjs');
      const { FaceLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm'
      );
      const opts = {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
        },
        runningMode: 'VIDEO',
        numFaces: 4
      };
      try {
        opts.baseOptions.delegate = 'GPU';
        landmarker = await FaceLandmarker.createFromOptions(fileset, opts);
      } catch {
        opts.baseOptions.delegate = 'CPU';
        landmarker = await FaceLandmarker.createFromOptions(fileset, opts);
      }
      ready = true;
    } catch (err) {
      console.error('Face props failed to load:', err);
      failed = true;
    } finally {
      loading = false;
    }
  }

  // ---- geometry helpers ----
  function mapPoint(lm, S, vw, vh, facing) {
    let cropSize, cropX, cropY;
    if (vw > vh) { cropSize = vh; cropX = (vw - vh) / 2; cropY = 0; }
    else { cropSize = vw; cropX = 0; cropY = (vh - vw) / 2; }
    let x = ((lm.x * vw) - cropX) / cropSize * S;
    let y = ((lm.y * vh) - cropY) / cropSize * S;
    if (facing === 'user') x = S - x;
    return { x, y };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function norm(v) { const m = Math.hypot(v.x, v.y) || 1; return { x: v.x / m, y: v.y / m }; }

  function placement(lms, S, vw, vh, facing) {
    const P = (i) => mapPoint(lms[i], S, vw, vh, facing);
    const fore = P(I.FORE), chin = P(I.CHIN), reye = P(I.REYE), leye = P(I.LEYE);
    const fr = P(I.FR), fl = P(I.FL), nose = P(I.NOSE), phil = P(I.PHIL);
    const faceW = Math.max(dist(fr, fl), dist(reye, leye) * 1.7);
    const faceH = dist(fore, chin);
    const up = norm({ x: fore.x - chin.x, y: fore.y - chin.y });
    const angle = Math.atan2(leye.y - reye.y, leye.x - reye.x);
    const along = (pt, f) => ({ x: pt.x + up.x * faceH * f, y: pt.y + up.y * faceH * f });
    return { faceW, faceH, up, angle, eyeC: mid(reye, leye), fore, chin, nose, phil, along };
  }

  function centerFor(pos, pl) {
    switch (pos) {
      case 'hat': return { c: pl.along(pl.fore, 0.62), w: pl.faceW * 1.45 };
      case 'partyhat': return { c: pl.along(pl.fore, 0.92), w: pl.faceW * 0.95 };
      case 'crown': return { c: pl.along(pl.fore, 0.42), w: pl.faceW * 1.25 };
      case 'ears': return { c: pl.along(pl.fore, 0.72), w: pl.faceW * 1.55 };
      case 'glasses': return { c: pl.along(pl.eyeC, 0.02), w: pl.faceW * 1.08 };
      case 'mustache': return { c: pl.along(pl.phil, 0.0), w: pl.faceW * 0.6 };
      case 'nose': return { c: pl.nose, w: pl.faceW * 0.32 };
      case 'bowtie': return { c: pl.along(pl.chin, -0.42), w: pl.faceW * 0.8 };
      default: return null;
    }
  }

  function drawPiece(ctx, img, cx, cy, w, angle) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const h = w * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawFaces(ctx, S, faces, vw, vh, facing) {
    const prop = PROPS.find((p) => p.key === currentKey);
    if (!prop || !prop.pieces.length || !faces || !faces.length || !vw) return;
    faces.forEach((lms) => {
      const pl = placement(lms, S, vw, vh, facing);
      if (!isFinite(pl.faceW) || pl.faceW <= 0) return;
      prop.pieces.forEach((piece) => {
        const spot = centerFor(piece.pos, pl);
        if (spot) drawPiece(ctx, images[piece.art], spot.c.x, spot.c.y, spot.w, pl.angle);
      });
    });
  }

  // ---- live preview loop ----
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!overlay) return;
    const cw = overlay.clientWidth, ch = overlay.clientHeight;
    if (!cw) return; // preview hidden (e.g. review screen) — idle
    const ctx = overlay.getContext('2d');
    if (overlay.width !== cw || overlay.height !== ch) { overlay.width = cw; overlay.height = ch; }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (currentKey === 'none' || !ready || !video || !video.videoWidth) return;
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const res = landmarker.detectForVideo(video, performance.now());
        latestFaces = (res && res.faceLandmarks) || [];
      } catch (e) { /* keep last */ }
    }
    drawFaces(ctx, overlay.width, latestFaces, video.videoWidth, video.videoHeight, getFacing());
  }

  return {
    PROPS,
    isReady: () => ready,
    isLoading: () => loading,
    hasFailed: () => failed,
    load,
    setProp(key) {
      currentKey = key;
      if (key !== 'none') load();
    },
    currentKey: () => currentKey,
    attachPreview(videoEl, overlayEl, facingFn) {
      buildImages();
      video = videoEl;
      overlay = overlayEl;
      getFacing = facingFn || getFacing;
      if (!rafId) loop();
    },
    // Test hook: draw a given prop over supplied (fake) face landmarks. Used by the
    // offline test harness to validate artwork + placement without a camera.
    _debug(ctx, S, key, faces, vw, vh, facing) {
      if (!Object.keys(images).length) buildImages();
      const prev = currentKey;
      currentKey = key;
      drawFaces(ctx, S, faces, vw, vh, facing);
      currentKey = prev;
    },
    // Fresh-detect + draw for the captured photo (S = photo window size, ctx already
    // translated to the photo window origin).
    drawForCapture(ctx, S, facing) {
      if (currentKey === 'none' || !ready || !video || !video.videoWidth) return;
      let faces = latestFaces;
      try {
        const res = landmarker.detectForVideo(video, performance.now());
        if (res && res.faceLandmarks) faces = res.faceLandmarks;
      } catch (e) { /* use last */ }
      drawFaces(ctx, S, faces, video.videoWidth, video.videoHeight, facing);
    }
  };
})();
