# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm runs **only in the development container** (`CONTAINER.md`), through
`./dc`; git, `gh` and `aws` run on the Mac. Never run `npm`, `npx` or
`node` on the Mac in this repository. Colima's `site` VM must be up
(`colima start --profile site`).

```bash
./dc -p 4321 npm run dev -- --host   # Dev server at localhost:4321
./dc npm run build      # Production build to ./dist/
./dc npm run lint       # ESLint
./dc npm run format     # Prettier
./dc npm run test:demos # The demo tests (Playwright), against their own build
./dc npm run check:og   # The social-preview images in dist/ (after a build)
./dc npm run check:live # The published site: demo pages, their .wasm, a real 404
```

## Workflow

- `main` is protected (a GitHub ruleset): no direct pushes. Branch, open a
  pull request, wait for CI, squash-merge. Merging deploys (Amplify builds
  `main`).
- CI (`.github/workflows/ci.yml`) runs on every pull request: Prettier
  (`npm run format:check`), ESLint, and `npm run build` (which includes
  `astro check`) in the job `check`, which mirrors the git hooks from
  `install-hooks.sh`; and the demo tests in the job `demos`.
- Node comes from `.nvmrc`; CI and `amplify.yml` both read it.

## Architecture

Astro static site using the AstroPaper theme, hosted on AWS Amplify. Pushing to `main` triggers an automatic build via `amplify.yml` (`npm ci` + `npm run build` → `dist/`).

**Key config files:**
- `src/config.ts` — site metadata (title, URL, author, timezone, feature flags)
- `src/constants.ts` — social links shown in header/footer
- `astro.config.ts` — Astro/Vite config, sitemap, markdown plugins, font

**Content:**
- `src/data/blog/` — blog posts as Markdown (`.md`), or MDX (`.mdx`) when a post needs to hold a component. Required frontmatter: `title`, `description`, `pubDatetime` (ISO 8601). Optional: `tags`, `draft`, `featured`.
- `src/pages/about.md` and `src/pages/resume.md` — standalone pages using `AboutLayout.astro`
- `public/` — static assets (favicons, `images/`, `documents/resume.pdf`). Copied verbatim to `dist/` at build time — not processed by Astro.
- `src/assets/` — images processed/optimized by Astro at build time

**Embedded demos** (`src/components/demo/`):

- `Demo.astro` is the frame (canvas, play/pause, a failure message);
  `lifecycle.ts` decides when a demo starts (scrolled into view), runs
  (on screen, tab visible, not paused; paused at first under "reduce
  motion"), and is torn down (before every client-side page swap).
- A demo is its own component that renders `<Demo name="x" …>` and, in a
  processed `<script>`, calls `registerDemo("x", canvas => ({ frame,
  dispose }))`. `Bounce.astro` is the minimal example. Draw with the
  colours passed to `frame`: they follow the theme.
- The wrapper's element carries `data-demo-state` (`idle`, `loading`,
  `running`, `paused`, `failed`) and `data-demo-frames`; `<html>` carries
  `data-demo-live` (how many are mounted). Tests read these.
- Posts that embed a demo are `.mdx`.
- Demos that run the physics engine use the `physics-engine` package
  (wasm, loader, types). It is not on the npm registry: `package.json`
  names a release tarball of github.com/seanwilliamcarroll/physics by
  URL, and `package-lock.json` pins its hash. To move to a new engine
  version: `npm install <the new release's .tgz URL>`, then
  `npm run test:demos`. `HelloParticles.astro` is the example: the
  package is imported inside the factory (so nothing is fetched until
  the demo starts) and the wasm by `physics-engine/engine.wasm?url`.

**The live check** (`scripts/check-live.mjs`, `npm run check:live`, by
hand after a deploy or a change to Amplify's settings: it needs the
network, so it isn't in CI): each published page with a demo loads,
every `.wasm` its scripts name is served 200 as `application/wasm` and
starts with wasm's magic bytes, and a made-up page is a real 404 with
the site's own page. **Add a newly published demo post to its
`DEMO_PAGES`** (drafts belong only in `tests/demo-pages.ts`).

**Drafts** (`draft: true`) are not built, except with
`PUBLIC_SHOW_DRAFTS=true` in the environment (`src/utils/drafts.ts`):
`PUBLIC_SHOW_DRAFTS=true npm run dev` to look at one. Amplify never sets
it.

**Demo tests** (`tests/`, `playwright.config.ts`): `npm run test:demos`
builds the site with drafts into `dist-demos/` and drives it in Chromium,
as a desktop and as a phone. Once per machine:
`npx playwright install chromium`.

- `tests/demo-pages.ts` lists every page with a demo. Add a new post's
  page there: `tests/demos.spec.ts` then checks that each demo starts,
  draws, moves, pauses, and is disposed on leaving the page.
- `tests/wrapper.spec.ts` checks the wrapper itself on two draft posts
  (`demo-wrapper-check`, `demo-failure-check`).
- `tests/fixtures.ts`: any request to another site is refused and fails
  the test, and so does any console error.

**Dependencies** (`package.json`, `.npmrc`). Installing a package runs
its code on this machine, so three guards, which need npm 11.16+ (it
comes with Node 24, `.nvmrc`; `engines` refuses an older npm, which
would ignore the settings without a word):

- **A week's wait** (`min-release-age=7`): npm installs only versions
  published at least 7 days ago. Hijacked releases are usually found and
  pulled within days. A security fix that's newer can be let through by
  adding its package to `min-release-age-exclude` in `.npmrc`, then
  taken out again.
- **No install scripts unless approved** (`strict-allow-scripts=true`):
  a dependency that wants to run a script at install fails the install
  until `allowScripts` in `package.json` says yes or no. Today: only
  `fsevents` has one (`node-gyp rebuild`, a C compile), and it is
  denied; it ships a prebuilt binary, and file watching works without
  the script (checked). A new entry means a package started running code
  at install: look at what it runs before approving it.
- **`engine-strict=true`**, with `engines` in `package.json`.

Upgrading: `npm outdated`, then raise ranges; the week's wait still
applies, so the newest versions may not be installable yet. `npm audit`
should stay empty. Exceptions, by design:

- `typescript` is on 6: `typescript-eslint` and `@astrojs/check` don't
  accept 7 yet (7 is the compiler rewritten in Go, without the old
  JavaScript API they use).
- `overrides` lift three packages their parents pin below a fixed
  version: `fflate` (under satori), `postcss-selector-parser` (under
  `@tailwindcss/typography`), and any `minimatch` from 7 to 11.0.0
  (under ESLint and typescript-eslint). Drop each once `npm audit` is
  clean without it.

**Social-preview images** (`src/utils/og-templates/`, drawn by satori at
build time): `frame.js` places the two cards by explicit pixel
coordinates, so the picture doesn't depend on a renderer's defaults.
`npm run check:og` (in CI, after the build) checks every image is framed
as intended: nothing else would notice a satori upgrade drawing them
wrongly, which has happened.

**Nav menu** is hardcoded in `src/components/Header.astro` (not config-driven).

**Layouts:** `Layout.astro` is the base HTML shell (handles SEO meta, GA, fonts). `AboutLayout.astro` wraps it for simple prose pages. `PostDetails.astro` wraps it for blog posts.

**Google Analytics** (`G-Q68J475RQW`) is `src/components/Analytics.astro`, with Do Not Track support. `Layout.astro` includes it only in the published build (`src/utils/analytics.ts`): not under `npm run dev`, and not in the demo tests' build. CI checks the ordinary build still has it.

## Amplify

App `d1t62g12ueac2b` (us-east-1), branch `main`, production. Settings
that live in AWS, not in this repository:

- **Build spec:** the repository's `amplify.yml` is the one used (it
  takes precedence). The app's stored copy in the console is the same
  file, put there in place of the Hugo build the site started with
  (2026-11-13); keep it in step if `amplify.yml` changes, or ignore it.
- **One rewrite rule:** `/<*>` → `/404.html`, type `404-200`: a URL with
  no file gets the site's "Page Not Found" page, at the same address,
  with status 404. (Type `404` would redirect to `/404.html` and answer
  200 there; the Hugo-era rule sent missing URLs the home page.)
- To read them: `aws amplify get-app --app-id d1t62g12ueac2b --region
  us-east-1`. Changing them changes the live site: done by hand.

## Planning

`PLANNING.md` at repo root tracks longer-horizon ideas. It isn't published: Astro builds pages only from `src/`. Current plans: NYT Crossword stats page (hybrid Lambda + S3 JSON + client-side rendering).
