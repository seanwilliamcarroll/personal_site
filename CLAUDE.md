# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Local dev server at localhost:4321
npm run build    # Production build to ./dist/
npm run preview  # Preview production build locally
npm run lint     # ESLint
npm run format   # Prettier
npm run test:demos  # The demo tests (Playwright), against their own build
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

**Nav menu** is hardcoded in `src/components/Header.astro` (not config-driven).

**Layouts:** `Layout.astro` is the base HTML shell (handles SEO meta, GA, fonts). `AboutLayout.astro` wraps it for simple prose pages. `PostDetails.astro` wraps it for blog posts.

**Google Analytics** (`G-Q68J475RQW`) is `src/components/Analytics.astro`, with Do Not Track support. `Layout.astro` includes it only in the published build (`src/utils/analytics.ts`): not under `npm run dev`, and not in the demo tests' build. CI checks the ordinary build still has it.

## Planning

`PLANNING.md` at repo root tracks longer-horizon ideas (not published — Hugo only served from `content/`, and this is now an Astro site). Current plans: NYT Crossword stats page (hybrid Lambda + S3 JSON + client-side rendering).
