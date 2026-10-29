# Guess The Line — Balanced logo refinement

Owner: Sean Balsiger · Version 1 · October 29, 2026

Sean selected **01 Balanced (recommended)** after reviewing `concepts.png`.
The exact implementation is shown in [selected-preview.png](selected-preview.png),
rendered from [selected-preview.svg](selected-preview.svg). Equal outer corner
cuts and mirrored yard-line lengths replace the old angled shoulder and uneven
spacing. A readable G retains an opening on its right; it is optically balanced,
not literally mirror-symmetric.

## Assets

- `concepts.png`: five original visual directions, made with the built-in ImageGen
  tool using the previous app-icon-512.png as its edit reference. This raster
  exploration is not the production source, and its small-size labels are illustrative.
- `logo-balanced-{lime,cyan,emerald,amber,white,deep-green}.svg`: transparent
  editable vectors, using existing `design/tokens-next.json` colors. Lime, cyan,
  emerald, amber and white are intended for dark surfaces; deep green for light.
- `favicon-01-balanced.svg`: exact selected browser favicon, deep green by default,
  lime for a dark browser theme; the side hashes are omitted at favicon sizes.
- `favicon-02-rounded.svg` through `favicon-05-minimal.svg`: unselected vector
  studies, retained for provenance. None is wired into the app.
- `selected-preview.svg` and `.png`: exact selected geometry and color export
  sheet. The favicon samples use 16/32/48 units in its 1200px-wide source; displaying
  the whole sheet scaled changes their apparent size.

The deployed asset paths are `web/public/favicon.svg`, `app-icon.svg` and
`app-icon-{180,192,512}.png`. This task updates their source files, both logo
components (`Brand.jsx`, `next/ui/FieldMark.jsx`) and the original design lab.
The app retains theme green. Alternate exports do not reassign semantic UI colors.
PNG icons keep genuine transparency, centered bounds and the existing 12% margin.

## Generation brief

Use the current Yardline G as the edit reference. Produce one comparison sheet
with five original directions: Balanced, Rounded, Octagon, Field and Minimal.
Correct the asymmetric shoulder and uneven hashes while preserving a recognizable G.
Show equal margins and consistent stem weights, lime/cyan/emerald/amber/white
applications, a deep-green light-background version and simplified favicon studies.
Use the GTL navy canvas and existing tokens; avoid third-party marks, tiles and shadows.
The generated sheet was then rebuilt as native SVG geometry for the selected option.

## Verification and release state

- Five existing brand asset tests pass, including PNG pixels/alpha/margins/centering,
  token colors, transparent backgrounds, favicon theme pairing and simplified geometry.
- All 52 shared UI tests pass, including equality of the two app logo components.
- Brand QA and production build pass. Vite reports its existing large-chunk warning.
- Chromium verifies actual light/dark favicon colors at 16/32/48 sizes on a 320px
  review surface with no horizontal overflow. Browser screenshots are local QA artifacts.
- Local implementation and visual review only. Merge, hosted deployment and
  physical-device acceptance remain separate.
