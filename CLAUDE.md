# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Local dev server at localhost:4321
npm run build    # Production build to ./dist/
npm run preview  # Preview production build locally
npm run lint     # ESLint
npm run format   # Prettier
```

## Architecture

Astro static site using the AstroPaper theme, hosted on AWS Amplify. Pushing to `main` triggers an automatic build via `amplify.yml` (`npm ci` + `npm run build` → `dist/`).

**Key config files:**
- `src/config.ts` — site metadata (title, URL, author, timezone, feature flags)
- `src/constants.ts` — social links shown in header/footer
- `astro.config.ts` — Astro/Vite config, sitemap, markdown plugins, font

**Content:**
- `src/data/blog/` — blog posts as Markdown. Required frontmatter: `title`, `description`, `pubDatetime` (ISO 8601). Optional: `tags`, `draft`, `featured`.
- `src/pages/about.md` and `src/pages/resume.md` — standalone pages using `AboutLayout.astro`
- `public/` — static assets (favicons, `images/`, `documents/resume.pdf`). Copied verbatim to `dist/` at build time — not processed by Astro.
- `src/assets/` — images processed/optimized by Astro at build time

**Nav menu** is hardcoded in `src/components/Header.astro` (not config-driven).

**Layouts:** `Layout.astro` is the base HTML shell (handles SEO meta, GA, fonts). `AboutLayout.astro` wraps it for simple prose pages. `PostDetails.astro` wraps it for blog posts.

**Google Analytics** (`G-Q68J475RQW`) is in `Layout.astro` with Do Not Track support.

## Planning

`PLANNING.md` at repo root tracks longer-horizon ideas (not published — Hugo only served from `content/`, and this is now an Astro site). Current plans: NYT Crossword stats page (hybrid Lambda + S3 JSON + client-side rendering).
