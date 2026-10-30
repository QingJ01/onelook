# Workbench setup, privacy, and development

## Local setup

The workbench uses the existing OneLook frontend and a small Node.js service.
Use Node.js 18 or newer and pnpm:

```sh
pnpm install
pnpm setup:archify
```

`setup:archify` fetches the Archify repository at commit
`f325d86230553e1dd15d3464324f1fcd01f02352` into the ignored
`.cache/archify` directory. It checks the commit before accepting the checkout
and does not overwrite an existing unpinned directory. To use a durable source
checkout instead, set `ARCHIFY_ROOT` to its repository root. This setup is for
the local CLI renderer only; it does not install an Archify Skill or modify any
global agent configuration.

For development, start the API and frontend separately:

```sh
pnpm start
pnpm dev
```

The API listens on `127.0.0.1:3001`; Vite listens on `localhost:3000` and proxies
`/api` to that local service. For a standalone build:

```sh
pnpm build
npm start
```

The same Node process serves the built `dist` files and the API. `PORT` may
change the local port, but the service remains bound to loopback. Do not expose
it through a public interface or an unprotected reverse proxy.

## Storage and privacy

- The classic editor continues to use its unchanged `OneLookDB` version-1
  database. Workspaces and their revisions use a separate `OneLookWorkbench`
  Dexie database. There is no destructive migration.
- Workspace data, sources, edits, attempts, and revision history remain in the
  browser's IndexedDB. Invalid data is rejected before it can replace a saved
  workspace; the API validates the same structured contract.
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
  model-generated JavaScript, and it does not ingest PDFs or whole repositories
  in this iteration.

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
Vite production build; no full UI test or project-wide lint migration is
configured by this work.
