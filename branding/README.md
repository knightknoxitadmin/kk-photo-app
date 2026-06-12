# 🎨 Company Branding Folder

Everything in this folder controls how the photo booth looks and what gets stamped
onto every photo. **Swap these files with the company's real assets** — no code changes needed.

> **Current setup: Knight Knox (official palette).**
> - **Base:** Deep Blue `#1b252f` (background), Creamy Grey `#f0efeb`, White `#ffffff`
> - **Accent:** Core Blue `#1d33ff` (primary — buttons/shutter/frame), Mint `#45b6a7` (secondary/countdown)
>
> `logo.svg` is the official **white** Knight Knox logo (for the deep-blue UI); `logo-grey.svg`
> is the `#3a3a3a` variant kept on hand. The frame is a Core-Blue→Mint rule on the deep-blue theme.
> To re-theme, edit `config.json` → `colors` and everything updates on the next page load.
> _Note: a light variant (Creamy Grey background + grey logo) is possible if you ever want a
> bright theme — swap `background` to `#f0efeb`, `text` to `#1b252f`, and `logo` to `logo-grey.svg`._

## Files

| File | What it does | Recommended format |
|------|--------------|--------------------|
| `config.json` | The master theme: event title, colors, which assets to use | edit text |
| `logo.svg` / `logo.png` | **White** logo shown in the dark UI header | SVG or transparent PNG |
| `logo-grey.svg` (`photoLogo`) | **Dark/grey** logo printed in the white strip of the Polaroid photo | dark SVG/PNG |
| `frame.svg` / `frame.png` | _(optional, currently unused)_ decorative overlay — the saved photo uses the built-in Polaroid style instead | transparent SVG/PNG |
| `background` (optional) | Full-screen background image for the booth & gallery | JPG/PNG, optional |

## How to add the company branding

1. **Drop in the logo** — replace `logo.svg` (or add `logo.png`) and set `"logo"` in `config.json`
   to the filename. Use a transparent background so it sits nicely on photos.

2. **Drop in the frame** — replace `frame.svg` (or add `frame.png`) and set `"frame"` in `config.json`.
   The frame is drawn over the **entire** photo, so the **middle must be transparent**
   (that's where the person shows through) and the decoration lives around the edges.
   Design it on a transparent canvas roughly **1080 × 1440** (3:4 portrait) for best results.

3. **Set the colors** — edit the `colors` block. These drive the whole UI (buttons, headers,
   accents) via CSS variables, so the app instantly matches the brand.

4. **Set the text** — `eventTitle`, `eventSubtitle`, and `watermarkText` (the small credit
   line stamped at the bottom of each photo). Leave `watermarkText` as `""` to hide it.

5. **(Optional) background image** — put a file in this folder and set `"background"` to its
   filename for a full-bleed branded backdrop.

## config.json reference

```json
{
  "eventTitle": "Our Amazing Party",      // big title on the booth + gallery
  "eventSubtitle": "#BestNightEver",      // small line under the title
  "logo": "logo.svg",                     // filename in this folder, or null to hide
  "frame": "frame.svg",                   // filename in this folder, or null for no frame
  "background": "",                        // optional bg image filename, "" = use gradient
  "colors": {
    "primary":    "#ff2e88",              // main buttons / highlights
    "secondary":  "#7b2ff7",              // gradients / secondary accents
    "background": "#0f0f1a",              // app background
    "text":       "#ffffff",              // text color
    "accent":     "#ffd23f"               // countdown / call-to-action pops
  },
  "watermarkText": "Powered by YOUR COMPANY", // stamped on each photo, "" to hide
  "filters": ["none","bw","sepia","vivid","vintage","cool","warm","noir"]
}
```

Changes to `config.json` take effect on the next page load — no restart needed.
The placeholder `logo.svg` and `frame.svg` here are ready-to-use stand-ins until the
real brand assets arrive.
