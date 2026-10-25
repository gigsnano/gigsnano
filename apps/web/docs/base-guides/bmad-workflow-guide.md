# BMAD Method — Practical Workflow Guide for GigsNano v2

> Research guideline distilled from the official BMAD Method (v6 / BMM module) documentation, written to drive GigsNano's Sprint-0 experience.
>
> **Primary sources**
> - Workflow Map — https://docs.bmad-method.org/reference/workflow-map/
> - Agents reference — https://docs.bmad-method.org/reference/agents/
> - Getting Started tutorial — https://docs.bmad-method.org/tutorials/getting-started/
> - Analysis Phase explanation — https://docs.bmad-method.org/explanation/analysis-phase/
> - Established Projects (brownfield) — https://docs.bmad-method.org/how-to/established-projects/
> - Full LLM reference (superset) — https://docs.bmad-method.org/llms-full.txt
>
> Terminology note: the docs describe the current **v6** naming (module = **BMM**, "BMad Method"). Older v4 material used different agent names (e.g. a standalone "Scrum Master (Bob)" and "QA (Quinn)"). This guide follows v6, and flags where GigsNano's intended agent list differs from the shipped roster.

---

## 1. Overview

**What BMAD is.** BMAD (the **BMad Method**, shipped as the **BMM** module of the BMad ecosystem) is an AI-driven, agile-inspired software development framework. It coordinates a set of **specialized AI agents** (each with a persona and a menu of workflows) that walk a project from raw idea to working code. Its stated goal is **context engineering**: AI agents work best with clear, structured context, so BMAD builds that context *progressively* across phases — each workflow produces a document that becomes the input (context) for the next.

**Core philosophy.**
- **Phased, document-driven flow.** Four phases (Analysis → Planning → Solutioning → Implementation). Each phase produces artifacts that "inform the next, so agents always know what to build and why."
- **Context is the product of each step.** "The PRD tells the architect what constraints matter. The architecture tells the dev agent which patterns to follow. Story files give focused, complete context for implementation. Without this structure, agents make inconsistent decisions."
- **Fresh chat per workflow.** The docs recommend running each workflow in a fresh chat/context to keep the agent focused on the current artifact.
- **Right-sized rigor (planning tracks).** Not every project needs all four phases; BMAD offers **Quick Flow**, **BMad Method**, and **Enterprise** tracks (see §3).
- **Human-in-the-loop guidance.** A `bmad-help` skill inspects project state and recommends the next required step; it auto-runs at the end of every workflow to say what comes next.

**Why it fits GigsNano.** GigsNano embeds these exact agents into an agile board. The BMAD phase→artifact→unlock chain is a natural fit for a **Sprint-0 kanban with sequential task-unlocking**: each BMAD workflow becomes a Sprint-0 user-story, each story opens a chat with the owning agent, and completing a story produces an artifact that satisfies the dependency of the next story. By the end of Sprint-0, BMAD has produced the project brief, PRD, architecture, epics, and sprint plan — everything a real sprint needs.

---

## 2. The BMAD Agents / Roles

The shipped v6 BMM roster (from the Agents reference). Each agent is invoked as a skill (`bmad-agent-*`) and exposes a menu of workflows via short trigger codes.

| Agent (persona) | Skill ID | Responsibility | Owns / produces (artifacts) |
| --- | --- | --- | --- |
| **Analyst — "Mary"** | `bmad-agent-analyst` | Explore the problem space: brainstorming, market/domain/technical research, product brief, PRFAQ challenge, and **documenting an existing project** (brownfield). | `brainstorm.html`/`brainstorm-intent.md`, research findings, **`brief.md`** (product brief), `prfaq-*.md`, project-context (via generate) |
| **Product Manager — "John"** | `bmad-agent-pm` | Define *what* to build and for whom; own requirements and the epic/story breakdown; run readiness gate; handle mid-course scope changes. | **`prd.md`** (+ `addendum.md`, `.memlog.md`), **epics + stories** (`epics.md` / epic files), implementation-readiness decision, corrected plan |
| **Architect — "Winston"** | `bmad-agent-architect` | Make technical decisions explicit before coding; validate cross-document cohesion. | **`architecture.md`** / `ARCHITECTURE-SPINE.md`, implementation-readiness gate check |
| **UX Designer — "Sally"** | `bmad-agent-ux-designer` | Design the user experience when UI matters (visual + behavioral spine). | **`DESIGN.md`** (visual) + **`EXPERIENCE.md`** (behavioral) |
| **Developer — "Amelia"** | `bmad-agent-dev` | The build engine. **Also carries the Scrum-Master duties in v6**: sprint planning, story creation, implementation, code review, retrospective, QA test generation, quick dev. | `sprint-status.yaml`, `story-[slug].md`, working **code + tests**, code-review approval, retrospective lessons |
| **Technical Writer — "Paige"** | `bmad-agent-tech-writer` | Documentation: document an existing project, write/validate docs, generate diagrams, explain concepts. | Project documentation, diagrams, validated docs |

**Mapping to GigsNano's intended agent list.** GigsNano's brief names: Analyst, Product Manager, Architect, Scrum Master, Developer, UI/UX Architect, Test Engineer. BMAD covers all of these, but note two consolidations:
- **Scrum Master** — In v6 BMAD there is no standalone SM agent; the SM workflows (`sprint-planning`, `create-story`, `retrospective`) live under the **Developer agent (Amelia)**. GigsNano can still *present* a distinct "Scrum Master" persona in the UI while pointing it at these DEV-owned workflows. (v4 BMAD did ship a standalone SM named "Bob" — reintroduce that persona name only if you want v4 fidelity.)
- **Test Engineer / QA** — Basic QA is the `bmad-qa-generate-e2e-tests` workflow, exposed through the Developer agent. A full **Test Architect ("TEA")** lives in its own separate module, not in the base BMM install. If GigsNano wants a dedicated Test Engineer agent, wire it to `bmad-qa-generate-e2e-tests` (and optionally the TEA module later).
- **UI/UX Architect** = BMAD's UX Designer (Sally).

---

## 3. The Workflow Map / Phases (source of truth for Sprint-0 ordering)

BMAD runs **4 phases** plus a parallel **Quick Flow** shortcut. Arrows below show artifact flow (what unlocks what). This section is the canonical sequence for GigsNano's Sprint-0 story order and task-unlock logic.

### Planning tracks (choose rigor first)
The very first decision is *which track*, because it determines which phases/stories exist:

| Track | Best for | Documents created | Phases used |
| --- | --- | --- | --- |
| **Quick Flow** | Bug fixes, simple features, clear scope (1–15 stories) | Tech-spec only | Skips 1–3; goes straight to a single `quick-dev` workflow |
| **BMad Method** | Products, platforms, complex features (10–50+ stories) | PRD + Architecture + UX | All 4 phases |
| **Enterprise** | Compliance, multi-tenant systems (30+ stories) | PRD + Architecture + Security + DevOps | All 4 phases, extra rigor |

### Phase 1 — Analysis *(Optional)*
Explore the problem space and validate ideas before committing to planning. Every tool here is optional and each stands alone; outputs feed the PRD.

| Step / workflow | Agent | Purpose | Produces | Notes on ordering |
| --- | --- | --- | --- | --- |
| `bmad-brainstorming` | Analyst (Mary) | Guided ideation | `brainstorm.html` (+ optional `brainstorm-intent.md`) | Use when the concept is vague |
| `bmad-forge-idea` | Analyst | Pressure-test an idea until it hardens or dies cheaply | `forge-report.html`; `forged-idea.md` if it hardens | Optional |
| `bmad-market-research` / `bmad-domain-research` / `bmad-technical-research` | Analyst | Validate market / domain / technical assumptions | Research findings | Run one, two, or all three |
| `bmad-product-brief` | Analyst | Capture strategic vision (gentle path) — best when concept is clear | **`brief.md`** (+ `addendum.md`) | Recommended foundation doc |
| `bmad-prfaq` | Analyst | Working-Backwards challenge (rigorous path) — stress-test customer-first | `prfaq-{project}.md` | Alternative to brief |

**Dependency:** all Analysis outputs (brief, PRFAQ, research, brainstorm) are *inputs* the PRD can synthesize. Product Brief and PRFAQ are two alternative on-ramps to the same destination — pick one based on how much challenge you want.

### Phase 2 — Planning *(Required for BMad Method / Enterprise)*
Define what to build and for whom.

| Step / workflow | Agent | Purpose | Produces | Unlocks |
| --- | --- | --- | --- | --- |
| `bmad-prd` | PM (John) | Create / update / validate the PRD (facilitated discovery; 3 intents in one skill) | **`prd.md`** (+ `addendum.md`, `.memlog.md`); validate mode adds `validation-report` | Architecture; UX |
| `bmad-ux` | UX Designer (Sally) | Design UX **only if the product has a UI** ("Has UI?" branch) | **`DESIGN.md`** + **`EXPERIENCE.md`** | Architecture / epics (informs UI stories) |

**Dependency:** PRD requires (ideally) the Analysis outputs; PRD is **required** before Solutioning. UX is conditional on `Has UI?` — skip it for headless/back-end work.

### Phase 3 — Solutioning
Decide *how* to build it and break work into stories.

| Step / workflow | Agent | Purpose | Produces | Unlocks |
| --- | --- | --- | --- | --- |
| `bmad-create-architecture` | Architect (Winston) | Make technical decisions explicit | **`architecture.md`** (`ARCHITECTURE-SPINE.md`) | Epics & stories |
| `bmad-create-epics-and-stories` | PM (John) | Break requirements into implementable work — uses **both PRD and Architecture** | **Epic files with stories** (`epics.md`) | Readiness check → Implementation |
| `bmad-check-implementation-readiness` | PM/Architect | Gate check validating cohesion across all planning docs | **PASS / CONCERNS / FAIL** decision | Gates entry to Phase 4 |

**Dependency (strict, and the crux of the unlock logic):**
`architecture` needs `prd` (and UX if present) → `create-epics-and-stories` needs **both `prd` + `architecture`** → `check-implementation-readiness` needs the epics/stories + all planning docs. The readiness gate is *highly recommended* before implementation.

### Phase 4 — Implementation
Build it, one story at a time.

| Step / workflow | Agent | Purpose | Produces | Notes |
| --- | --- | --- | --- | --- |
| `bmad-sprint-planning` | Developer (Amelia) | Initialize tracking — run **once per project** to sequence the dev cycle | **`sprint-status.yaml`** | One-time; seeds the sprint board |
| `bmad-create-story` | Developer | Prepare next story for implementation (loads epics, PRD, architecture, UX) | **`story-[slug].md`** | Per story |
| `bmad-dev-story` | Developer | Implement the story (loads the story file) | **Working code + tests** | Per story |
| `bmad-code-review` | Developer | Validate implementation quality (loads architecture + story) | Approved / changes requested | Per story (recommended) |
| `bmad-qa-generate-e2e-tests` | Developer | Generate E2E tests | Test suite | Optional QA |
| `bmad-correct-course` | PM (John) | Handle significant mid-sprint changes | Updated plan / re-routing | Ad-hoc |
| `bmad-sprint-status` | Developer | Track sprint progress and story status | Sprint status update | Ad-hoc |
| `bmad-retrospective` | Developer | Review after epic completion | Lessons learned | Per epic |

**The core build cycle** repeats per story (each in a fresh chat): `create-story` → `dev-story` → `code-review`; then `retrospective` after each epic completes.

### Quick Flow (Parallel Track — the "skip phases 1–3" path)

| Step / workflow | Agent | Purpose | Produces |
| --- | --- | --- | --- |
| `bmad-quick-dev` | Developer (Amelia) | Unified quick flow — clarify intent → plan → implement → review → present | `spec-*.md` + code |
| `bmad-dev-auto` | Developer | One unattended dev-loop iteration (small intent in, code out) | `spec-*.md` + code |

Use Quick Flow for small, well-understood changes. For GigsNano this is a good "lite Sprint-0" for tiny projects (1–15 stories) or for brownfield quick fixes.

### End-to-end happy path (BMad Method track)
```
[optional] brainstorm/research/forge → product-brief OR prfaq   (Analyst)
  → prd                                                          (PM)
  → ux  (only if Has UI?)                                        (UX)
  → create-architecture                                          (Architect)
  → create-epics-and-stories                                     (PM)
  → check-implementation-readiness  [PASS gate]                  (Architect/PM)
  → sprint-planning (once)                                       (DEV)
  → LOOP per story: create-story → dev-story → code-review       (DEV)
  → retrospective (per epic)                                     (DEV)
```

---

## 4. Artifacts

The document chain, in dependency order. Each becomes context for the next.

| Artifact | File(s) | Owner | Purpose | Feeds into |
| --- | --- | --- | --- | --- |
| **Brainstorm / research output** | `brainstorm.html`, research findings, `forged-idea.md` | Analyst | Raw exploration & validation | Product brief / PRFAQ / PRD |
| **Product Brief** | `brief.md` (+ `addendum.md`) | Analyst | 1–2 page executive summary of vision, audience, value prop, scope | PRD |
| **PRFAQ** | `prfaq-{project}.md` | Analyst | Working-Backwards press release + hard FAQ; stress-tests concept | PRD |
| **PRD** | `prd.md` (+ `addendum.md`, `.memlog.md`) | PM | Requirements: *what* to build & why; constraints | Architecture, UX, Epics |
| **UX Design pair** | `DESIGN.md` + `EXPERIENCE.md` | UX Designer | Visual design (DESIGN) + behavioral spec (EXPERIENCE) | Architecture, Stories |
| **Architecture** | `architecture.md` / `ARCHITECTURE-SPINE.md` | Architect | Explicit technical decisions & patterns | Epics/stories, dev-story, code-review |
| **Epics & Stories** | `epics.md` / epic files with stories | PM | Requirements broken into implementable work | Readiness check, sprint planning, create-story |
| **Readiness gate** | PASS/CONCERNS/FAIL report | Architect/PM | Cohesion check across all planning docs | Gates Phase 4 |
| **Sprint status** | `sprint-status.yaml` | Developer | Tracks every epic & story through the dev cycle | The build loop |
| **Story file** | `story-[slug].md` | Developer | Focused, complete context for one story | dev-story |
| **Code + tests** | source + tests | Developer | The implementation | code-review, retrospective |
| **Project Context** | `_bmad-output/project-context.md` | Analyst (`bmad-generate-project-context`) | Tech stack + implementation rules that guide all dev agents | dev-story, code-review (esp. brownfield) |

**Output folder layout** (from the tutorial):
```
_bmad/                                 # config (agents, workflows, tasks)
_bmad-output/
  planning-artifacts/
    PRD.md
    architecture.md
    epics/                             # epic + story files
  implementation-artifacts/
    sprint-status.yaml
  project-context.md                   # optional but recommended
```

**Relationships in one line:** *Analysis sharpens the PRD → PRD + UX drive Architecture → PRD + Architecture drive Epics/Stories → readiness gate → sprint plan → per-story build loop.*

---

## 5. Greenfield vs Brownfield

BMAD supports both; the difference is mostly at the front of the flow (establishing context) and in how much of Phases 1–3 you actually run.

### Greenfield — "Fresh project" (GigsNano's Fresh flow)
- Start from Phase 1 (optional Analysis) or jump straight to `bmad-prd`.
- Full happy path: brief/PRFAQ → PRD → (UX) → architecture → epics → readiness → sprint → build loop.
- No existing code to reconcile; `project-context.md` is optional (can be generated from the architecture doc).

### Brownfield — "Documenting an existing project" (GigsNano's Document-existing flow)
Key extra/changed steps (from the Established Projects guide):
1. **Clean up stale planning artifacts** — archive/delete old completed PRD/epics/story files so they don't pollute context (don't leave them in `docs/`, `planning-artifacts/`, `implementation-artifacts/`).
2. **Create Project Context** — run `bmad-generate-project-context`. It **scans the codebase** to detect tech stack & versions, code organization, naming conventions, testing approaches, framework patterns → writes `_bmad-output/project-context.md`. (Can be hand-authored instead.)
3. **Document the actual current state** — for complex codebases, run `bmad-document-project` (Analyst/Paige), which scans the whole project and documents its real current state into `docs/`.
4. **Choose scope-appropriate approach:**
   - *Small updates/additions* → `bmad-quick-dev` (single workflow: clarify → plan → implement → review). Full 4-phase method is usually overkill.
   - *Major changes* → run the BMad Method, applying as much rigor as needed.
5. **Context-aware planning** — during brief/PRD creation, the agent must **find and read existing project docs** so new features integrate with the current system. UX work is optional (only if you're changing/adding significant UI). Architecture must **scan the existing codebase** and use documented files to avoid reinventing or misaligning.

**Summary of the difference for GigsNano:**

| | Fresh (greenfield) | Documenting existing (brownfield) |
| --- | --- | --- |
| Entry story | Optional Analysis → PRD | **Document project + Generate project-context** first |
| project-context.md | Optional (from architecture) | **Required-ish** — generated from codebase scan |
| Owning agent for onboarding | Analyst | Analyst (`document-project`, `generate-project-context`) / Tech Writer |
| Typical track | BMad Method / Enterprise | Quick Flow for small changes; BMad Method for major |
| Architecture step | Design fresh | Reconcile with existing codebase |

---

## 6. Mapping to GigsNano (Sprint-0 blueprint)

Concrete table: BMAD phase/step → Sprint-0 user-story → owning AI agent → produced artifact → what it unlocks. This is the opinionated Sprint-0 GigsNano auto-creates.

### Fresh Project (Greenfield) — Sprint-0 stories

| # | Sprint-0 user-story (card title) | BMAD workflow | Owning agent (UI persona) | Artifact produced | Unlocks (next enabled card) | Required? |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Choose your planning track | (track selection) | Analyst / bmad-help | track decision | Story 1 (or jumps to Quick-Dev for Quick Flow) | Required |
| 1 | Brainstorm the idea | `bmad-brainstorming` | Analyst (Mary) | `brainstorm.md` | Story 2 | Optional |
| 2 | Research market / domain / tech | `bmad-*-research` | Analyst (Mary) | research findings | Story 3 | Optional |
| 3 | Write the Product Brief *(or PRFAQ)* | `bmad-product-brief` / `bmad-prfaq` | Analyst (Mary) | `brief.md` / `prfaq.md` | Story 4 (PRD) | Optional but recommended |
| 4 | Create the PRD | `bmad-prd` | Product Manager (John) | `prd.md` | Story 5 (if UI) or 6 | **Required** |
| 5 | Design the UX | `bmad-ux` | UI/UX Architect (Sally) | `DESIGN.md` + `EXPERIENCE.md` | Story 6 | Conditional — only if "Has UI?" |
| 6 | Create the Architecture | `bmad-create-architecture` | Architect (Winston) | `architecture.md` | Story 7 | **Required** (BMad/Enterprise) |
| 7 | Break down Epics & Stories | `bmad-create-epics-and-stories` | Product Manager (John) | epic files + stories | Story 8 | **Required** |
| 8 | Implementation Readiness gate | `bmad-check-implementation-readiness` | Architect (Winston) | PASS/CONCERNS/FAIL | Story 9 (only on PASS) | Highly recommended |
| 9 | Sprint Planning | `bmad-sprint-planning` | Scrum Master → Developer (Amelia) | `sprint-status.yaml` | **End of Sprint-0** → real sprints begin | **Required** |

> After Story 9, Sprint-0 is "done": the generated `epics/`, stories, and `sprint-status.yaml` populate GigsNano's real product backlog / Sprint-1 board. The per-story build loop (`create-story → dev-story → code-review`, then `retrospective` per epic) runs in those real sprints, driven by the Developer/Test-Engineer agents.

### Documenting Existing Project (Brownfield) — Sprint-0 stories

| # | Sprint-0 user-story | BMAD workflow | Owning agent | Artifact | Unlocks | Required? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Clean up stale planning artifacts | (manual/guided) | Analyst | tidy repo | Story 2 | Recommended |
| 2 | Document the existing project | `bmad-document-project` | Analyst / Tech Writer (Paige) | `docs/` current-state docs | Story 3 | Recommended (complex projects) |
| 3 | Generate project context | `bmad-generate-project-context` | Analyst (Mary) | `project-context.md` | Story 4 | **Required-ish** |
| 4 | Decide scope: quick fix vs full method | (track selection) | bmad-help | scope decision | Story 5a or 5b | Required |
| 5a | Quick change (small scope) | `bmad-quick-dev` | Developer (Amelia) | `spec-*.md` + code | done | branch |
| 5b | Create/update PRD (context-aware) | `bmad-prd` | Product Manager (John) | `prd.md` | → UX / Architecture / Epics (same as greenfield Stories 5–9) | branch |

### Unlock-logic rules for GigsNano to encode
- **Hard dependency (must gate):** `architecture` requires `prd`; `create-epics-and-stories` requires **both `prd` and `architecture`**; `sprint-planning` requires epics/stories. Enforce these as blocking edges.
- **Conditional branch:** UX story is enabled only when the project "Has UI?" — expose a boolean at project creation.
- **Gate story:** `check-implementation-readiness` returns PASS/CONCERNS/FAIL; only **PASS** should unlock Sprint Planning (CONCERNS/FAIL loops back to the relevant planning story, optionally via `bmad-correct-course`).
- **Optional stories** (Analysis phase) should be skippable without blocking the PRD, but their outputs, if present, are passed as context into the PRD chat.
- **Fresh context per story:** each Sprint-0 card should open its own agent chat/thread (mirrors BMAD's "fresh chat per workflow"), pre-loaded with the prior artifacts as context.
- **`bmad-help` analogue:** GigsNano can surface a persistent "what's next?" helper that reads current artifact state and highlights the next unlocked card — mirrors BMAD's `bmad-help` auto-running at the end of each workflow.

---

## Ambiguities & notes for the team
- **Scrum Master agent:** v6 has no standalone SM; its workflows live under the Developer (Amelia). GigsNano can keep a distinct "Scrum Master" UI persona but must point it at DEV-owned workflows (`sprint-planning`, `create-story`, `retrospective`). (v4 named a standalone SM "Bob.")
- **Test Engineer:** Only basic QA (`bmad-qa-generate-e2e-tests`, under Developer) ships in base BMM; the full Test Architect (TEA) is a separate module. Decide whether GigsNano's Test Engineer maps to the workflow or pulls in TEA.
- **Exact filenames vary by output mode.** The docs show both "spine" names (`ARCHITECTURE-SPINE.md`, `DESIGN.md`/`EXPERIENCE.md`) and hydrated names (`architecture.md`, `prd.md`). BMAD "hydrates" the spine to whatever output the user wants. Treat filenames as configurable, not fixed.
- **Ordering is recommended, not strictly enforced by BMAD itself.** The docs say "Do I need to follow a strict order? Not strictly." GigsNano's Sprint-0 *chooses* to enforce ordering for guardrails — that's a product decision consistent with, but stricter than, vanilla BMAD.
- **Quick Flow** is a legitimate whole-project path (skips Phases 1–3). GigsNano should offer it as a lightweight Sprint-0 for tiny/known-scope projects.
