# Workbench setup, privacy, and development

## Local setup

The workbench uses the existing OneLook frontend and a small Node.js service.
The declared compatibility floors are Node.js 18 and pnpm 8; compatibility
across the full ranges has not been verified. The workbench was verified with
Node.js 24.21.0 and pnpm 12.8.1:

```sh
pnpm install
pnpm setup:archify
```

`setup:archify` fetches the Archify repository at commit
`f325d86230553e1dd15d3464324f1fcd01f02352` into the ignored
`.cache/archify` directory. It checks the commit before accepting the checkout
and does not overwrite an existing unpinned directory. To use a durable source
checkout instead, set `ARCHIFY_ROOT` to its repository root; its Git `HEAD`
must match the same pinned commit. This setup is for the local CLI renderer
only; it does not install an Archify Skill or modify any global agent
configuration.

For development, start both local processes together:

```sh
pnpm dev:all
```

The API listens on `127.0.0.1:3001`; Vite listens on `localhost:3000` and proxies
`/api` to that local service. `pnpm local` performs a frozen install, pinned
Archify setup, production build, and starts the local production server on port
3000 by default; `PORT` can override it. It does not open a browser.

```sh
pnpm local
```

Open `http://localhost:3000`. When starting a built server manually with
`pnpm start`, its default is `http://localhost:3001`.

Browser storage is scoped to the exact origin (scheme, hostname, and port).
For example, `localhost:3000` and `127.0.0.1:3000` are separate stores. Use
workspace export/import to move data between origins; never assume a host or
port change carries data over.

The same Node process serves the built `dist` files and the API. `PORT` may
change the local port, but the service remains bound to loopback. Do not expose
it through a public interface or an unprotected reverse proxy.

## Storage and privacy

- The classic editor continues to use its unchanged `OneLookDB` version-1
  database. Workspaces and their revisions use a separate `OneLookWorkbench`
  Dexie database. There is no destructive migration.
- Workspace data, sources, edits, attempts, and revision history remain in the
  browser's IndexedDB. Invalid data is rejected before it can replace a saved
  workspace; the API validates the same structured contract. Canonical
  workspaces are limited to 20 MiB of UTF-8 JSON, and each source retains at
  most 50 older versions. A Dexie v1 workbench upgrade stores each raw legacy
  workspace in a separate migration-backups table before conversion; a failed
  conversion rolls back the database upgrade. Backups survive workspace
  deletion and should be exported before clearing browser data.
- Saves use compare-and-swap revisions. A stale edit or deletion raises a
  conflict instead of overwriting newer work. Revision snapshots are capped
  at 20 per workspace; migration backups are not part of that cap.
- File reading is local-only: supported plain text is limited to 1 MiB and
  PDFs to 10 MiB, 200 pages, and 300,000 extracted characters. Encrypted,
  scanned-empty, malformed, and binary inputs are rejected. No file bytes are
  uploaded by the reader.
- AI is optional. The user supplies an OpenAI-compatible HTTPS base URL, model,
  and API key. The key is held by the current page session and sent in the
  request to the loopback service; it is not stored in IndexedDB, local
  storage, server files, logs, or responses.
- AI requests are opt-in and disclose the current workspace/source context to
  the selected provider. Generation and explanation have no fabricated
  fallback response. Invalid provider content is rejected.
- The server defaults to the single allowed host `api.openai.com`. To permit
  another provider, set a comma-separated list of exact hostnames when starting
  the server, for example:

  ```sh
  AI_ALLOWED_HOSTS=api.openai.com,ai.example.com pnpm start
  ```

  The submitted base URL must use HTTPS and a hostname in that list. Redirects
  are disabled, so credentials are not forwarded to a redirect target. Only
  configure hosts you trust; custom host allowlisting is an operator decision.
- Server request bodies, provider responses, render output, render time, and
  active work are bounded. The service does not execute workspace or
  model-generated JavaScript, and it does not ingest whole repositories.

## Archify rendering and attribution

The adapter validates the workspace, maps its authored nodes and relationships
to Archify IR, then calls the pinned upstream CLI's `finalize` command to run
its real validation, rendering, and delivery path in a temporary job directory.
The directory is removed after success or failure. Architecture workspaces use
an architecture diagram, product workspaces use workflow, and courses use a
tree only when their prerequisite relations form a rooted tree; other course
graphs use architecture as a general relationship diagram. Existing directed
edges are preserved rather than inferred. A render is limited to 60 nodes.

The upstream project is maintained independently and does not endorse OneLook.
Its license, historical MIT grant, `NOTICE`, and third-party notices are served
from `public/third-party/archify/` and copied from the same pinned source during
development. Archify's generated HTML also retains its upstream delivery
notices and asset licenses.

## Verification

The GitHub Actions workbench workflow runs on pull requests and pushes to
`main` or `master`. It uses Node.js 24 and pnpm 12.8.1 and runs:

```sh
pnpm install --frozen-lockfile
pnpm setup:archify
pnpm test
pnpm build
```

Run the focused workbench suite:

```sh
pnpm test
```

Run an individual suite when iterating:

```sh
pnpm exec vitest run test/workbench/model.test.ts
pnpm exec vitest run test/workbench/storage.test.ts
pnpm exec vitest run test/workbench/server.test.ts
pnpm exec vitest run test/workbench/api.test.ts
```

The Archify integration test is skipped when no source checkout is configured.
After `pnpm setup:archify`, it exercises all three example workspaces using the
actual CLI. A durable checkout can be selected explicitly:

```sh
ARCHIFY_ROOT=/path/to/archify pnpm exec vitest run test/workbench/archify.test.ts
```

The suite includes domain validation and review timing, revision persistence
and restore, a legacy database compatibility smoke test, same-origin/API
security checks with a labeled mock provider, and actual Archify validation,
rendering, and delivery. It does not make a live paid AI request or claim
browser/UI visual acceptance. `pnpm build` runs the repository TypeScript and
Vite production build. No project-wide lint command is configured.

Browser regressions run with `pnpm test:e2e:install` then `pnpm test:e2e`.
The runner starts `pnpm dev:all` when needed and covers Chromium and WebKit at
375, 768 and 1440 pixels. CI installs browsers with system dependencies before
running the same suite. `E2E_BASE_URL=http://localhost:3002 pnpm test:e2e
--project=chromium-1440` targets an already running production server instead.
AI cases use explicitly controlled responses; these do not validate a live
paid model. Viewports and WebKit automation are not physical-device tests.
