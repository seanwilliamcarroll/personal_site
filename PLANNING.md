# Site Planning

Notes and ideas that won't be published to the site.

---

## Project: NYT Crossword Stats Page

**Goal:** A page showing personal NYT crossword solve stats with interactive charts.

**Planned charts:**
- Rolling average of solve times
- Scatter/box plot of times by day-of-week, with recency color coding

### Architecture: Fargate + S3 + Parameter Store

```
ECS Fargate task (nightly, via EventBridge)
  → fetches NYT-S token from SSM Parameter Store
  → runs Rust binary (~/crossword) to fetch solve data from NYT API
  → converts CSV output to JSON, writes crossword-stats.json to S3 (public read)

Static site page (/crossword)
  → browser fetches crossword-stats.json from S3 on load
  → renders interactive charts client-side
```

**Why Fargate over Lambda:**
- Rust binary is a CLI tool — runs as-is in a container, no Lambda handler wrapper needed
- Docker build handles compilation (`cargo build` inside Dockerfile), no cross-compilation toolchain
- Simpler deploy: build image → push to ECR → task runs on schedule

**Why Fargate over GitHub Actions:**
- AWS account already linked and paid; GH Actions is free but adds another system
- Secrets stay entirely within AWS (no GH secrets to manage)

### AWS Components

- **ECR**: Docker image containing the Rust binary
- **ECS Fargate task**: runs nightly, exits when done
- **EventBridge rule**: cron trigger for nightly run
- **SSM Parameter Store**: stores `NYT-S` cookie (free tier, standard parameter)
- **IAM task role**: grants Fargate task read access to the SSM parameter and write access to S3
- **S3 bucket**: hosts `crossword-stats.json` with public read + CORS for site domain

### Secrets Handling

NYT-S cookie stored in SSM Parameter Store. Container entrypoint script fetches it at runtime:

```sh
#!/bin/sh
NYT_S_COOKIE=$(aws ssm get-parameter --name /crossword/nyt-s-cookie --with-decryption --query Parameter.Value --output text)
exec /app/crossword --nyt-cookie "$NYT_S_COOKIE" ...
```

Secret never baked into image or visible in task definition environment variables.

### Data Pipeline

The `~/crossword` Rust crate handles incremental fetching (uses existing CSV as cache).
Container needs a small wrapper to:
1. Pull existing `crossword-stats.json` from S3
2. Run the Rust binary (incremental fetch, appends new records)
3. Convert CSV → JSON matching the schema below
4. Write updated JSON back to S3

### Front-end

- New page at `/crossword`
- Astro component with `client:load`, fetches JSON from S3
- Chart library: **Observable Plot** (lightweight, D3-based, good for stats viz)
- Charts:
  - Rolling average of solve times over time (line chart)
  - Solve time by day of week (box plot or scatter with recency color coding)

### Status: Planning

---

