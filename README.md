# 📸 Party Photo Booth

A mobile-first, photobooth-style web app for parties. Guests open it on their phones,
the camera fires up, they pick a fun filter, get a **3-2-1 countdown**, snap a moment
with the **company-branded frame** baked in, and it lands instantly on a **live shared
gallery wall** everyone can watch.

Built to deploy on **Railway** in one click. One small Node/Express service does everything.

---

## ✨ Features

- 📱 **Opens the device camera** (front/back toggle) right in the browser
- 🎨 **Color filters** — B&W, Sepia, Vivid, Vintage, Cool, Warm, Noir
- ⏱️ **3-2-1 countdown** with flash, classic photobooth feel
- 🖼️ **Branded frame + logo + watermark** composited onto every photo
- 🧱 **Live shared gallery** (`/gallery`) that updates in real time as photos come in
- 🎨 **Full-theme branding folder** — drop in the company's logo, frame, colors & text

---

## 🗂️ Project structure

```
Party_Photo_App/
├── server.js              # Express server: serves UI, stores photos, live stream
├── package.json
├── railway.json           # Railway deploy config
├── branding/              # 👈 COMPANY BRANDING GOES HERE
│   ├── config.json        #     theme: title, colors, watermark, asset filenames
│   ├── logo.svg           #     placeholder logo (swap for the real one)
│   ├── frame.svg          #     placeholder photo frame (transparent center)
│   └── README.md          #     how to brand it
├── public/
│   ├── index.html         # the photo booth
│   ├── gallery.html       # the live gallery wall
│   ├── css/styles.css
│   └── js/{app.js, gallery.js}
└── uploads/               # captured photos land here (use a Railway volume in prod)
```

---

## 🚀 Run it locally

> Camera access needs a **secure context**. `http://localhost` counts as secure, so
> local dev works fine on the same machine. To test from a *phone*, use a deployed
> HTTPS URL (see Railway below) or a tunnel like `ngrok`.

```bash
npm install
npm start
# open http://localhost:3000          (booth)
# open http://localhost:3000/gallery  (wall)
```

---

## ☁️ Deploy on Railway (recommended for the party)

Railway gives you a public **HTTPS** URL automatically — which is exactly what the
camera API requires on phones.

1. **Push this folder to a GitHub repo** (or use the Railway CLI — see below).
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
   Railway auto-detects Node and runs `npm start`. No config needed.
3. **Add a Volume so photos survive redeploys:**
   - Project → your service → **Variables** → add `UPLOADS_DIR=/data`
   - Project → your service → **Settings → Volumes** → New Volume, **mount path `/data`**
4. Open the generated URL (e.g. `https://your-app.up.railway.app`).
   - Booth: `/`
   - Gallery wall: `/gallery`
5. **Make a QR code** of the booth URL and put it on the tables. Done. 🎉

### Or via the Railway CLI

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables set UPLOADS_DIR=/data
# then add the /data volume in the dashboard as above
```

---

## 🎨 Branding (the company assets)

Everything lives in **`branding/`** — see `branding/README.md` for full details.
Quick version:

1. Replace `branding/logo.svg` with the company logo (transparent PNG/SVG).
2. Replace `branding/frame.svg` with the branded frame (**transparent middle**, ~1080×1440).
3. Edit `branding/config.json`: set `eventTitle`, `eventSubtitle`, `watermarkText`,
   and the `colors`. The whole UI re-themes from those colors instantly.

No code changes, no restart — branding reloads on the next page load.

---

## ⚙️ Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port (Railway sets this automatically) |
| `UPLOADS_DIR` | `./uploads` | Where photos are stored — point at a Railway volume (`/data`) |
| `ADMIN_TOKEN` | _(unset)_ | If set, deleting a photo requires header `x-admin-token` |

---

## 🔌 API (if you want to extend it)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/branding` | Current theme/branding config |
| `GET` | `/api/photos` | List photos (newest first) |
| `POST` | `/api/photos` | Upload `{ image: "data:image/jpeg;base64,..." }` |
| `GET` | `/api/stream` | Server-Sent Events stream of new photos |
| `DELETE` | `/api/photos/:id` | Remove a photo (optional `ADMIN_TOKEN`) |
| `GET` | `/healthz` | Health check |

---

## 📝 Notes & tips for the night

- **HTTPS is mandatory** for the camera on phones — always use the Railway URL, not an IP.
- Photos are stored as JPEG at 1080×1440, ~150–300 KB each. Cheap on storage.
- The gallery is great on a **TV/laptop** at the venue as a live slideshow wall.
- Want guests to download their shot? They tap a photo in the gallery → **Download**.
