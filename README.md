# Apex IT Consultant — apexitconsultant.com

Premium single-brand recruitment website for an SAP consultancy (SAP UI5, BTP, CAP, ABAP).
Static site — no build step. Three.js (WebGL) is loaded from CDN via an import map.

## Run locally

```bash
npm install
npm run start
```

This serves the site at [http://localhost:3000](http://localhost:3000) and opens it in your browser
(`npm run serve` does the same without opening a browser). Any static file server works —
the site is plain HTML/CSS/JS.

> Opening `index.html` directly from the filesystem (`file://`) won't work reliably:
> ES modules and the import map require an HTTP origin.

## Structure

```
index.html      Main page (hero, about, expertise, clients, why join, roles, contact)
404.html        Custom 404 page with a small 3D element
privacy.html    Privacy policy (template text — review before launch)
css/styles.css  Design system: dark theme, glassmorphism, responsive, reduced-motion
js/scene.js     Three.js background: particle network hero, then a scroll-driven
                camera journey past a procedural planet per section (starfield,
                nebulas, displaced low-poly planets, rings, moons, holographic
                planet) with ambient traffic (rockets with exhaust trails,
                shooting stars, asteroids). The page ends with a dive into the
                destination planet: atmosphere flash, then a low-poly landscape
                with crystals, a beacon and a ringed planet on the horizon.
js/main.js      UI: navbar, mobile menu, reveals, counters, card tilt, form handling
```

## Notes

- The contact form is front-end only. Wire the submit handler in `js/main.js`
  (see the comment in the form handler) to your endpoint — e.g. Formspree,
  Netlify Forms, or a CAP service.
- Copy is in English and lives entirely in `index.html`, so it's straightforward
  to localize to Dutch later.
- Before launch: replace the placeholder contact details (phone, LinkedIn),
  review the privacy policy text, and add a social share image
  (`og:image`/`twitter:image`, 1200x630 — then switch `twitter:card` back to
  `summary_large_image` in `index.html`).
- Performance/accessibility built in: device pixel ratio capped at 2, fewer
  particles on mobile, rendering pauses when the tab is hidden, static gradient
  fallback without WebGL, and `prefers-reduced-motion` disables camera and
  entrance animations.
