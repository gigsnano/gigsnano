import type { IDocument } from "@/types";
import { EDocumentKind, EDocumentSource } from "@/types";

function agentDoc(
  partial: Omit<
    IDocument,
    "source" | "story_id" | "workspace_path" | "file_name" | "mime_type"
  > & { workspace_path?: string; file_name?: string },
): IDocument {
  const slug = partial.workflow?.replace(/^bmad-/, "") ?? "artifact";
  return {
    ...partial,
    source: EDocumentSource.Agent,
    story_id: null,
    workspace_path: partial.workspace_path ?? `docs/${slug}.md`,
    file_name: partial.file_name ?? `${slug}.md`,
    mime_type: "text/markdown",
  };
}

function userDoc(
  partial: Omit<
    IDocument,
    "source" | "story_id" | "workspace_path" | "file_name" | "mime_type"
  > & { workspace_path?: string; file_name?: string; story_id?: string | null },
): IDocument {
  const file = partial.file_name ?? "upload.md";
  return {
    ...partial,
    source: EDocumentSource.User,
    story_id: partial.story_id ?? null,
    workspace_path: partial.workspace_path ?? `uploads/${file}`,
    file_name: file,
    mime_type: "text/markdown",
  };
}

/** BMAD planning artifacts for projects that completed Sprint-0 (see bmad-workflow-guide §4). */
export const documents: IDocument[] = [
  agentDoc({
    id: "doc_mba_brief",
    workspace_slug: "acme",
    project_id: "prj_mba",
    project_name: "Mobile Banking App",
    title: "Product Brief",
    kind: EDocumentKind.Brief,
    workflow: "bmad-product-brief",
    content: `# Product Brief — Mobile Banking App

## Vision
A cross-platform mobile banking client with offline-first sync for retail customers.

## Audience
Tech-savvy consumers aged 25–45 who expect instant transfers and spending insights.

## Value proposition
Bank-grade security with consumer-grade UX — balances, transfers, and budgets in one tap.

## Scope (v1)
- Account onboarding & MFA
- Balance & transaction history
- Domestic transfers
- Push notifications`,
    comments: [],
    is_draft: false,
    created_at: "2026-05-06T14:00:00Z",
    updated_at: "2026-05-06T14:00:00Z",
    workspace_path: "docs/product-brief.md",
    file_name: "product-brief.md",
  }),
  agentDoc({
    id: "doc_mba_prd",
    workspace_slug: "acme",
    project_id: "prj_mba",
    project_name: "Mobile Banking App",
    title: "Product Requirements Document",
    kind: EDocumentKind.Prd,
    workflow: "bmad-prd",
    content: `# PRD — Mobile Banking App

## Goals
1. Reduce time-to-first-transfer to under 3 minutes after install.
2. Support offline viewing of last 30 days of transactions.

## Functional requirements
- FR-1: Email/password sign-up with email verification
- FR-2: Biometric unlock after first session
- FR-3: Real-time balance with pull-to-refresh
- FR-4: Scheduled domestic transfers

## Non-goals (v1)
- International wires
- Crypto trading`,
    comments: [],
    is_draft: false,
    created_at: "2026-05-08T11:00:00Z",
    updated_at: "2026-05-10T09:30:00Z",
    workspace_path: "docs/prd.md",
    file_name: "prd.md",
  }),
  agentDoc({
    id: "doc_mba_arch",
    workspace_slug: "acme",
    project_id: "prj_mba",
    project_name: "Mobile Banking App",
    title: "Architecture",
    kind: EDocumentKind.Architecture,
    workflow: "bmad-create-architecture",
    content: `# Architecture — Mobile Banking App

## Stack
- React Native + Expo (mobile)
- Python FastAPI (backend)
- PostgreSQL + Redis

## System overview

\`\`\`mermaid
flowchart LR
  App[Mobile App] -->|HTTPS| API[FastAPI Gateway]
  API --> Auth[Auth Service]
  API --> Ledger[Ledger Service]
  Ledger --> DB[(PostgreSQL)]
  API --> Cache[(Redis)]
\`\`\`

## Patterns
- Offline store: SQLite on device, sync via conflict-free last-write-wins for reads
- Auth: OAuth2 + refresh tokens, MFA via TOTP

## Security
- Certificate pinning on mobile
- PII encrypted at rest (AES-256)`,
    comments: [],
    is_draft: false,
    created_at: "2026-05-11T16:00:00Z",
    updated_at: "2026-05-12T10:00:00Z",
    workspace_path: "docs/architecture.md",
    file_name: "architecture.md",
  }),
  agentDoc({
    id: "doc_mba_epics",
    workspace_slug: "acme",
    project_id: "prj_mba",
    project_name: "Mobile Banking App",
    title: "Epics & Stories",
    kind: EDocumentKind.Epics,
    workflow: "bmad-create-epics-and-stories",
    content: `# Epics — Mobile Banking App

## Epic 1: Authentication
- Story: Sign-up flow with email verification
- Story: Biometric unlock
- Story: Session refresh & logout

## Epic 2: Accounts & balances
- Story: Dashboard with account cards
- Story: Transaction list with infinite scroll

## Epic 3: Payments
- Story: One-time domestic transfer
- Story: Scheduled payments`,
    comments: [],
    is_draft: false,
    created_at: "2026-05-13T09:00:00Z",
    updated_at: "2026-05-14T15:00:00Z",
    workspace_path: "docs/epics.md",
    file_name: "epics.md",
  }),
  agentDoc({
    id: "doc_ad_prd",
    workspace_slug: "acme",
    project_id: "prj_ad",
    project_name: "Analytics Dashboard",
    title: "Product Requirements Document",
    kind: EDocumentKind.Prd,
    workflow: "bmad-prd",
    content: `# PRD — Analytics Dashboard (draft)

## Goals
Self-serve reporting for product teams without SQL.

## In progress
Sprint-0 planning is 60% complete — PRD sections 3–5 pending analyst review.`,
    comments: [],
    is_draft: false,
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-28T12:00:00Z",
    workspace_path: "docs/prd.md",
    file_name: "prd.md",
  }),
  userDoc({
    id: "doc_draft_notes",
    workspace_slug: "acme",
    project_id: "prj_ad",
    project_name: "Analytics Dashboard",
    title: "Sprint retro notes (draft)",
    kind: EDocumentKind.Other,
    workflow: null,
    content: `# Retro — draft

## Went well
- Sprint-0 board UX landed

## To improve
- Need clearer doc review flow`,
    comments: [],
    is_draft: true,
    created_at: "2026-06-25T11:00:00Z",
    updated_at: "2026-06-25T11:00:00Z",
    file_name: "sprint-retro-notes.md",
    workspace_path: "uploads/sprint-retro-notes.md",
  }),
];
