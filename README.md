# ETMCLEANING Checklist

A simple, mobile-friendly Progressive Web App (PWA) for managing cleaning
checklists across ETMCLEANING locations. Includes per-location info pages,
detailed cleaning checklists with progress tracking, a built-in cleaning
timer with pause/resume, and a per-location cleaning log.

**Open the app (production):** [https://etmcbusiness.github.io/etmcleaning-checklist/](https://etmcbusiness.github.io/etmcleaning-checklist/)

Use that **`github.io`** address in the browser or when sharing—**not** the raw `github.com/...` repository page (that is only the code). Repository: [github.com/etmcbusiness/etmcleaning-checklist](https://github.com/etmcbusiness/etmcleaning-checklist).

## Features

- **Location dashboard** — pick a property and see its key info (address, key,
  alarm, square footage, light switch, etc.)
- **Cleaning checklists** — task lists grouped by area, with cleaner-product
  badges, sticky progress percentage, and persistent state across reloads.
- **Cleaning timer** — starts when you tap "Start Cleaning", supports
  pause/resume, freezes on completion, displayed in the top-right corner.
- **Cleaning log** — every completed cleaning is automatically recorded with
  start time, end time, and duration. Includes total/average summary tiles.
- **Notes carryover** — notes left for "next cleaning" automatically pre-fill
  the "this cleaning" notes the next time someone starts.
- **Free Add-Ons** — optional tasks for when there's extra time, that don't
  count toward the progress percentage.
- **Works offline** — once loaded, the app caches itself and runs without
  internet via a service worker.
- **Installable** — add to your phone's home screen for an app-like experience.

## Color palette

- Black (`#0b0b0d`)
- White / off-white (`#ffffff` / `#f6f9fc`)
- Light blue accents (`#aedcf5`, `#dff1fb`, `#6cc2ee`)

## Add to home screen (turn it into a phone app)

### iPhone (Safari)
1. Open the site URL in Safari.
2. Tap the **Share** button.
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add**. The ETM icon now appears on your home screen.

### Android (Chrome)
1. Open the site URL in Chrome.
2. Tap the **⋮** menu in the top-right.
3. Tap **Add to Home screen** (or **Install app**).
4. Confirm. The ETM icon now appears on your home screen.

Once installed, the app launches fullscreen with no browser bars, works
offline, and stores all your data locally on the device.

## Project structure

```
.
├── index.html               # Home: choose a location
├── ramsey-rd.html           # Ramsey Rd location info page
├── ramsey-rd-checklist.html # Ramsey Rd cleaning checklist
├── ramsey-rd-log.html       # Ramsey Rd cleaning log
├── warehouse.html           # Warehouse location (placeholder info)
├── styles.css               # Shared styles
├── checklist.js             # Checklist logic (timer, progress, persistence)
├── log.js                   # Cleaning log rendering
├── app.js                   # Service worker registration
├── sw.js                    # Service worker (offline cache)
├── manifest.json            # PWA manifest
└── icons/                   # App icons (SVG)
    ├── icon.svg
    ├── icon-maskable.svg
    └── favicon.svg
```

## Adding a new location

1. Duplicate `ramsey-rd.html`, `ramsey-rd-checklist.html`, and
   `ramsey-rd-log.html`. Rename them to match the new location
   (e.g. `downtown.html`, `downtown-checklist.html`, `downtown-log.html`).
2. In each file, update the `data-storage-key` attribute (or the `?` location
   text) to a unique slug like `checklist-downtown`. This keeps the new
   location's checkboxes / timer / log separate from other locations.
3. Update the `href` links between the three pages so they point at each other.
4. On `index.html`, add a new `<a class="location-btn">` row pointing at the
   new info page.
5. Add the new HTML files to the `PRECACHE_URLS` list in `sw.js` so they're
   cached for offline use, and bump `CACHE_VERSION` so existing users get the
   update.

## Local development

This project is plain static HTML / CSS / JS — no build step. To preview:

```bash
# from the project folder, run a tiny local server (any of these works):
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 in your browser. Service workers require a
live HTTP server (or HTTPS in production) — they will not register from
`file://` URLs.

## Data storage

All cleaning state is stored in the browser's `localStorage` under per-location
keys (e.g. `checklist-ramsey-rd`, `checklist-ramsey-rd:log`). No data leaves
the device. Clearing your browser's site data will erase the cleaning log.

## License

Internal tool — all rights reserved.
