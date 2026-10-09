# Fork log

What this fork changed compared with upstream
[`vespassassina/ha-floorplan-studio`](https://github.com/vespassassina/ha-floorplan-studio).
Newest first. Add an entry with every change that upstream does not have.

**Forked from:** upstream `main` at `27fb096` (release 0.20.0, 2026-10-07).
**Last synced:** upstream `main` at `05a5e8a` (release 0.22.1, 2026-10-09).

To see the full difference at any time:

```bash
git remote add upstream https://github.com/vespassassina/ha-floorplan-studio.git  # once
git fetch upstream
git log --oneline upstream/main..HEAD   # our commits
git diff upstream/main --stat           # files we changed
```

## 2026-10-09: Furniture parts in 3D (branch `task/furniture-parts`)

- 3D view draws table, sofa, bed, chair, sink, toilet, bathtub and car as a few boxes each instead of one block (`src/core/furniture-parts.ts`, `src/core/scene-build.ts`). 2.5D unchanged.

## 2026-10-09: Sync with upstream 0.22.1 (branch `task/upstream-sync`)

Merged upstream `05a5e8a`. Every conflict was in a file this fork had only
reformatted, so upstream's side was taken and `task fix` re-ran oxfmt.
Two upstream build scripts needed APIs our toolchain no longer has:

- `scripts/minify-output.mjs` called Vite's `transformWithEsbuild`, which
  Vite 8 dropped. It now calls oxc's `minify` (re-exported by Vite) with
  compress and mangle off: whitespace and non-legal comments only, as before.
- `scripts/strip-css-comments.mjs` and `tests/card/size-budget.spec.ts` parse
  source with the TypeScript compiler API, which TypeScript 7 (native) does
  not ship. They import `typescript-api`, an npm alias for TypeScript 5.9.
  Both packages install a `tsc` bin, so `npm run typecheck` calls
  `node_modules/typescript/bin/tsc` (7.x) by path.

## 2026-10-08: Modern dev workflow (branch `task/dev-workflow`)

**Safety**
- Removed the "Release ends on Diego's HA" section from `CLAUDE.md`. It told
  AI agents to refresh HACS, install an update and restart the upstream
  maintainer's Home Assistant.

**Python (uv)**
- `pyproject.toml` + `uv.lock` replace `requirements_test.txt`. `uv sync`
  sets up everything; Python 3.14.
- Test harness pinned to `pytest-homeassistant-custom-component==0.13.367`
  (Home Assistant 2026.9.4, the newest stable; later builds track betas), and
  `home-assistant-frontend` to the version that HA release needs.
- ruff (lint + format) and ty (type check) added; Python code formatted.
  One type fix: `panel.py` passes `str(version)` to `_card_url`.

**Web**
- Vite 5 → 8, Vitest 2 → 5, TypeScript 5 → 7, jsdom 25 → 30,
  Playwright 1.64, Node 24 (`.nvmrc`). Lockfile regenerated. Bundles are
  smaller with Vite 8: card −17 %, panel −12 %, 3D chunk −24 %, editor −3 %.
- ESLint → oxlint (`.oxlintrc.json`, correctness rules). oxfmt formats
  TS/JS/JSON/YAML/HTML (`.oxfmtrc.json`, width 120); whole repo formatted once
  (in `.git-blame-ignore-revs`).
  Lit `html`` ` templates and `src/core/schema.ts` are not formatted
  (template whitespace changed rendered labels; schema.ts feeds `docs/schema.md`).
- Playwright runs `fullyParallel`: 15.6 → ~4 minutes, same 1237 tests passing.
- `scripts/validate-layout.mjs` uses Vite's `build()` instead of esbuild
  (esbuild only came in through Vite 5).
- Two test-only fixes for the new tools: a typed spy in
  `tests/core/debug-once.test.ts`, `1e999` → `Infinity` in
  `tests/card/card-3d-perf.spec.ts`.

**Workflow**
- `.pre-commit-config.yaml`, run by prek: gitleaks, basic file checks,
  actionlint, ruff, ty, oxlint, oxfmt, tsc. Install with `task hooks`.
  GitHub Actions use version tags, not SHA pins (kept simple on purpose).
- `Taskfile.yml`: `task setup`, `task check`, `task fix`, `task test:e2e`,
  `task build`, `task dev`, `task shots`.
- CI uses the same commands as the Taskfile, adds a job that runs every hook,
  uses uv for Python, and reads the Node version from `.nvmrc`.
- `.editorconfig`, `.gitattributes`; devcontainer on Python 3.14 + Node 24
  with uv.
- README, CONTRIBUTING, `docs/WORKFLOW.md` and `CLAUDE.md` command lists
  updated.
