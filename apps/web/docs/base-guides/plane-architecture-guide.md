# Plane Architecture Guide → GigsNano v2 Folder & Routing Blueprint

A practical guideline for structuring the GigsNano v2 Next.js 16 (App Router) app,
derived from a direct study of the [Plane](https://github.com/makeplane/plane) monorepo
(`makeplane/plane`, shallow-cloned and inspected file-by-file). Paths cited as
`plane/...` are real paths in that repo.

> **Scope:** GigsNano is **frontend-only** — we mirror just Plane's `apps/web`. The
> GigsNano backend is a **separate Python service in its own repo**, consumed over HTTP.
> To build all screens before that backend is ready, the data layer targets the Python API
> contract but is currently fed by **file-based mock data** (see §4). Everything above the
> service boundary is written as if the real API already exists.

> Important note about Plane's current web app: the `apps/web` app has **migrated off
> Next.js to React Router v7 (Vite/Remix-style file routing)**. It still uses the exact
> same *conventions* that map 1:1 to the Next.js App Router — route-group folders in
> parens `(group)`, dynamic segments in brackets `[param]`, and per-folder `layout.tsx` /
> `page.tsx` files. Everything in this guide is translated into **Next.js 16 App Router**
> terms for GigsNano. Where Plane uses React Router's `<Outlet />`, Next.js uses the
> `children` prop of a `layout.tsx`.

---

## 1. Overview — Plane's architecture and what we borrow

Plane is a **pnpm + turbo monorepo**:

```
plane/
  apps/        web, admin, space, live, api (Django), proxy
  packages/    ui, propel, services, types, constants, i18n, hooks,
               utils, editor, shared-state, logger, decorators,
               tailwind-config, typescript-config, codemods, propel
```

The web app (`plane/apps/web`) is organized around a strict **three-layer separation**
that we adopt wholesale:

- **Data layer** — `core/services` (API classes) → `core/store` (MobX stores) →
  `core/hooks/store` (context accessors). Components never call `fetch` directly.
- **Layout layer** — nested `layout.tsx` files + a small set of reusable shell
  components (`app-header`, `content-wrapper`, `sidebar/*`) that persist across route
  changes, so the sidebar/header never remount (no layout shift).
- **Presentation layer** — feature component folders under `core/components/<feature>`
  (cycles, modules, issues, project, onboarding, settings, empty-state, …). `page.tsx`
  files are thin: they read from store hooks and compose presentation components.

What we borrow for GigsNano:
1. Route-group + dynamic-segment tree for workspace → project → cycle/module nesting.
2. The service → store → hook data pipeline (we can swap MobX for lighter state; see §4).
3. Thin `page.tsx`, feature-folder presentation components.
4. The reusable **EmptyState** system with an `assetKey`-driven illustration registry.
5. The community/enterprise **edition split** via a path alias (see §2).

Plane's data path, end to end (real example, `cycles` feature):

```
core/services/cycle.service.ts   class CycleService extends APIService  (raw API calls)
        ↓ used by
core/store/cycle.store.ts         MobX store, registered in root.store.ts
        ↓ exposed via
core/hooks/store/use-cycle.ts     useCycle() = useContext(StoreContext).cycle
        ↓ consumed by
app/.../cycles/(list)/page.tsx    const { currentProjectCycleIds } = useCycle()
```

---

## 2. Monorepo → single-app translation

**GigsNano is frontend-only.** Plane's monorepo bundles both the frontend and its
backend (`apps/api` is a Django service, plus `apps/live`, `apps/proxy`, etc.). GigsNano
takes **only the web-frontend slice** — the equivalent of Plane's `apps/web`. The GigsNano
**backend is a separate Python service in its own repository** and is consumed purely over
HTTP; none of Plane's `apps/api` / `apps/live` / `apps/proxy` code or the Django stack is
relevant here. Ignore everything under Plane's `apps/*` except `apps/web`.

Consequently GigsNano is a **single Next.js app** (`src/`, `@/* → ./src/*`), not a
monorepo. Map the useful `apps/web` package boundaries onto **folder module boundaries**
inside `src/`, and only promote to real packages later if a second frontend app (mobile,
admin) appears. (Backend concerns never live in this repo — they belong to the Python
service.)

| Plane package | Purpose | GigsNano equivalent (single app) |
|---|---|---|
| `packages/ui` | Low-level dumb components (button, badge, header, tabs) | `src/components/ui/` (shadcn already lives here via `components.json`) |
| `packages/propel` | Newer design-system components incl. **EmptyState** + asset registry | fold into `src/components/ui/` or `src/components/empty-state/` |
| `packages/services` | Shared API classes (`APIService` base) | `src/services/` |
| `packages/types` | Shared TS types/enums | `src/types/` |
| `packages/constants` | Endpoints, enums, tracker keys, i18n keys | `src/constants/` |
| `packages/hooks` | Generic reusable hooks | `src/hooks/` (non-store hooks) |
| `packages/utils` | Pure helpers | `src/lib/` or `src/utils/` |
| `packages/i18n` | Translations | `src/i18n/` (only if bilingual is needed) |
| `packages/editor` | Rich-text editor | `src/components/editor/` (defer) |

**Edition split worth stealing:** Plane aliases `@/plane-web/*` → `./ce/*`
(community edition) in `apps/web/tsconfig.json`. Enterprise builds swap that one alias to
a different folder without touching import sites. For GigsNano, keep a single alias
(`@/*`), but if you ever need pro/free variants, replicate this: an alias like
`@/edition/*` pointing at `src/ce/` that can be re-pointed at build time.

**When to introduce real packages:** only when a second consumer exists (e.g. an Expo
mobile app or an `admin` app). At that point, lift `types`, `constants`, `services`, and
`ui` out first — they are the most reused and have the fewest app dependencies.

---

## 3. Routing architecture (App Router)

Plane's route tree (real, from `plane/apps/web/app`):

```
app/
  (home)/                                     marketing / landing (own layout)
  (all)/                                      authenticated shell group
    layout.tsx                                preload + <Outlet/>
    onboarding/            page.tsx layout.tsx
    create-workspace/      page.tsx layout.tsx
    accounts/              forgot-password/ reset-password/ set-password/
    sign-up/  invitations/  workspace-invitations/
    settings/profile/[profileTabId]/          account-level (cross-workspace) settings
    [workspaceSlug]/
      layout.tsx                              auth wrappers + workspace data + sidebar shell
      (projects)/
        layout.tsx                            persistent app sidebar + <main>
        projects/
          (list)/         page.tsx            all projects
          (detail)/[projectId]/
            cycles/   (list)/ (detail)/[cycleId]/
            modules/  (list)/ (detail)/[moduleId]/
            views/    (list)/ (detail)/[viewId]/
            pages/    (list)/ (detail)/[pageId]/
            issues/  intake/  archives/  settings/
        analytics/[tabId]/   active-cycles/   workspace-views/[globalViewId]/
        drafts/  stickies/  notifications/  profile/[userId]/
      (settings)/
        layout.tsx
        settings/
          (workspace)/  members/ billing/ webhooks/[webhookId]/ integrations/ exports/
          projects/[projectId]/  features/ states/ labels/ estimates/ members/ automations/
```

Key observations to copy:
- **Route groups `( )` carry zero URL segments** but attach a layout + group siblings.
  Plane uses `(all)` (auth shell), `(home)` (marketing), `(projects)` and `(settings)`
  (two different shells under the same `[workspaceSlug]`), `(list)`/`(detail)`
  (split a feature into an index layout vs. a detail layout), `(workspace)` (group
  workspace-scoped settings tabs).
- **Dynamic segments** express the hierarchy: `[workspaceSlug]` → `[projectId]` →
  `[cycleId]` / `[moduleId]` / `[viewId]` / `[pageId]`.
- **`(list)` + `(detail)` pattern**: a feature like `cycles` has a `(list)/layout.tsx`
  (list header) and a `(detail)/layout.tsx` (detail header) so the two views have
  different chrome but share the parent project shell.

### Proposed GigsNano route tree

```
src/app/
  layout.tsx                          root: html, providers, StoreProvider, theme
  page.tsx                            redirect → /onboarding or last workspace

  (marketing)/                        public landing (optional)
    layout.tsx
    page.tsx

  (auth)/                             unauthenticated
    layout.tsx                        centered auth shell
    sign-in/page.tsx
    sign-up/page.tsx
    forgot-password/page.tsx

  (app)/                              authenticated shell  ── Plane's (all)
    layout.tsx                        AuthGuard + global providers

    onboarding/page.tsx
    create-workspace/page.tsx
    account/                          cross-workspace user settings
      settings/[tab]/page.tsx

    [workspaceSlug]/
      layout.tsx                      WorkspaceGuard: load workspace data + members

      (dashboard)/                    ── Plane's (projects): persistent sidebar shell
        layout.tsx                    <Sidebar/> + <main>{children}</main>
        page.tsx                      workspace home / dashboard
        projects/
          page.tsx                    all projects (EmptyState if none)
          [projectId]/
            layout.tsx                project header + tabs (persists across sub-routes)
            page.tsx                  project overview / progress dashboard
            board/page.tsx            kanban board
            cycles/
              layout.tsx              cycles list header
              page.tsx                cycles list (EmptyState "cycle")
              [cycleId]/page.tsx      single sprint/cycle
            modules/
              page.tsx
              [moduleId]/page.tsx
            views/page.tsx
        analytics/page.tsx

      (settings)/                     ── Plane's (settings): different shell, same slug
        layout.tsx                    settings two-pane (nav + content)
        settings/
          page.tsx                    general
          members/page.tsx
          billing/page.tsx
          projects/[projectId]/
            page.tsx
            features/page.tsx
            labels/page.tsx
            states/page.tsx
```

Rationale: `(dashboard)` and `(settings)` are **sibling route groups under the same
`[workspaceSlug]`** — exactly Plane's `(projects)` vs `(settings)`. That lets the settings
area use a two-pane layout while the main app uses the sidebar shell, without changing the
URL prefix (`/acme/settings/...` vs `/acme/projects/...`).

---

## 4. The three layers — concrete folder conventions

```
src/
  services/            DATA — API access
    api.service.ts       base class (baseURL, get/post/patch/delete, error unwrap)
    cycle.service.ts     class CycleService extends APIService { ... }
    project.service.ts
    workspace.service.ts

  store/               DATA — client state (see note on MobX below)
    root.store.ts        wires every sub-store together
    cycle.store.ts
    project/             folder when a domain needs several stores
    workspace/

  hooks/
    store/             DATA — typed accessors into the store
      use-cycle.ts       export const useCycle = () => useStore().cycle
      use-project.ts
    use-app-router.ts  generic non-store hooks live one level up

  components/
    ui/                LAYOUT+PRESENTATION primitives (shadcn, buttons, headers)
    layout/            LAYOUT — shells that persist across routes (see §5)
      app-sidebar.tsx
      app-header.tsx
      content-wrapper.tsx
      settings-nav.tsx
    empty-state/       reusable EmptyState + asset registry (see §6)
    cycles/            PRESENTATION — feature components
    projects/
    board/
    onboarding/
    settings/

  types/               shared TS types & enums
  constants/           endpoints, tracker keys, i18n keys, route helpers
  lib/                 pure utils (cn, date, permissions)
```

**Data layer rules (mirrors Plane exactly):**
- Every remote call goes through a service class extending a shared `APIService`
  (Plane: `plane/apps/web/core/services/cycle.service.ts` → `extends APIService`).
- Stores own state and call services; components never import services directly.
- Hooks in `hooks/store/` are one-liners that read the store from context
  (Plane `use-cycle.ts`: `useContext(StoreContext).cycle`, throws if outside provider).

### Data source: Python backend (target) vs. file-based mocks (now)

The backend is a **separate Python service** consumed over HTTP. To build and polish every
screen *before* the backend exists, the data layer is designed against the Python API
contract but is currently fed by **file-based mock data**. The mock is an implementation
detail hidden *below* the service boundary — stores, hooks, and components are written
exactly as they will be for the real API and never change when we cut over.

```
src/
  services/
    api.service.ts        # base HTTP client (baseURL from env, get/post/patch/delete)
    cycle.service.ts      # class CycleService { getCycles(projectId) {...} }  ← API contract
    project.service.ts
  mocks/                  # ONLY the source of fake data — deleted-in-spirit at cutover
    data/                 # static JSON/TS fixtures shaped like the Python API responses
      projects.ts  cycles.ts  workspaces.ts
    handlers/             # functions that resolve a service call against the fixtures
```

**Implemented approach — mock transport in the base client.** `APIService.request()`
checks `USE_MOCKS` (from `NEXT_PUBLIC_USE_MOCKS`, defaults ON) and, when on, lazy-imports
`resolveMock(method, path, body)` from `src/mocks` instead of calling `fetch`. Services are
written *exactly* as for production (`this.get('/workspaces/:slug/projects/')`); the swap
lives in one place. `src/mocks/index.ts` is a path+method → fixture router (regex matchers,
simulated latency, `APIError` on miss) over fixtures in `src/mocks/data/*`. Cutover is
`NEXT_PUBLIC_USE_MOCKS=false` — zero code changes above `fetch`.

> An alternative considered was **MSW** (network-level interception). We chose the
> in-client transport for determinism and zero worker/setup ceremony; the tradeoff is that
> `fetch` itself isn't exercised in the mock path. Revisit MSW if you need to test real
> network/error/header behavior.

**Rules for the mock phase:**
- **Fixtures must match the Python API's response shape** (field names, nesting, types,
  pagination envelope). Define the response types in `src/types/` from the backend's
  OpenAPI/contract and use them for both the mock fixtures and the service return types —
  so screens are built against the real contract, not a convenient fake one.
- **Nothing above the service boundary knows mocks exist.** Stores, `hooks/store/`, and
  components stay identical from mock to production. Cutover should touch only
  `src/services/*`, `src/mocks/*`, and env config.
- Keep `baseURL` and the mocks-on flag in env (`NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_USE_MOCKS`) so switching to the Python backend is a config change, not a
  code change.
- Simulate realistic latency/error/empty states in the mock handlers so loading skeletons
  and **EmptyStates** (see §6) can be verified during screen design.

> **State-management choice for GigsNano (decided).** Plane uses MobX (`mobx-react`,
> `observer()`, a `root.store.ts` composing ~40 stores via `StoreContext`). GigsNano
> instead uses **TanStack Query for server state** — the query cache *is* the store for
> anything from the Python API, and it gives loading/error/empty states for free (pairs
> with §6 EmptyStates). **Zustand** is reserved for pure client/UI state (filters, modal
> open, board drag) and added per-domain only when first needed. The durable pattern is the
> `service → hook → component` boundary (components never touch services/`fetch`), not the
> library. Concrete shape: `src/services/*.service.ts` (extend `APIService`, export a
> singleton) → `src/hooks/use-*.ts` (`useQuery`/`useMutation`, keys from
> `hooks/query-keys.ts`) → thin `page.tsx` mounts a client feature component that calls the
> hook. Provider: `getQueryClient()` in `src/lib/query-client.ts`, mounted via
> `src/app/providers.tsx` in the root layout. **Reference feature: projects.**

**Layout vs Presentation:** if a component renders *chrome that survives navigation*
(sidebar, header, shell, nav rail) it belongs in `components/layout/` and is mounted from
a `layout.tsx`. If it renders *the content of one route* (a cycles grid, a kanban column,
a settings form) it belongs in `components/<feature>/` and is composed inside a `page.tsx`.

---

## 5. Reusable layout components (no layout shift)

Plane nests layouts so shared chrome mounts **once** and stays mounted while inner routes
change. The nesting for a cycle list page (real files):

```
(all)/layout.tsx                     preload resources, robots meta        ← mounts once
  [workspaceSlug]/layout.tsx         AuthenticationWrapper > WorkspaceAuthWrapper
                                     > WorkspaceContentWrapper > GlobalModals  ← data gate
    (projects)/layout.tsx            <ProjectAppSidebar/> + <main>{Outlet}</main>  ← SHELL
      .../cycles/(list)/layout.tsx   <AppHeader header={<CyclesListHeader/>}/>
                                     <ContentWrapper>{Outlet}</ContentWrapper>  ← per-feature header
        .../cycles/(list)/page.tsx   thin page: store hooks + <CyclesView/>
```

The real `(projects)/layout.tsx` (verbatim shape):

```tsx
// plane/apps/web/app/(all)/[workspaceSlug]/(projects)/layout.tsx
<div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border">
  <div className="relative flex size-full overflow-hidden">
    <ProjectAppSidebar />
    <ExtendedProjectSidebar />
    <main className="relative flex h-full w-full flex-col overflow-hidden">
      <Outlet />   {/* Next.js: {children} */}
    </main>
  </div>
</div>
```

The per-feature layout (real `cycles/(list)/layout.tsx`):

```tsx
<AppHeader header={<CyclesListHeader />} mobileHeader={<CyclesListMobileHeader />} />
<ContentWrapper>
  <Outlet />   {/* Next.js: {children} */}
</ContentWrapper>
```

**Reusable shell pieces** live in `plane/apps/web/core/components/core/` and
`core/components/sidebar/`:
`app-header.tsx`, `content-wrapper.tsx`, `sidebar/resizable-sidebar.tsx`,
`sidebar/sidebar-navigation.tsx`, `sidebar/sidebar-item.tsx`.

**GigsNano rules:**
- `src/app/(app)/[workspaceSlug]/(dashboard)/layout.tsx` renders `<AppSidebar/>` +
  `<main>{children}</main>`. Because it is a Next.js layout, the sidebar is preserved
  across every project/cycle navigation — zero remount, zero layout shift.
- Give each feature folder its own `layout.tsx` that renders only its header
  (`<AppHeader header={<CyclesHeader/>}/>` + `<ContentWrapper>{children}</ContentWrapper>`).
- Standardize a per-folder convention: `layout.tsx`, `page.tsx`, `header.tsx`,
  `mobile-header.tsx`. Plane uses exactly these four filenames in every feature folder.
- Wrap data gating (auth + workspace load) in the `[workspaceSlug]/layout.tsx` so inner
  routes can assume data exists (Plane: `AuthenticationWrapper` > `WorkspaceAuthWrapper`).

---

## 6. EmptyState pattern

Plane ships **two** generations of EmptyState; adopt the newer one.

**A. Newer design-system version — `@plane/propel/empty-state`**
(`plane/packages/propel/src/empty-state/`). Three variants share
`BaseEmptyStateCommonProps`:

```ts
// packages/propel/src/empty-state/types.ts
interface BaseEmptyStateCommonProps {
  title?: string;
  description?: string;
  actions?: ActionButton[];         // [{ label, variant, onClick, disabled, data-* }]
  assetKey?: CompactAssetType | DetailedAssetType;  // e.g. "cycle", "module", "project"
  asset?: React.ReactNode;          // escape hatch for a custom illustration
  align?: "start" | "center";
  className?; rootClassName?; assetClassName?;
  customButton?: React.ReactNode;
}
```

- `EmptyStateDetailed` (large, with illustration + buttons),
  `CompactEmptyState`, `SimpleEmptyState`.
- **Illustrations are code, not raw `<img>`.** `assetKey` is resolved through an
  **asset registry** (`assets/asset-registry.tsx`) that maps a string key to a React
  illustration component. Asset families: `illustration/`, `vertical-stack/`,
  `horizontal-stack/`. Keys are typed unions in `assets/asset-types.ts`
  (`"cycle" | "module" | "project" | "page" | "view" | "no-access" | "error-404" | …`).

Real usage (verbatim, `cycles/(list)/page.tsx`):

```tsx
<EmptyStateDetailed
  assetKey="cycle"
  title={t("project_empty_state.cycles.title")}
  description={t("project_empty_state.cycles.description")}
  actions={[{
    label: t("project_empty_state.cycles.cta_primary"),
    onClick: () => setCreateModal(true),
    variant: "primary",
    disabled: !hasMemberLevelPermission,
  }]}
/>
```

**B. Older app-level version — `core/components/empty-state/`**
(`detailed-empty-state-root.tsx`, `simple-empty-state-root.tsx`). Same idea but takes an
`assetPath` (a `.webp` URL, theme-resolved light/dark) instead of an `assetKey`. Used for
"feature disabled" states, e.g.:

```tsx
<DetailedEmptyState
  title={t("disabled_project.empty_state.cycle.title")}
  assetPath={resolvedTheme === "light" ? lightEmptyState : darkEmptyState}
  primaryButton={{ text: ..., onClick: () => router.push(`/${slug}/settings/...`) }}
/>
```

**Recommended GigsNano EmptyState API** (`src/components/empty-state/`):

```tsx
type EmptyStateAction = {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  href?: string;
};

type EmptyStateProps = {
  assetKey: EmptyStateKey;        // "cycle" | "project" | "board" | "module" | ...
  title: string;
  description?: string;
  actions?: EmptyStateAction[];   // ALWAYS include the next action (per project rule)
  align?: "start" | "center";
};

export function EmptyState(props: EmptyStateProps) { ... }
```

Conventions:
- One `EmptyState` component, one **asset registry** mapping `assetKey → illustration`
  (React SVG components, theme-aware). Never inline raw images per-route.
- **Every route that can be empty renders `<EmptyState/>` and every EmptyState carries at
  least one action** telling the user the next step (create cycle, invite member, create
  project). This satisfies the GigsNano goal that each route tells the user what to do.
- Put copy (title/description/cta) in `src/constants/` keyed by feature so it's reused and
  translatable — mirrors Plane's `t("project_empty_state.cycles.*")` keys.

---

## 7. Naming conventions & file-organization rules

Observed in Plane, adopt for GigsNano:

- **Folders:** `kebab-case` everywhere (`create-workspace`, `active-cycles`,
  `empty-state`, `app-header`).
- **Route folders:** groups `(kebab-case)`, dynamic `[camelCase]` (`[workspaceSlug]`,
  `[projectId]`, `[cycleId]`).
- **Route files (fixed vocabulary per folder):** `page.tsx`, `layout.tsx`, `header.tsx`,
  `mobile-header.tsx`. Keep `page.tsx` thin — hooks + composition only.
- **Services:** `<domain>.service.ts` exporting `class <Domain>Service extends APIService`.
- **Stores:** `<domain>.store.ts` exporting `class <Domain>Store` + interface
  `I<Domain>Store`; registered in `root.store.ts`.
- **Store hooks:** `hooks/store/use-<domain>.ts` exporting `use<Domain>()`.
- **Feature presentation:** `components/<feature>/<thing>.tsx`
  (`components/cycles/cycles-view.tsx`, `components/cycles/modal.tsx`).
- **Types:** interfaces prefixed `I` (`ICycle`, `IProjectStore`); enums `E`
  (`EUserProjectRoles`, `EHeaderVariant`).
- **Barrels:** `index.ts` re-exports per folder for clean imports.
- **Path alias:** GigsNano already has `@/* → ./src/*` — use it for all cross-folder
  imports; never use deep relative paths across layers.
- **Import ordering (Plane style):** external → `@plane/*` shared packages →
  `@/` app imports → relative, grouped with `// comments`.

---

## Appendix — proposed GigsNano folder tree (condensed)

```
apps/web/
  src/
    app/
      layout.tsx  page.tsx
      (marketing)/           layout.tsx page.tsx
      (auth)/                layout.tsx sign-in/ sign-up/ forgot-password/
      (app)/
        layout.tsx           # AuthGuard + providers
        onboarding/page.tsx
        create-workspace/page.tsx
        account/settings/[tab]/page.tsx
        [workspaceSlug]/
          layout.tsx         # WorkspaceGuard (load workspace + members)
          (dashboard)/
            layout.tsx       # <AppSidebar/> + <main>{children}</main>
            page.tsx
            projects/
              page.tsx
              [projectId]/
                layout.tsx header.tsx mobile-header.tsx
                page.tsx            # progress dashboard
                board/page.tsx
                cycles/  layout.tsx header.tsx page.tsx  [cycleId]/page.tsx
                modules/ page.tsx  [moduleId]/page.tsx
                views/   page.tsx
            analytics/page.tsx
          (settings)/
            layout.tsx       # two-pane settings shell + <SettingsNav/>
            settings/
              page.tsx members/page.tsx billing/page.tsx
              projects/[projectId]/  page.tsx features/ labels/ states/
    services/    api.service.ts  cycle.service.ts  project.service.ts  workspace.service.ts
    mocks/       data/*.ts (fixtures matching Python API)  handlers/   # remove at backend cutover
    store/       root.store.ts  cycle.store.ts  project/  workspace/
    hooks/
      store/     use-cycle.ts  use-project.ts  use-workspace.ts
      use-app-router.ts
    components/
      ui/                    # shadcn + primitives
      layout/                # app-sidebar, app-header, content-wrapper, settings-nav
      empty-state/           # EmptyState.tsx + asset-registry.tsx + assets/*
      cycles/  projects/  board/  onboarding/  settings/
    types/       constants/       lib/
```

Guiding principle: **routes are thin, layouts are persistent, data flows
service → store → hook → page, and every empty route renders an actionable
`<EmptyState/>`.**
```
