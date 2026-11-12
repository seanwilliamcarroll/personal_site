# seanwilliamcarroll.com

Personal website for Sean William Carroll, built with [Astro](https://astro.build/) and the [AstroPaper](https://github.com/satnaing/astro-paper) theme. Deployed via AWS Amplify on push to `main`.

## Commands

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start local dev server at `localhost:4321` |
| `npm run build`   | Build production site to `./dist/`         |
| `npm run preview` | Preview production build locally           |

## Workflow

`main` is protected: changes go through a pull request, and CI
(`.github/workflows/ci.yml`: Prettier, ESLint, type check and build) must
pass before it can be squash-merged. Merging deploys: Amplify builds
`main` on every push to it.

Node comes from `.nvmrc` (`nvm use`); CI and Amplify's build read the same
file. `./install-hooks.sh` installs the local git hooks, which run the
same checks before a commit and a push.

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

Blog posts go in `src/data/blog/` as Markdown files (`.md`, or `.mdx` when a post embeds a component). Required frontmatter:

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
