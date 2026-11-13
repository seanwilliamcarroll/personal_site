# The development container

Installing an npm package runs code on the machine that installs it, and
so does building, testing or serving the site: hundreds of packages'
code, any of which could be hijacked. So npm and everything it runs work
inside a container that can see this repository and nothing else of
yours. Git, `gh`, `aws`, your editor and Claude Code stay on the Mac.

| On the Mac | In the container (`./dc …`) |
|---|---|
| `git`, `gh`, `aws` | `npm ci`, `npm install`, `npm outdated`, `npm audit` |
| your editor, Claude Code | `npm run build`, `lint`, `format`, `test:demos`, `check:og` |
| a browser at `http://localhost:4321` | `npm run dev`, `npm run preview` (the server) |
| `colima start` / `stop` | Node 24, Chromium for the tests |

The container sees `/work` (this folder), `node_modules` and npm's cache
(two Docker volumes, not on the Mac's disk), and the network (to fetch
packages). Not `~/.ssh`, `~/.aws`, `~/.gitconfig`, or any login.

## How it's built

- **Colima** runs Docker in a small Linux VM (the Mac can't run Linux
  containers itself). This site has its own VM, the `site` profile,
  which mounts **only this repository**: if something escaped the
  container, the VM it would land in can't see the rest of your home
  folder either. (Colima's default VM mounts all of `~`.)
- **`container/Dockerfile`**: Node 24 (as `.nvmrc`), pinned by digest,
  plus Playwright's Chromium at the version in `package-lock.json`. Runs
  as the unprivileged `node` user.
- **`./dc`** runs one command in it: builds the image if the Dockerfile
  or Playwright's version changed (seconds otherwise), mounts the
  folder and volumes, and passes through `CI` and `PUBLIC_SHOW_DRAFTS`.

## Once

```sh
sudo port install colima docker
colima start --profile site --cpu 4 --memory 4 --mount ~/personal_site:w
./dc npm ci
sh install-hooks.sh          # the hooks run through ./dc too
```

The first `./dc` builds the image (a minute: it downloads Chromium).

The `node_modules` folder an earlier `npm ci` left on the Mac isn't used
by anything now, but an editor's ESLint or Prettier extension would still
run code from it on the Mac: delete it (`rm -rf node_modules`). Your
editor then can't find the packages' types (the container's copy is in a
volume); see "Editors" below.

## Every day

```sh
colima start --profile site            # after a restart of the Mac
./dc -p 4321 npm run dev -- --host     # http://localhost:4321, reloads on save
./dc npm run test:demos
./dc npm install some-package          # the .npmrc guards apply here too
```

- `-p PORT` publishes a port to this Mac only (`127.0.0.1`), not the
  network. `--host` makes the server listen on the container's network,
  which the port is published from.
- **Reloading on save** works by polling (`astro.config.ts`, when
  `SITE_CONTAINER` is set): edits on the Mac don't reach the container
  as file events, even with Colima's experimental `--mount-inotify`
  (tried).
- **The git hooks** call `./dc`: with the VM stopped, a commit fails with
  "Start it: colima start --profile site".
- `colima stop --profile site` frees its 4 GB when you're done.

## Starting over

```sh
docker volume rm personal-site-node-modules personal-site-npm-cache
./dc npm ci
```

## Upgrading

- **Node:** the `FROM` line in `container/Dockerfile` (tag and digest
  together: `docker pull node:24.x.y-bookworm-slim`, then
  `docker image inspect --format '{{index .RepoDigests 0}}' …`), and
  `.nvmrc` to match.
- **Playwright:** `./dc npm install -D @playwright/test@…`; the next
  `./dc` rebuilds the image with the matching Chromium.

## Editors

The packages live in the container, so an editor on the Mac sees no
`node_modules`: no types for imports, no ESLint or Prettier extension.
`./dc npm run lint` and `./dc npm run format` still work, and the hooks
run both. For full editor support, VS Code's Dev Containers extension
can open this folder inside the container (not set up yet).

## Not covered

- **CI and Amplify** build on their own machines, unaffected.
  CI's `container` job builds this image and runs the build in it, so
  it can't quietly stop working.
- The physics repository (its npm use is TypeScript alone, and its Rust
  builds have the same kind of exposure through crates' build scripts):
  not containerised yet.

## If Docker complains about credentials

`error getting credentials … docker-credential-desktop`: `~/.docker/config.json`
still names Docker Desktop's credential helper (`"credsStore": "desktop"`)
after Docker Desktop was removed. Delete that line (with no saved logins
there, nothing is lost).
