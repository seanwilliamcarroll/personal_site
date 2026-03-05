# seanwilliamcarroll.com

Personal website for Sean William Carroll, built with [Astro](https://astro.build/) and the [AstroPaper](https://github.com/satnaing/astro-paper) theme. Deployed via AWS Amplify on push to `main`.

## Commands

| Command             | Action                                   |
| :------------------ | :--------------------------------------- |
| `npm install`       | Install dependencies                     |
| `npm run dev`       | Start local dev server at `localhost:4321` |
| `npm run build`     | Build production site to `./dist/`       |
| `npm run preview`   | Preview production build locally         |

## Structure

```
src/
├── data/blog/       # Blog posts (Markdown)
├── pages/           # Standalone pages (about.md, resume.md, etc.)
├── components/      # Astro components
├── layouts/         # Page layouts
├── config.ts        # Site metadata
└── constants.ts     # Social links
public/
├── images/          # Profile picture, post images
├── documents/       # Resume PDF
└── [favicons]
```

## Adding content

Blog posts go in `src/data/blog/` as Markdown files. Required frontmatter:

```yaml
---
title: "Post title"
pubDatetime: 2025-01-01T00:00:00-05:00
description: "A short description."
tags:
  - tag-name
draft: false
---
```

## Deployment

Pushing to `main` triggers an automatic build on AWS Amplify (`amplify.yml`).
