/**
 * Party Photo Booth - server
 * --------------------------------
 * One small Express service that:
 *   - serves the mobile photobooth UI (public/)
 *   - serves the live gallery wall (public/gallery.html)
 *   - serves the company branding (branding/) + config
 *   - receives captured photos and stores them on disk (a Railway volume in prod)
 *   - streams new-photo events to the gallery in real time via SSE
 *
 * Keep deps minimal (express only) so it boots fast on Railway.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Where uploaded photos live. On Railway, mount a volume and point UPLOADS_DIR at it
// (e.g. UPLOADS_DIR=/data) so photos survive redeploys.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const BRANDING_DIR = path.join(__dirname, 'branding');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Make sure the uploads dir exists.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Captured photos are sent as base64 data URLs, so allow a generous JSON body.
app.use(express.json({ limit: '20mb' }));

// ---- Static assets -------------------------------------------------------
app.use(express.static(PUBLIC_DIR));
app.use('/branding', express.static(BRANDING_DIR));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h' }));

// ---- Branding config -----------------------------------------------------
// Read fresh each request so you can tweak branding/config.json without a restart.
function loadBranding() {
  try {
    const raw = fs.readFileSync(path.join(BRANDING_DIR, 'config.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read branding/config.json, using defaults:', err.message);
    return {
      eventTitle: 'Knight Knox',
      eventSubtitle: 'Capture the moment',
      logo: 'logo.svg',
      photoLogo: 'logo-grey.svg',
      frame: 'frame.svg',
      colors: {
        primary: '#1d33ff',
        secondary: '#45b6a7',
        background: '#1b252f',
        text: '#ffffff',
        accent: '#45b6a7'
      },
      watermarkText: '',
      filters: ['none', 'bw', 'sepia', 'vivid', 'vintage', 'cool', 'warm', 'noir']
    };
  }
}

app.get('/api/branding', (req, res) => {
  res.json(loadBranding());
});

// ---- Live gallery stream (Server-Sent Events) ----------------------------
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 3000\n\n');
  clients.add(res);

  // Heartbeat so proxies don't drop the idle connection.
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

// ---- Photos --------------------------------------------------------------

// List of stored photos, newest first.
function listPhotos() {
  return fs
    .readdirSync(UPLOADS_DIR)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(UPLOADS_DIR, f));
      return { id: f, url: `/uploads/${f}`, ts: stat.mtimeMs };
    })
    .sort((a, b) => b.ts - a.ts);
}

app.get('/api/photos', (req, res) => {
  res.json(listPhotos());
});

// Receive a captured photo. Body: { image: "data:image/jpeg;base64,...", name?: string }
app.post('/api/photos', (req, res) => {
  const { image, name } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image' });
  }

  const match = image.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const ext = match[1] === 'png' ? 'png' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');

  // Guard against absurd uploads.
  if (buffer.length > 18 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large' });
  }

  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, id), buffer);

  const photo = {
    id,
    url: `/uploads/${id}`,
    ts: Date.now(),
    name: typeof name === 'string' ? name.slice(0, 40) : ''
  };

  broadcast('photo', photo);
  res.status(201).json(photo);
});

// Optional cleanup endpoint (host-side only). Protect with ADMIN_TOKEN if you expose it.
app.delete('/api/photos/:id', (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (token && req.headers['x-admin-token'] !== token) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const id = path.basename(req.params.id); // prevent path traversal
  const file = path.join(UPLOADS_DIR, id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    broadcast('delete', { id });
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Not found' });
});

// ---- Routes for the two pages -------------------------------------------
app.get('/gallery', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'gallery.html')));
app.get('/healthz', (req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`📸 Party Photo Booth running on port ${PORT}`);
  console.log(`   Booth:   /`);
  console.log(`   Gallery: /gallery`);
  console.log(`   Uploads: ${UPLOADS_DIR}`);
});

// Graceful shutdown so redeploys/restarts exit cleanly (no SIGTERM error noise).
// SSE connections are long-lived, so end them first, then close + exit.
function shutdown(signal) {
  console.log(`Received ${signal} — shutting down gracefully`);
  for (const res of clients) { try { res.end(); } catch (e) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));
