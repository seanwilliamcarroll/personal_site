# Site Planning

Notes and ideas that won't be published to the site.

---

## Potential Migration: Hugo → Astro

**Motivation:**
- LoveIt theme is abandoned (~2022 last commit)
- Astro makes interactive components much cleaner (island architecture)
- npm ecosystem gives access to charting libraries, component libraries, etc.

**Migration phases:**
1. Setup Astro project + pick a starter theme, update `amplify.yml` build command
2. Migrate content (frontmatter TOML → YAML, body is unchanged)
3. Rebuild layouts as Astro components (`BaseLayout.astro`, `BlogPost.astro`, etc.)
4. Add interactive features

**Effort estimate:** 4-8 hours to reach parity with current site.

**Decision:** Not yet. Do it when the interactive crossword stats page justifies it.

---

## Project: NYT Crossword Stats Page

**Goal:** A page showing personal NYT crossword solve stats with interactive charts.

**Planned charts:**
- Rolling average of solve times
- Scatter/box plot of times by day-of-week, with recency color coding

### Architecture: Hybrid (Lambda + S3 JSON + client-side rendering)

```
Lambda (nightly, via EventBridge)
  → fetches NYT crossword data (using subscription cookie, stored in Secrets Manager)
  → writes crossword-stats.json to S3 (public read)

Static site page
  → browser fetches crossword-stats.json from S3
  → renders interactive charts client-side (no auth needed at render time)
```

**Why this approach:**
- No Amplify infrastructure changes needed
- Credentials never exposed to browser
- Charts are fully interactive (hover, zoom, etc.)
- Data updates independently of site deploys

### AWS Components Needed

- **Lambda**: Python, ~50 lines, fetches NYT data, writes JSON to S3
- **S3 bucket**: One JSON file, public read, CORS configured for site domain
- **EventBridge rule**: Triggers Lambda nightly
- **Secrets Manager**: Stores NYT session cookie

### Front-end

- Works cleanly with Astro (component with `client:load`)
- Possible with Hugo too (raw `<script>` block + Chart.js via CDN), but clunky

### JSON Schema (draft)

```json
[
  { "date": "2025-03-01", "day": "Saturday", "solve_time": 847 },
  { "date": "2025-03-02", "day": "Sunday",   "solve_time": 1203 }
]
```

`solve_time` in seconds.

### Status: Planning

---

## Quick Fixes (Hugo config)

- [ ] Fix `baseURL` — still set to `https://example.org/`
- [ ] Fix `description` in `[params]` — still says "Hugo theme - LoveIt"
- [ ] Trim `hugo.toml` — most of the 680 lines are unused defaults
- [ ] Flesh out `content/about/index.md` — currently just a shrug emoji
