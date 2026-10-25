# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What GigsNano is

GigsNano v2 is a project/product-management app — a lighter alternative to Plane/Jira — whose differentiator is that it embeds **specialized AI agents** (Analyst, Product Manager, Architect, Scrum Master, Developer, UI/UX Architect, Test Engineer) directly into an agile workflow. The core product loop:

- Creating a new project auto-generates a **Sprint-0** whose kanban cards are opinionated, ready-made **BMAD-method** steps.
- The user lands on the Sprint-0 board; clicking a card opens an **AI chat interface** (built with `@assistant-ui/react` + the AI SDK) where the owning BMAD agent helps complete that step.
- Completing a card **unlocks the next** per the BMAD dependency graph. By the end of Sprint-0, BMAD has produced the project brief, PRD, architecture, epics, stories, and sprint plan.
- Two entry flows at project creation: **Fresh project** (greenfield) and **Documenting an existing project** (brownfield).
- Generated documents render in a rich, review-friendly interface (select a block → comment → assign to a teammate or an AI agent). Later, the user connects GitHub and syncs the generated docs to a new repo.

Feature scope mirrors Plane: onboarding, create workspace, create project, sprints/cycles, kanban boards, project progress dashboards, settings.

## Read these first

The authoritative architecture and workflow specs live in `docs/base-guides/`. **Read the relevant one before doing structural or workflow work** — this file only summarizes them:

- **`docs/base-guides/plane-architecture-guide.md`** — folder structure, App Router route-group tree, the three-layer separation, persistent-layout conventions, and the EmptyState pattern, all derived from a direct study of `makeplane/plane`. This is the source of truth for *where code goes*.
- **`docs/base-guides/bmad-workflow-guide.md`** — the BMAD phase/agent/artifact map, the strict unlock dependencies, greenfield vs brownfield flows, and the concrete Sprint-0 blueprint (card → workflow → owning agent → artifact → what it unlocks). This is the source of truth for *the Sprint-0 sequence and task-unlock logic*.

## Stack & commands

- **Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · pnpm.** React Compiler is enabled (`next.config.ts` → `reactCompiler: true`) — do not hand-add `useMemo`/`useCallback` where the compiler already handles memoization.
- This app is `apps/web` in the monorepo; the pnpm workspace root is the repo root (`pnpm-workspace.yaml`: `apps/web`, `packages/core`, `packages/gigsnano-mcp`). Run commands from the repo root.

```bash
pnpm --filter @gigsnano/web dev          # next dev on :3000
pnpm --filter @gigsnano/web build        # next build
pnpm --filter @gigsnano/web test         # vitest run — whole suite (*.test.ts[x] colocated under src/)
pnpm --filter @gigsnano/web test mock-fallback   # one file/pattern
pnpm --filter @gigsnano/web doctor       # full react-doctor scan
pnpm --filter @gigsnano/core test        # shared core (types, API client, briefing rules, tokens)
pnpm --filter @gigsnano/mcp test          # MCP server package (also: build, start)
docker build -f apps/web/Dockerfile .    # production image (build from repo root)
```

Backend: `apps/api` (see `apps/api/CLAUDE.md`); run it with `uv run uvicorn gigsnano_api.app:app --reload --port 8020` from `apps/api`, or `docker compose up` from the repo root for the whole stack.

There is **no ESLint/Prettier** — react-doctor (oxlint-based) is the only lint gate, and CI is `.github/workflows/react-doctor.yml`. Tests are vitest + Testing Library (`vitest.config.ts`, jsdom). Pure logic (`lib/`, `constants/`, store selectors, `services/mock-fallback.ts`) is where the tests live; there is no e2e runner.

Path alias: `@/* → ./src/*` (`tsconfig.json`). Use it for all cross-folder imports; never use deep relative paths across layers.

## Architecture: three layers (non-negotiable separation)

Every feature is split across three layers with matching folder boundaries under `src/` (see the Plane guide for full detail and examples):

- **Data layer** — `src/types/` (API contract) → `src/services/` (API classes extending a shared `APIService`) → `src/hooks/` (TanStack Query hooks + `query-keys.ts`) → components. **Components never call `fetch` or a service directly** — they call a hook. Plane's MobX `store → hooks/store` tier is **deliberately not replicated**: server state is TanStack Query, and `src/store/` holds **only** `ui/` (Zustand, pure client UI state — pane open/closed, view prefs). There is no `root.store.ts` and no `hooks/store/`; don't create them.
  - **Backend is external + mock-first.** GigsNano is frontend-only; the backend is a **separate Python service** consumed over HTTP. Until it exists, services are fed by **file-based mock data** (`src/mocks/`) hidden *below* the service boundary — stores/hooks/components are written against the real Python API contract and don't change at cutover. Fixtures must match the Python API response shapes; keep `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_USE_MOCKS` in env so switching is config, not code. See §4 "Data source" of the Plane guide.
- **Layout layer** — `src/components/layout/` (sidebar, header, content-wrapper, settings-nav) mounted from `layout.tsx` files. Shared chrome must mount **once** and persist across navigation. Sidebar/header live in a persistent `layout.tsx` so they never remount — **avoiding layout shift is a hard requirement.**
- **Presentation layer** — `src/components/<feature>/` composed inside **thin** `page.tsx` files. A `page.tsx` reads store hooks and composes presentation components; it holds no data-fetching or business logic.

### Folder conventions (enterprise layout)

Large features use **2–3 levels** of subfolders (mirroring Plane). 

- **`components/<feature>/`** — split by responsibility: e.g. `issues/detail/widgets/`, `issues/detail/properties/`, `settings/workspace/`, `settings/project/`, `charts/primitives/`. No hooks in `components/` — data hooks live in `src/hooks/`.
- **`hooks/`**, **`types/`**, **`services/`** — group by domain (`story/`, `project/`, `workspace/`, …); keep `hooks/query-keys.ts` at root.
- **`lib/`** — pure helpers grouped by domain (`lib/format/`, `lib/issues/`, `lib/bmad/`); `utils.ts` stays at root.
- **`mocks/`** — fixtures in `data/`, route handlers in `handlers/`.
- **`board/`** — `pickers/`, `filters/`, `kanban/`, `sprint/`, `story/` + `index.ts` barrel; BMAD-specific UI stays here (issues/shared has work-items pickers).
- **Barrel files** (`index.ts`) at domain boundaries when they reduce import churn; prefer `@/` path alias over deep relative imports across layers.

### Shared core and the mobile app

- `packages/core` (`@gigsnano/core`, published to npm) holds what web and the (separately maintained) mobile app share: domain types, the HTTP client (`createApiClient`), briefing display rules and the brand tokens. It must never import React, React Native, TanStack or Next — web and Expo run different React versions.
- Web reaches core through the tsconfig alias `@gigsnano/core` (source alias, so web always builds against the in-repo core). `src/types/**` files for shared domains are named re-export shims — edit the type in `packages/core/src/types/`.
- Brand colours live in `src/app/globals.css`; `packages/core/src/theme/tokens.ts` mirrors them verbatim and a parity test fails on drift. Change both together.

## Code quality: DRY & SOLID

Write for maintainability. These are enforced expectations, not aspirations:

- **Single responsibility per unit.** Split by responsibility, not by layer. Example: the breadcrumb is four units — dumb primitives (`components/ui/breadcrumb.tsx`), pure route derivation (`hooks/use-breadcrumbs.ts`), label data (`constants/route-labels.ts`), and smart composition (`components/layout/breadcrumbs.tsx`). Each is understandable and changeable in isolation.
- **DRY cross-cutting UI.** Anything that appears on many routes (breadcrumb, secondary header, empty states) lives in exactly one shared component and is consumed identically. Pages never re-implement it.
- **Thin pages.** A `page.tsx` is a thin (often server) component that reads `params` and mounts one client container. Data/view/business logic lives below it, never in the page.
- **Open/closed data seams.** Mock/curated data (e.g. the cover gallery) is a typed constant with a stable shape so a real source can replace it without touching consumers — the same principle as the `service → store → hook` boundary.
- **YAGNI.** Don't add fields, views, or abstractions until a feature needs them.

## Routing conventions

Route structure follows Plane's proven groups (full proposed tree in the Plane guide). Key rules:

- **Route groups `(name)`** carry zero URL segments but attach a layout + group siblings. Planned groups: `(marketing)`, `(auth)`, `(app)` (authenticated shell), and under `[workspaceSlug]` two sibling shells — `(dashboard)` (persistent app sidebar) and `(settings)` (two-pane settings). Two sibling groups under the same slug let settings use a different shell without changing the URL prefix.
- **Dynamic segments express hierarchy:** `[workspaceSlug]` → `[projectId]` → `[cycleId]`/`[moduleId]`.
- **Fixed per-folder file vocabulary:** `page.tsx`, `layout.tsx`, `header.tsx`, `mobile-header.tsx`. Each feature folder gets its own `layout.tsx` rendering only its header + a content wrapper.
- Auth + workspace-data gating lives in `[workspaceSlug]/layout.tsx` so inner routes can assume data exists.

## EmptyState is a first-class, shared component

**Every route that can be empty renders one reusable `<EmptyState/>`** (`src/components/empty-state/`), and **every EmptyState carries at least one action** telling the user the next step (Plane-style). Illustrations are code (React SVG components resolved via a typed `assetKey` → asset-registry), not inline `<img>` per route. Copy (title/description/CTA) lives in `src/constants/` keyed by feature. See the EmptyState section of the Plane guide for the recommended props API.

## BMAD Sprint-0 (product logic, not just UI)

When encoding Sprint-0 cards and unlock logic, follow the blueprint tables in the BMAD guide. Non-negotiable unlock dependencies:

- `architecture` requires `prd`; `create-epics-and-stories` requires **both** `prd` + `architecture`; `sprint-planning` requires epics — enforce these as blocking edges.
- The UX card is conditional on a **"Has UI?"** flag set at project creation.
- The implementation-readiness gate returns **PASS / CONCERNS / FAIL**; only PASS unlocks Sprint Planning.
- Each card opens its own agent chat thread pre-loaded with prior artifacts as context (mirrors BMAD's "fresh chat per workflow").

Note two roster caveats captured in the guide: BMAD v6 has **no standalone Scrum Master** (its workflows live under the Developer agent) and **no dedicated Test Engineer** in the base module. GigsNano may still present these as distinct UI personas, but wire them to the correct underlying workflows.

## Design & UI workflow

If you have these Claude Code skills installed, use them for new or reshaped UI:

- **`/emil-design-eng`** — component design, polish, and the invisible details.
- **`/transitions-dev`** — production-ready CSS transitions (open/close, page transitions, staggered reveals, etc.).

Enterprise-grade, no-layout-shift experience is a primary goal: reusable layout components shared across routes, consistent EmptyStates, and intentional transitions.

## React rules enforcement (react-doctor)

React quality is enforced by **react-doctor** (oxlint-based), wired into the loop so violations are caught at write time, not discovered later:

- **Agent hook** (`.claude/hooks/react-doctor.mjs`, `PostToolBatch`) runs `react-doctor --scope changed` after every edit batch and feeds new findings back — **when you touch React code, fix the findings it reports before finishing** (create a GitHub issue only for ones you genuinely can't fix now).
- **Pre-commit hook** (`react-doctor --staged`) and **CI** (`.github/workflows/react-doctor.yml`, `blocking: error`) gate on the same rules. All three gates are **scope-changed — they only flag NEW issues vs. the base**, so the intentional pre-existing residue never blocks; only regressions you introduce do. Run a full scan anytime with `pnpm doctor`.

**Write code that doesn't trip these (the ones we always fix):**
- No accessing a **ref's `.current` during render** (write refs in effects/handlers); no **`setState` synchronously in an effect** body (derive during render, use a `useState` initializer, adjust-state via a `prev`-prop compare, or `key`-remount the child); no `try {} finally {}` **without a `catch`** (React Compiler can't lower it — use a `.finally()` promise chain).
- **Don't hand-add `useMemo`/`useCallback`/`memo`** — React Compiler memoizes (project-wide rule). Add `aria-label`/`htmlFor` to controls; use semantic tags (`<hr>`, `<nav>`) over `role=`; `useMutation` should `invalidateQueries` in `onSuccess`; `Promise.all` independent awaits; `flatMap` over `.map().filter(Boolean)`; stable `key`s (not array index); wrap `useSearchParams` readers in `<Suspense>`.

**Intentional residue — do NOT "fix" these (they're deliberate / false positives):** `src/components/charts/**` is vendored (@bklit) — never edit; shadcn `src/components/ui/**` conventions (`no-multi-comp`, `only-export-components`, variant `unused-export`, base-`Label`); intentional `autoFocus` on search/command inputs; client-side auth/route-guard redirects; architectural rules (`no-giant-component`, `prefer-useReducer`, `no-many-boolean-props`); in `packages/mobile`: high-complexity screens, the sign-in `setBusy(false)`-only-on-error flag, and the small horizontal avatar `ScrollView` map; and documented FPs (shiki sanitized-HTML sink, PDF-preview iframe sandbox, user-upload `<img>`, `types/docs/page.ts` "missing metadata"). Encode any new skip decision here, not with scattered inline disables. Note: an `eslint-disable ... react-hooks/exhaustive-deps` comment does NOT silence `react-doctor/exhaustive-deps` — oxlint needs the react-doctor rule name too.

## Naming conventions

- Folders `kebab-case`; route groups `(kebab-case)`; dynamic segments `[camelCase]`.
- Services: `<domain>.service.ts` → `class <Domain>Service extends APIService`, exported as a singleton.
- Data hooks: `hooks/use-<domain>.ts` → `use<Domain>()` / `useCreate<Domain>()`; keys in `hooks/query-keys.ts`.
- UI stores (Zustand, client state only): `store/ui/<thing>.store.ts` → `use<Thing>Store()`.
- Feature components: `components/<feature>/<thing>.tsx`.
- Tests: `<subject>.test.ts[x]` colocated beside the file it covers.
- Types: interfaces prefixed `I`, enums prefixed `E`.

## Feature map

A large app on a live backend. Treat this as a map, not as truth — verify against the code.

- **Mock seam:** `src/services/mock-fallback.ts` (`shouldUseMock`) is the single mock-vs-real decision. `NEXT_PUBLIC_USE_MOCKS=false` sends covered domains to the API at `NEXT_PUBLIC_API_BASE_URL`; `MOCK_SEGMENTS` / `MOCK_ONLY_RULES` keep not-yet-backed endpoints on fixtures in `src/mocks/`. Remove a rule the moment its backend ships.
- **Reference feature to copy:** projects — `services/project.service.ts` → `hooks/use-projects.ts` → `components/projects/projects-list.tsx` → `projects/page.tsx`.
- **Sprint-0 board:** `components/board/sprint-board.tsx`; cards open `board/story-chat.tsx`, which streams the backend SSE thread endpoint (assistant-ui).
- **Nav:** Rail A / Rail B (`components/layout/app-rail.tsx`, `app-panel.tsx`); Rail B drills into a project (`panel/project-panel-nav.tsx`).
- **Work items:** `components/issues/issues-view.tsx` (list / kanban / calendar / spreadsheet / gantt), view state in `store/ui/issues-view.store.ts`.
- **Editor:** `@/components/editor` — headless TipTap v3 (`RichEditor`, slash menu, bubble menu).
- **GigsAI pane:** `components/ai/ai-pane.tsx` + `gigs-ai-chat.tsx` (live), full page at `/[workspaceSlug]/gigs-ai`.
- **Marketplace:** `(marketplace)` route group with its own top-nav shell.
- **Admin:** `(admin)` shell incl. `/admin/llm-usage`, gated by `EPrivilege.UsageRead`.
- **Auth:** cookie session from the backend; Google sign-in needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (build-time) to equal the backend's `GOOGLE_CLIENT_ID`, and the serving origin must be an authorized JavaScript origin of that OAuth client. The button hides when unset.
