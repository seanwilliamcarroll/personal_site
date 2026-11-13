# The site's development container (CONTAINER.md). npm, Node, the dev
# server and the browser tests run in here; git, gh, aws and your editor
# stay on the Mac. It sees only this repository (mounted at /work) and
# two Docker volumes (node_modules and npm's cache): not ~/.ssh, ~/.aws or
# any login.

# Node 24 as .nvmrc says, the exact release, pinned by digest (a tag can
# be moved). Bump both together.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

# Chromium for the demo tests, with the system libraries it needs, at
# the Playwright version in package-lock.json (`./dc` passes it).
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# astro.config.ts: watch files by polling (edits on the Mac don't arrive
# as file events).
ENV SITE_CONTAINER=1
RUN test -n "$PLAYWRIGHT_VERSION" \
    && npx --yes "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium \
    && rm -rf /root/.npm /var/lib/apt/lists/*

# The volumes start from what the image has here: owned by `node`, the
# unprivileged user everything runs as.
RUN mkdir -p /work/node_modules /home/node/.npm \
    && chown node:node /work/node_modules /home/node/.npm
USER node
WORKDIR /work
