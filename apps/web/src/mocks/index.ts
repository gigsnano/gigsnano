import { APIError } from "@/services/api-error";
import type { IAgent, IAuthUser, IDashboard, ICreateProjectPayload, ICreateWorkspacePayload, IGitHubRepo, IImportJob, IMemberPreview, IProject, IProjectMember, ISignInPayload, ISignUpPayload, IStaffMember, IStaffRole, IStory, IWorkspace, IWorkspaceAnalytics, IWorkspaceMember } from "@/types";
import { EChartBucket, ECloneStatus, ECycleStatus, EDashboardVisibility, EDocumentKind, EDocumentSource, EExportStatus, EImportStatus, EIndexStatus, EInvitationStatus, EMemberStatus, EModuleStatus, ENotificationKind, EProjectFlow, EProjectRole, EReadinessResult, ESprintZeroStatus, EStateGroup, EStoryStatus, EStoryPriority, EViewLayout, EWorkspaceRole } from "@/types";

import { applyStoryLocks, isStorySatisfied, rollupSprintZeroProgress } from "@/lib/bmad/bmad-unlock";
import { artifactDocumentFromStory } from "@/lib/bmad/bmad-artifacts";
import { documentsForStory } from "@/lib/issues/story-documents";
import { buildCycleProgress } from "@/lib/charts/cycle-burndown";
import { paginateArray, readOffsetPageParams } from "@/lib/pagination/offset-page";
import { projects, defaultOverviewHtml } from "./data/projects";
import { mockCodeGraph } from "./data/code-graph";
import { mockCodeIssues, mockCodeMetrics } from "./data/code-metrics";
import { projectActivity } from "./data/project-activity";
import { journeyForProject } from "./data/journey";
import { workspaces, workspaceMembers } from "./data/workspaces";
import { cycles } from "./data/cycles";
import { modules } from "./data/modules";
import { stories, seedSprintZeroStories, allStories } from "./data/stories";
import { devStories } from "./data/dev-stories";
import { documents } from "./data/documents";
import { pages } from "./data/pages";
import { webhooks } from "./data/webhooks";
import { mockTokens, makeCreatedToken } from "./data/tokens";
import { mockOAuthGrants } from "./data/oauth-grants";
import { stickies } from "./data/stickies";
import { dashboards } from "./data/dashboards";
import { PUBLIC_ELIGIBLE_WIDGET_TYPES } from "@/components/dashboards/widgets/widget-registry";
import { timeEntries } from "./data/story-detail";
import { workspaceViews } from "./data/workspace-views";
import { exportJobs } from "./data/exports";
import { importJobs } from "./data/imports";
import { draftRecords } from "./data/drafts";
import { workspaceInvitations } from "./data/invitations";
import { walletBySlug, walletTxnsBySlug } from "./data/wallet";
import { getMockSubscription } from "./data/subscription";
import { notifications, toWireNotification, type IMockNotification } from "./data/notifications";
import { isNotificationCategory, notificationMatchesCategory } from "@/lib/notifications/inbox-filters";
import { views } from "./data/views";
import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { agents, agentBundles } from "./data/agents";
import { users } from "./data/users";
import { marketplaceJobs, marketplaceFreelancers } from "./data/marketplace";
import {
  mockWorkspaceFileContent,
  mockWorkspaceTreeForProject,
} from "./data/workspace-files";
import { projectMembers } from "./data/project-members";
import { auditLogs, privilegeCatalog, staffMe, staffMembers, staffRoles } from "./data/admin";
import { platformUserWorkspaces, platformUsers } from "./data/admin-users";
import {
  getLlmUsageByUser,
  getLlmUsageByWorkspace,
  getLlmUsageEvents,
  getLlmUsageHeatmapDaily,
  getLlmUsageHeatmapHourly,
  getLlmUsageMatrix,
  getLlmUsageSummary,
  getLlmUsageTimeseries,
} from "./data/admin-llm-usage";
import { getThreadUsage, getWorkspaceUsage } from "./data/ai-usage";
import {
  customFields,
  projectFeatures,
  projectLabels,
  projectStates,
  projectEstimates,
  projectAutomations,
} from "./data/project-settings";
import { makeStoryDetailHandlers } from "./handlers/story-detail-handlers";
import { makeAgentDelegationHandlers } from "./handlers/agent-delegation-handlers";
import { makeMarketplaceFlowHandlers } from "./handlers/marketplace-flow-handlers";
import { makeSlackHandlers } from "./handlers/slack-handlers";
import { makeSearchHandlers } from "./handlers/search-handlers";
import { makeWorkItemIoHandlers } from "./handlers/work-item-io-handlers";
import { makeIntakeHandlers } from "./handlers/intake-handlers";
import { makeEntitlementsHandlers } from "./handlers/entitlements-handlers";
import { makeTeamspaceHandlers } from "./handlers/teamspace-handlers";
import { makeRoadmapHandlers } from "./handlers/roadmap-handlers";
import { makeExecutionProfileHandlers } from "./handlers/execution-profile-handlers";
import { makeCodebaseHandlers } from "./handlers/codebase-handlers";
import { makeWorkflowHandlers } from "./handlers/workflow-handlers";
import { makeAutomationHandlers } from "./handlers/automation-handlers";
import { makeTemplateHandlers } from "./handlers/template-handlers";
import { makeMeetingHandlers } from "./handlers/meeting-handlers";
import { makeSolutionHandlers } from "./handlers/solution-handlers";
import { makeSolutionRuntimeHandlers } from "./handlers/solution-runtime-handlers";
import { logStoryPropertyChange } from "./data/story-detail";
import { EStoryActivityField } from "@/types/story/story-detail";
import { distillDescription } from "@/lib/chat/description-finalize";

/**
 * File-based mock transport. Lives strictly BELOW the service boundary: it maps
 * `method + path` (the same URLs the real Python API will serve) to fixtures.
 * Nothing above the services knows this exists. Simulates latency so loading
 * skeletons and EmptyStates can be exercised during development.
 */

const LATENCY_MS = 450;
const delay = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms));

// Return copies so callers can't mutate the shared fixtures.
const clone = <T>(value: T): T => structuredClone(value);

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

function readLlmUsageFilters(query: URLSearchParams) {
  const num = (value: string | null) => {
    if (value == null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };
  return {
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
    selected_date: query.get("selected_date") ?? undefined,
    workspace_id: query.get("workspace_id") ?? undefined,
    user_id: query.get("user_id") ?? undefined,
    source: query.get("source") ?? undefined,
    operation: query.get("operation") ?? undefined,
    model: query.get("model") ?? undefined,
    metric: (query.get("metric") as "tokens" | "cost" | null) ?? undefined,
    limit: num(query.get("limit")),
    offset: num(query.get("offset")),
  };
}

const notFound = (what: string): never => {
  throw new APIError(404, `${what} not found`);
};

// Page presence (GIN-24 v1) — short-TTL in-memory "who's here" map, mirroring
// the backend's in-proc heartbeat store. ponytail: a Map is plenty for a mock.
const PAGE_PRESENCE_TTL_MS = 20_000;
type PagePresenceEntry = { display_name: string; avatar_url: string | null; editing: boolean; last_seen: string };
const pagePresence = new Map<string, Map<string, PagePresenceEntry>>();

function findPage(slug: string, projectId: string, pageId: string) {
  return pages.find(
    (p) => p.workspace_slug === slug && p.project_id === projectId && p.id === pageId,
  );
}

function presenceOut(pageId: string) {
  const viewers = pagePresence.get(pageId);
  if (!viewers) return { viewers: [] };
  const cutoff = Date.now() - PAGE_PRESENCE_TTL_MS;
  for (const [userId, entry] of viewers) {
    if (new Date(entry.last_seen).getTime() < cutoff) viewers.delete(userId);
  }
  return {
    viewers: Array.from(viewers, ([user_id, entry]) => ({ user_id, ...entry })),
  };
}

/** Recompute a project's denormalized member preview + count from active project members. */
function syncProjectMembers(projectId: string) {
  const active = projectMembers.filter(
    (m) => m.project_id === projectId && m.status === EMemberStatus.Active,
  );
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;
  project.member_count = active.length;
  project.members = active.slice(0, 6).map<IMemberPreview>((m) => ({
    id: m.user_id,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  }));
}

function storyNotificationHref(slug: string, projectId: string, story: IStory): string {
  if (story.bmad) {
    if (story.bmad.workflow) {
      return `/${slug}/projects/${projectId}/board?openWorkflow=${encodeURIComponent(story.bmad.workflow)}`;
    }
    return `/${slug}/projects/${projectId}/board?openStory=${story.id}`;
  }
  return `/${slug}/projects/${projectId}/issues/${story.id}`;
}

// Monotonic id counters
let wmSeq = workspaceMembers.length;
let pmSeq = projectMembers.length;
let prjSeq = projects.length;

let wsSeq = workspaces.length;
let docSeq = documents.length;
let viewSeq = views.length;
let notifSeq = notifications.length;
let cycSeq = cycles.length;
let modSeq = modules.length;
let agtSeq = agents.length;
let stSeq = allStories.length;
let lblSeq = projectLabels.length;
let pstSeq = projectStates.length;
let estSeq = projectEstimates.length;
let autoSeq = projectAutomations.length;
let cfSeq = customFields.length;
let pgSeq = pages.length;
let whSeq = webhooks.length;
let stkSeq = stickies.length;
let dshSeq = dashboards.length;

/** The dashboard a share token resolves to, or the one opaque 404 the real
 *  public API returns for unknown/revoked/rotated links (GIN-489). */
function publishedByToken(token: string): IDashboard {
  const found = dashboards.find(
    (d) => d.public_token === token && d.visibility === EDashboardVisibility.Public,
  );
  if (!found) throw new APIError(404, "This dashboard is unavailable");
  return found;
}
let wvSeq = workspaceViews.length;
let expSeq = exportJobs.length;
let impSeq = importJobs.length;
let draftSeq = draftRecords.length;
let roleSeq = staffRoles.length;
let staffSeq = staffMembers.length;

function sprintStoriesForProject(projectId: string) {
  return stories.filter((s) => s.project_id === projectId);
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Shared shape of the two dashboard chart endpoints (GIN-527): resolve the
 * window, zero-fill it, let the caller tally each story into series, then fold
 * into day or week buckets exactly as the real endpoint does.
 */
function mockChartSeries(
  slug: string,
  query: URLSearchParams,
  series: readonly string[],
  tallyStory: (
    story: IStory,
    tally: (day: string | null | undefined, key: string) => void,
    today: string,
  ) => void,
) {
  const projectId = query.get("project_id");
  const today = new Date();
  const to = query.get("date_to") ?? isoDay(today);
  const from =
    query.get("date_from") ?? isoDay(new Date(today.getTime() - 29 * 86_400_000));
  const bucket = query.get("bucket") === EChartBucket.Week ? EChartBucket.Week : EChartBucket.Day;

  let rows = allStories.filter((s) => s.workspace_slug === slug);
  if (projectId) rows = rows.filter((s) => s.project_id === projectId);

  const zero = () => Object.fromEntries(series.map((k) => [k, 0]));
  const byDay = new Map<string, Record<string, number>>();
  for (let d = new Date(from); isoDay(d) <= to; d.setDate(d.getDate() + 1)) {
    byDay.set(isoDay(d), zero());
  }
  const tally = (day: string | null | undefined, key: string) => {
    const entry = day ? byDay.get(day.slice(0, 10)) : undefined;
    if (entry) entry[key] += 1;
  };
  for (const s of rows) tallyStory(s, tally, isoDay(today));

  const daily: Record<string, unknown>[] = [];
  for (const [date, counts] of byDay) {
    const weekday = (new Date(date).getUTCDay() + 6) % 7; // Monday = 0
    const startsPeriod =
      bucket === EChartBucket.Day || daily.length === 0 || weekday === 0;
    if (startsPeriod) {
      daily.push({ date, ...counts });
      continue;
    }
    const open = daily.at(-1) as Record<string, number>;
    for (const k of series) open[k] += counts[k];
  }
  return { period_from: from, period_to: to, bucket, daily };
}

function syncCycleStoryCounts(cycleId: string) {
  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) return;
  const cycleStories = allStories.filter((s) => s.cycle_id === cycleId);
  cycle.story_count = cycleStories.length;
  cycle.completed_story_count = cycleStories.filter((s) => s.status === EStoryStatus.Done).length;
  cycle.updated_at = new Date().toISOString();
}

function syncModuleStoryCounts(moduleId: string) {
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) return;
  const moduleStories = allStories.filter((s) => s.module_id === moduleId);
  mod.story_count = moduleStories.length;
  mod.completed_story_count = moduleStories.filter((s) => s.status === EStoryStatus.Done).length;
  mod.updated_at = new Date().toISOString();
}

function syncSubIssueCount(parentId: string | null) {
  if (!parentId) return;
  const parent = allStories.find((s) => s.id === parentId);
  if (!parent) return;
  parent.sub_issue_count = allStories.filter((s) => s.parent_id === parentId).length;
  parent.updated_at = new Date().toISOString();
}

function nextStoryOrder(projectId: string, cycleId: string | null, moduleId: string | null) {
  const scoped = allStories.filter(
    (s) =>
      s.project_id === projectId &&
      (cycleId ? s.cycle_id === cycleId : true) &&
      (moduleId ? s.module_id === moduleId : true),
  );
  if (scoped.length === 0) return 0;
  return Math.max(...scoped.map((s) => s.order)) + 1;
}

function seedSprintOne(slug: string, projectId: string) {
  if (cycles.some((c) => c.project_id === projectId && !c.is_sprint_zero)) return;
  const now = new Date().toISOString();
  const cycleId = `cyc_${projectId}_s1`;
  cycles.push({
    id: cycleId,
    workspace_slug: slug,
    project_id: projectId,
    name: "Sprint 1",
    description: "First delivery sprint after Sprint-0 planning.",
    status: ECycleStatus.Active,
    is_sprint_zero: false,
    start_date: now.slice(0, 10),
    end_date: null,
    story_count: 5,
    completed_story_count: 0,
    created_at: now,
    updated_at: now,
  });
  const cloned = devStories
    .filter((s) => s.project_id === "prj_mba")
    .map((s) => ({
      ...structuredClone(s),
      id: s.id.replace("prj_mba", projectId),
      workspace_slug: slug,
      project_id: projectId,
      cycle_id: cycleId,
    }));
  allStories.push(...cloned);
}

function notificationsForUser(slug: string, userId: string | undefined) {
  return notifications
    .filter((n) => n.workspace_slug === slug && (!userId || n.receiver_user_id === userId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toWireNotification);
}

function unreadCountForUser(slug: string, userId: string | undefined) {
  const rows = notifications.filter(
    (n) => n.workspace_slug === slug && n.receiver_user_id === userId && !n.read,
  );
  return {
    total_unread: rows.length,
    mention_unread: rows.filter((n) => n.kind === ENotificationKind.Mention).length,
  };
}

function pushNotification(notification: IMockNotification) {
  notifications.unshift(notification);
}

function emitSprintZeroNotifications(slug: string, projectId: string, projectName: string) {
  const now = new Date().toISOString();
  const members = projectMembers.filter(
    (m) => m.project_id === projectId && m.status === EMemberStatus.Active,
  );
  for (const member of members) {
    pushNotification({
      id: `notif_${++notifSeq}`,
      workspace_slug: slug,
      receiver_user_id: member.user_id,
      kind: ENotificationKind.Sprint,
      title: "Sprint-0 complete",
      body: `${projectName} finished BMAD planning`,
      href: `/${slug}/projects/${projectId}`,
      read: false,
      created_at: now,
      actor: null,
      project: { id: projectId, name: projectName },
    });
  }
}
function afterStoryMutation(slug: string, projectId: string) {
  const project = projects.find((p) => p.id === projectId && p.workspace_slug === slug);
  if (!project) return;
  const prevStatus = project.sprint_zero_status;
  const ps = sprintStoriesForProject(projectId);
  applyStoryLocks(ps, { has_ui: project.has_ui });
  const next = ps.find((s) => s.bmad && !s.bmad.is_locked && !isStorySatisfied(s));
  if (next?.status === EStoryStatus.Todo) next.status = EStoryStatus.InProgress;
  project.sprint_zero_progress = rollupSprintZeroProgress(ps);
  const allDone = ps.every((s) => isStorySatisfied(s) || s.status === EStoryStatus.Done);
  const gate = ps.find((s) => s.bmad?.workflow === "bmad-check-implementation-readiness");
  const planningDone = ps.find((s) => s.bmad?.workflow === "bmad-sprint-planning")?.status === EStoryStatus.Done;
  project.sprint_zero_status =
    planningDone || (allDone && gate?.bmad?.readiness_result === EReadinessResult.Pass)
      ? ESprintZeroStatus.Complete
      : ESprintZeroStatus.InProgress;

  if (prevStatus !== ESprintZeroStatus.Complete && project.sprint_zero_status === ESprintZeroStatus.Complete) {
    emitSprintZeroNotifications(slug, projectId, project.name);
    const ws = workspaces.find((w) => w.slug === slug);
    if (ws?.github_connected && currentUser) {
      const now = new Date().toISOString();
      pushNotification({
        id: `ntf_${Date.now()}`,
        workspace_slug: slug,
        receiver_user_id: currentUser.id,
        kind: ENotificationKind.System,
        title: "Docs synced to GitHub",
        body: `Planning artifacts pushed to ${ws.github_repo_url} (mock).`,
        read: false,
        actor: null,
        project: { id: projectId, name: project.name },
        href: `/${slug}/docs`,
        created_at: now,
      });
    }
  }
}

/** Mock auth session — replaced by real JWT/session at cutover. */
let currentUser: IAuthUser | null = {
  id: "u_1",
  display_name: "Ada Lovelace",
  email: "ada@acme.test",
  avatar_url: null,
  last_workspace_slug: "acme",
  email_digest: true,
  product_updates: true,
  email_verified: true,
};

/** Mock plan-price config (GIN-30 Slice 2) — the 4 purchasable combos. */
const mockPlanPrices = [
  { tier: "pro", interval: "monthly", stripe_product_id: null as string | null, stripe_price_id: null as string | null, unit_amount_cents: 0, currency: "usd", active: false, configured: false },
  { tier: "pro", interval: "annual", stripe_product_id: null as string | null, stripe_price_id: null as string | null, unit_amount_cents: 0, currency: "usd", active: false, configured: false },
  { tier: "business", interval: "monthly", stripe_product_id: null as string | null, stripe_price_id: null as string | null, unit_amount_cents: 0, currency: "usd", active: false, configured: false },
  { tier: "business", interval: "annual", stripe_product_id: null as string | null, stripe_price_id: null as string | null, unit_amount_cents: 0, currency: "usd", active: false, configured: false },
];

/** Mock digest preference — one per (mock) user; matches the backend defaults. */
const digestPreference = {
  enabled: true,
  timezone: "UTC",
  digest_hour: 8,
  digest_weekdays: [0, 1, 2, 3, 4, 5, 6] as number[],
  template: "manager", // auto-selected for the owner mock user (GIN-102)
  statuses: [EStoryStatus.Todo, EStoryStatus.InProgress] as EStoryStatus[],
  channels: ["email", "in_app"] as string[],
};

function buildAnalytics(slug: string): IWorkspaceAnalytics {
  const wsProjects = projects.filter((p) => p.workspace_slug === slug);
  const wsStories = allStories.filter((s) => s.workspace_slug === slug);
  const wsCycles = cycles.filter((c) => c.workspace_slug === slug && c.status === ECycleStatus.Active);
  return {
    workspace_slug: slug,
    active_projects: wsProjects.filter((p) => p.sprint_zero_status !== ESprintZeroStatus.Complete).length,
    total_projects: wsProjects.length,
    active_cycles: wsCycles.length,
    completed_stories: wsStories.filter((s) => s.status === EStoryStatus.Done).length,
    total_stories: wsStories.length,
    sprint_zero_complete: wsProjects.filter((p) => p.sprint_zero_status === ESprintZeroStatus.Complete).length,
    members_active: workspaceMembers.filter((m) => m.workspace_slug === slug && m.status === EMemberStatus.Active).length,
    project_progress: wsProjects.map((p) => ({
      project_id: p.id,
      project_name: p.name,
      identifier: p.identifier,
      progress_pct: p.sprint_zero_progress,
    })),
    velocity: wsCycles
      .filter((c) => !c.is_sprint_zero)
      .slice(0, 6)
      .map((c) => {
        const p = wsProjects.find((pr) => pr.id === c.project_id);
        return {
          cycle_name: c.name,
          project_name: p?.name ?? "",
          completed: c.completed_story_count,
          committed: c.story_count,
        };
      }),
    active_cycle_details: wsCycles.map((c) => {
      const p = wsProjects.find((pr) => pr.id === c.project_id);
      return {
        cycle_id: c.id,
        cycle_name: c.name,
        project_id: c.project_id,
        project_name: p?.name ?? "",
        story_count: c.story_count,
        completed_story_count: c.completed_story_count,
        end_date: c.end_date,
      };
    }),
  };
}

// Canned repo list for the mock GitHub account (create-project + project GitHub
// dialog repo pickers). Mirrors the real /github/repos/ response shape.
const MOCK_GITHUB_REPOS: IGitHubRepo[] = [
  { full_name: "acme-corp/web-app", url: "https://github.com/acme-corp/web-app", default_branch: "main" },
  { full_name: "acme-corp/api", url: "https://github.com/acme-corp/api", default_branch: "main" },
  { full_name: "acme-corp/mobile", url: "https://github.com/acme-corp/mobile", default_branch: "main" },
  { full_name: "acme-corp/design-system", url: "https://github.com/acme-corp/design-system", default_branch: "develop" },
  { full_name: "acme-corp/docs", url: "https://github.com/acme-corp/docs", default_branch: "main" },
];

const handlers: Handler[] = [
  // Project Journey (mock-only shell — no backend yet, GIN-428)
  {
    method: "GET",
    pattern: /^\/workspaces\/[^/]+\/projects\/([^/]+)\/journey\/$/,
    resolve: (m) => clone(journeyForProject(m[1])),
  },
  // Marketplace (mock-only domain — no backend yet)
  {
    method: "GET",
    pattern: /^\/marketplace\/jobs\/$/,
    resolve: () => clone(marketplaceJobs),
  },
  {
    method: "GET",
    pattern: /^\/marketplace\/jobs\/([^/]+)\/$/,
    resolve: (m) => clone(marketplaceJobs.find((j) => j.id === m[1]) ?? notFound("Job")),
  },
  {
    method: "GET",
    pattern: /^\/marketplace\/talent\/$/,
    resolve: () => clone(marketplaceFreelancers),
  },
  {
    method: "GET",
    pattern: /^\/marketplace\/talent\/([^/]+)\/$/,
    resolve: (m) => clone(marketplaceFreelancers.find((f) => f.id === m[1]) ?? notFound("Freelancer")),
  },
  // Admin staff console (mirrors /api/admin/* backend contract)
  { method: "GET", pattern: /^\/admin\/me\/$/, resolve: () => clone(staffMe) },
  { method: "GET", pattern: /^\/admin\/privileges\/$/, resolve: () => clone(privilegeCatalog) },
  // Admin manual plan override (GIN-30 Slice 1) — echoes the applied plan.
  {
    method: "POST",
    pattern: /^\/admin\/billing\/workspaces\/([^/]+)\/plan\/$/,
    resolve: ([, slug], body) => {
      const b = (body ?? {}) as { tier?: string; interval?: string };
      return {
        workspace_slug: slug,
        tier: b.tier ?? "pro",
        interval: b.interval ?? "monthly",
        status: "active",
      };
    },
  },
  // Admin plan-price config (GIN-30 Slice 2).
  {
    method: "GET",
    pattern: /^\/admin\/billing\/plans\/$/,
    resolve: () => clone(mockPlanPrices),
  },
  {
    method: "PUT",
    pattern: /^\/admin\/billing\/plans\/([^/]+)\/([^/]+)\/price\/$/,
    resolve: ([, tier, interval], body) => {
      const b = (body ?? {}) as { amount_cents?: number; currency?: string };
      const row = mockPlanPrices.find((p) => p.tier === tier && p.interval === interval);
      if (!row) throw new APIError(400, "Not a purchasable tier/interval");
      row.unit_amount_cents = b.amount_cents ?? 0;
      row.currency = b.currency ?? "usd";
      row.stripe_product_id = row.stripe_product_id ?? `fake_prod_${tier}`;
      row.stripe_price_id = `fake_price_${tier}_${interval}_${row.unit_amount_cents}`;
      row.active = true;
      row.configured = true;
      return clone(row);
    },
  },
  { method: "GET", pattern: /^\/admin\/roles\/$/, resolve: () => clone(staffRoles) },
  {
    method: "POST",
    pattern: /^\/admin\/roles\/$/,
    resolve: (_, body) => {
      const b = body as { name: string; description?: string; privileges?: string[] };
      if (!b.name?.trim()) throw new APIError(400, "Name is required");
      const now = new Date().toISOString();
      const created: IStaffRole = {
        id: `role_${++roleSeq}`,
        name: b.name.trim(),
        description: b.description?.trim() ?? "",
        privileges: [...new Set(b.privileges ?? [])].sort(),
        is_system: false,
        member_count: 0,
        created_at: now,
        updated_at: now,
      };
      staffRoles.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/admin\/roles\/([^/]+)\/$/,
    resolve: ([, roleId], body) => {
      const role = staffRoles.find((r) => r.id === roleId);
      if (!role) return notFound(`Role "${roleId}"`);
      if (role.is_system) throw new APIError(400, "System role cannot be edited");
      const b = body as { name?: string; description?: string; privileges?: string[] };
      if (b.name !== undefined) role.name = b.name.trim();
      if (b.description !== undefined) role.description = b.description.trim();
      if (b.privileges !== undefined) role.privileges = [...new Set(b.privileges)].sort();
      role.updated_at = new Date().toISOString();
      return clone(role);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/admin\/roles\/([^/]+)\/$/,
    resolve: ([, roleId]) => {
      const role = staffRoles.find((r) => r.id === roleId);
      if (!role) return notFound(`Role "${roleId}"`);
      if (role.is_system) throw new APIError(400, "System role cannot be deleted");
      if (staffMembers.some((m) => m.role_id === roleId)) {
        throw new APIError(409, "Reassign members before deleting this role");
      }
      staffRoles.splice(staffRoles.indexOf(role), 1);
      return undefined;
    },
  },
  { method: "GET", pattern: /^\/admin\/staff\/$/, resolve: () => clone(staffMembers) },
  {
    method: "POST",
    pattern: /^\/admin\/staff\/$/,
    resolve: (_, body) => {
      const b = body as { user_id: string; role_id: string };
      const user = users.find((u) => u.id === b.user_id);
      if (!user) return notFound(`User "${b.user_id}"`);
      const role = staffRoles.find((r) => r.id === b.role_id);
      if (!role) return notFound(`Role "${b.role_id}"`);
      if (staffMembers.some((m) => m.user_id === b.user_id)) {
        throw new APIError(409, "User is already staff");
      }
      const created: IStaffMember = {
        id: `staff_${++staffSeq}`,
        user_id: user.id,
        display_name: user.display_name,
        email: user.email,
        avatar_url: user.avatar_url,
        role_id: role.id,
        role_name: role.name,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      staffMembers.push(created);
      role.member_count += 1;
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/admin\/staff\/([^/]+)\/$/,
    resolve: ([, memberId], body) => {
      const member = staffMembers.find((m) => m.id === memberId);
      if (!member) return notFound(`Staff member "${memberId}"`);
      const b = body as { role_id?: string; is_active?: boolean };
      if (b.role_id !== undefined) {
        const role = staffRoles.find((r) => r.id === b.role_id);
        if (!role) return notFound(`Role "${b.role_id}"`);
        member.role_id = role.id;
        member.role_name = role.name;
      }
      if (b.is_active !== undefined) member.is_active = b.is_active;
      return clone(member);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/admin\/staff\/([^/]+)\/$/,
    resolve: ([, memberId]) => {
      const i = staffMembers.findIndex((m) => m.id === memberId);
      if (i < 0) return notFound(`Staff member "${memberId}"`);
      const [removed] = staffMembers.splice(i, 1);
      const role = staffRoles.find((r) => r.id === removed.role_id);
      if (role && role.member_count > 0) role.member_count -= 1;
      return undefined;
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/users\/$/,
    resolve: (_match, _body, query) => {
      const q = query.get("q")?.trim().toLowerCase();
      const status = query.get("status") ?? "all";
      let rows = platformUsers;
      if (status === "active") rows = rows.filter((u) => !u.is_suspended);
      if (status === "suspended") rows = rows.filter((u) => u.is_suspended);
      if (q) {
        rows = rows.filter(
          (u) =>
            u.display_name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        );
      }
      const { limit = 50, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/users\/([^/]+)\/workspaces\/$/,
    resolve: ([, userId]) => {
      if (!platformUsers.find((u) => u.id === userId)) return notFound(`User "${userId}"`);
      return clone(platformUserWorkspaces(userId));
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/users\/([^/]+)\/activity\/$/,
    resolve: ([, userId], _body, query) => {
      if (!platformUsers.find((u) => u.id === userId)) return notFound(`User "${userId}"`);
      const filtered = auditLogs.filter(
        (log) => log.target_type === "user" && log.target_id === userId,
      );
      const rows = [...filtered].reverse();
      const { limit = 50, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/users\/([^/]+)\/$/,
    resolve: ([, userId]) => {
      const user = platformUsers.find((u) => u.id === userId);
      if (!user) return notFound(`User "${userId}"`);
      return clone(user);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/admin\/users\/([^/]+)\/$/,
    resolve: ([, userId], body) => {
      const user = platformUsers.find((u) => u.id === userId);
      if (!user) return notFound(`User "${userId}"`);
      const b = body as {
        is_suspended?: boolean;
        reason?: string;
        display_name?: string;
        email_digest?: boolean;
        product_updates?: boolean;
      };
      if (b.is_suspended !== undefined) {
        user.is_suspended = b.is_suspended;
        user.suspended_at = b.is_suspended ? new Date().toISOString() : null;
        user.last_suspend_reason = b.is_suspended ? (b.reason ?? null) : null;
        auditLogs.push({
          id: `audit_${auditLogs.length + 1}`,
          actor_staff_id: staffMembers[0]?.id ?? null,
          actor_name: staffMe.display_name,
          action: b.is_suspended ? "user.suspend" : "user.unsuspend",
          target_type: "user",
          target_id: userId,
          metadata: {
            before: { is_suspended: !b.is_suspended },
            after: { is_suspended: b.is_suspended },
            ...(b.reason ? { reason: b.reason } : {}),
          },
          ip_address: null,
          created_at: new Date().toISOString(),
        });
      }
      if (b.display_name !== undefined) user.display_name = b.display_name.trim();
      if (b.email_digest !== undefined) user.email_digest = b.email_digest;
      if (b.product_updates !== undefined) user.product_updates = b.product_updates;
      if (
        b.display_name !== undefined ||
        b.email_digest !== undefined ||
        b.product_updates !== undefined
      ) {
        auditLogs.push({
          id: `audit_${auditLogs.length + 1}`,
          actor_staff_id: staffMembers[0]?.id ?? null,
          actor_name: staffMe.display_name,
          action: "user.update",
          target_type: "user",
          target_id: userId,
          metadata: { after: { display_name: user.display_name } },
          ip_address: null,
          created_at: new Date().toISOString(),
        });
      }
      return clone(user);
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/audit-logs\/$/,
    resolve: (_match, _body, query) => {
      const action = query.get("action");
      const actorStaffId = query.get("actor_staff_id");
      const createdFrom = query.get("created_from");
      const createdTo = query.get("created_to");
      const filtered = auditLogs.filter(
        (log) =>
          (!action || log.action === action) &&
          (!actorStaffId || log.actor_staff_id === actorStaffId) &&
          (!createdFrom || log.created_at >= createdFrom) &&
          (!createdTo || log.created_at <= createdTo),
      );
      const rows = [...filtered].reverse();
      const { limit = 100, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/summary\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageSummary(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/timeseries\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageTimeseries(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/heatmap-daily\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageHeatmapDaily(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/heatmap-hourly\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageHeatmapHourly(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/matrix\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageMatrix(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/by-workspace\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageByWorkspace(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/by-user\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageByUser(readLlmUsageFilters(query))),
  },
  {
    method: "GET",
    pattern: /^\/admin\/llm-usage\/events\/$/,
    resolve: (_match, _body, query) => clone(getLlmUsageEvents(readLlmUsageFilters(query))),
  },
  // Auth
  {
    method: "GET",
    pattern: /^\/auth\/me\/$/,
    resolve: () => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      return clone(currentUser);
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/sign-in\/$/,
    resolve: (_, body) => {
      const { email } = body as ISignInPayload;
      const u = users.find((x) => x.email === email) ?? users[0];
      currentUser = {
        id: u.id,
        display_name: u.display_name,
        email: u.email,
        avatar_url: u.avatar_url,
        last_workspace_slug: "acme",
        email_digest: true,
        product_updates: true,
        email_verified: true,
      };
      return clone(currentUser);
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/sign-up\/$/,
    resolve: (_, body) => {
      const b = body as ISignUpPayload;
      currentUser = {
        id: `u_${Date.now()}`,
        display_name: b.display_name,
        email: b.email,
        avatar_url: null,
        last_workspace_slug: null,
        email_digest: true,
        product_updates: false,
        email_verified: false,
      };
      return clone(currentUser);
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/forgot-password\/$/,
    resolve: () => ({ success: true }),
  },
  {
    method: "POST",
    pattern: /^\/auth\/reset-password\/$/,
    resolve: (_, body) => {
      const b = body as { token?: string; new_password?: string };
      if (b.token !== "demo-reset-token") {
        throw new APIError(400, "Invalid or expired reset token");
      }
      if (!b.new_password || b.new_password.length < 8) {
        throw new APIError(400, "Password must be at least 8 characters");
      }
      return { success: true };
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/invitations\/([^/]+)\/accept\/$/,
    resolve: ([, token]) => {
      if (token !== "demo-invite-token") {
        throw new APIError(400, "Invalid invitation token");
      }
      return { workspace_slug: "acme" };
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/sign-out\/$/,
    resolve: () => {
      currentUser = null;
      return { success: true };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/auth\/me\/$/,
    resolve: (_, body) => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const b = body as { display_name?: string; email_digest?: boolean; product_updates?: boolean };
      if (b.display_name) currentUser.display_name = b.display_name;
      if (b.email_digest !== undefined) currentUser.email_digest = b.email_digest;
      if (b.product_updates !== undefined) currentUser.product_updates = b.product_updates;
      return clone(currentUser);
    },
  },
  {
    method: "GET",
    pattern: /^\/auth\/me\/pending-invites\/$/,
    resolve: () => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const me = currentUser.email;
      // Both kinds, as the API returns them: a membership an admin created, and
      // an emailed invitation with no user attached yet (user_id "").
      const invited = workspaceInvitations
        .filter((inv) => inv.email === me && inv.status === EInvitationStatus.Pending)
        .map((inv) => ({
          id: inv.id,
          workspace_slug: inv.workspace_slug,
          user_id: "",
          display_name: inv.email,
          email: inv.email,
          avatar_url: null,
          role: inv.role,
          status: EMemberStatus.Pending,
          created_at: inv.created_at,
        }));
      return clone([
        ...workspaceMembers.filter(
          (m) => m.email === me && m.status === EMemberStatus.Pending,
        ),
        ...invited,
      ]);
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/me\/pending-invites\/([^/]+)\/accept\/$/,
    resolve: ([, invitationId]) => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const inv = workspaceInvitations.find(
        (i) => i.id === invitationId && i.email === currentUser!.email,
      );
      // 404 for "not yours" too — the real API refuses to confirm that someone
      // else's invitation exists.
      if (!inv || inv.status !== EInvitationStatus.Pending) {
        return notFound(`Invitation "${invitationId}"`);
      }
      if (!currentUser.email_verified) {
        throw new APIError(403, "Verify your email address to join this workspace.");
      }
      inv.status = EInvitationStatus.Accepted;
      inv.accepted_at = new Date().toISOString();
      return { workspace_slug: inv.workspace_slug };
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/change-password\/$/,
    resolve: (_, body) => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const b = body as { current_password?: string; new_password?: string };
      if (!b.current_password?.trim() || !b.new_password?.trim()) {
        throw new APIError(400, "Current and new password are required");
      }
      if (b.new_password.length < 8) {
        throw new APIError(400, "New password must be at least 8 characters");
      }
      return { success: true };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/auth\/change-password\/$/,
    resolve: (_, body) => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const b = body as { current_password?: string; new_password?: string };
      if (!b.current_password?.trim() || !b.new_password?.trim()) {
        throw new APIError(400, "Current and new password are required");
      }
      if (b.new_password.length < 8) {
        throw new APIError(400, "New password must be at least 8 characters");
      }
      return { success: true };
    },
  },
  // Personal access tokens (developer/API auth) — user-scoped, no workspaceSlug.
  {
    method: "GET",
    pattern: /^\/auth\/tokens\/$/,
    resolve: () => clone(mockTokens),
  },
  {
    method: "POST",
    pattern: /^\/auth\/tokens\/$/,
    resolve: (_, body) => {
      const b = body as { name?: string };
      if (!b.name?.trim()) throw new APIError(400, "Name is required");
      return clone(makeCreatedToken(b.name.trim()));
    },
  },
  {
    method: "DELETE",
    pattern: /^\/auth\/tokens\/([^/]+)\/$/,
    resolve: ([, tokenId]) => {
      const token = mockTokens.find((t) => t.id === tokenId);
      if (!token) return notFound(`Token "${tokenId}"`);
      token.revoked_at ??= new Date().toISOString();
      return undefined;
    },
  },
  // OAuth MCP grants (hosted MCP connected apps) — user-scoped.
  {
    method: "GET",
    pattern: /^\/oauth\/grants\/$/,
    resolve: () => clone(mockOAuthGrants),
  },
  {
    method: "DELETE",
    pattern: /^\/oauth\/grants\/([^/]+)\/$/,
    resolve: ([, clientId]) => {
      const idx = mockOAuthGrants.findIndex((g) => g.client_id === clientId);
      if (idx < 0) return notFound(`Grant "${clientId}"`);
      mockOAuthGrants.splice(idx, 1);
      return undefined;
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/$/,
    resolve: (_, body) => {
      const b = body as ICreateWorkspacePayload;
      const slug = b.slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (workspaces.some((w) => w.slug === slug)) throw new APIError(409, "Slug taken");
      const now = "2026-07-01T00:00:00Z";
      const created: IWorkspace = {
        id: `ws_${++wsSeq}`,
        slug,
        name: b.name,
        logo_url: null,
        member_count: 1,
        project_count: 0,
        github_connected: false,
        github_repo_url: null,
        holidays: [],
        created_at: now,
        updated_at: now,
      };
      workspaces.push(created);
      if (currentUser) currentUser.last_workspace_slug = slug;
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/$/,
    resolve: ([, slug], body) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws) return notFound(`Workspace "${slug}"`);
      const b = body as { name?: string };
      if (b.name) ws.name = b.name;
      ws.updated_at = new Date().toISOString();
      return clone(ws);
    },
  },
  // Workspaces
  {
    method: "GET",
    pattern: /^\/workspaces\/$/,
    resolve: () => clone(workspaces),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/$/,
    resolve: ([, slug]) => clone(workspaces.find((w) => w.slug === slug) ?? notFound(`Workspace "${slug}"`)),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/members\/$/,
    resolve: ([, slug]) => clone(workspaceMembers.filter((m) => m.workspace_slug === slug)),
  },
  // User directory
  {
    method: "GET",
    pattern: /^\/users\/$/,
    resolve: (_match, _body, query) => {
      const q = query.get("q")?.trim().toLowerCase();
      let rows = users;
      if (q) {
        rows = rows.filter(
          (u) =>
            u.display_name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        );
      }
      const { limit = 50, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/users\/([^/]+)\/$/,
    resolve: ([, userId]) =>
      clone(users.find((u) => u.id === userId) ?? notFound(`User "${userId}"`)),
  },
  // Add a workspace member (directory pick: {user_id}, or invite: {email})
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/members\/$/,
    resolve: ([, slug], body) => {
      const b = body as { user_id?: string; email?: string };
      const id = `wm_${++wmSeq}`;
      let member: IWorkspaceMember;
      if (b.user_id) {
        const u = users.find((x) => x.id === b.user_id) ?? notFound(`User "${b.user_id}"`);
        member = {
          id, workspace_slug: slug, user_id: u.id, display_name: u.display_name,
          email: u.email, avatar_url: u.avatar_url, role: EWorkspaceRole.Member,
          status: EMemberStatus.Active, created_at: new Date().toISOString(),
        };
      } else if (b.email) {
        member = {
          id, workspace_slug: slug, user_id: `u_pending_${id}`, display_name: b.email,
          email: b.email, avatar_url: null, role: EWorkspaceRole.Member,
          status: EMemberStatus.Pending, created_at: new Date().toISOString(),
        };
      } else {
        throw new APIError(400, "user_id or email required");
      }
      workspaceMembers.push(member);
      const ws = workspaces.find((w) => w.slug === slug);
      if (ws) ws.member_count = workspaceMembers.filter((m) => m.workspace_slug === slug).length;
      return clone(member);
    },
  },
  // Change a workspace member's role or accept a pending invite
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/members\/([^/]+)\/$/,
    resolve: ([, slug, memberId], body) => {
      const member = workspaceMembers.find((m) => m.workspace_slug === slug && m.id === memberId);
      if (!member) return notFound(`Member "${memberId}"`);
      const b = body as { role?: EWorkspaceRole; accept?: boolean };
      if (b.accept) {
        if (member.status !== EMemberStatus.Pending) {
          throw new APIError(400, "Invite is not pending");
        }
        if (!currentUser || member.email !== currentUser.email) {
          throw new APIError(403, "Invite email does not match signed-in user");
        }
        member.status = EMemberStatus.Active;
        member.user_id = currentUser.id;
        member.display_name = currentUser.display_name;
        member.avatar_url = currentUser.avatar_url;
      }
      if (b.role) member.role = b.role;
      return clone(member);
    },
  },
  // Remove a workspace member (or revoke a pending invite)
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/members\/([^/]+)\/$/,
    resolve: ([, slug, memberId]) => {
      const i = workspaceMembers.findIndex((m) => m.workspace_slug === slug && m.id === memberId);
      if (i === -1) return notFound(`Member "${memberId}"`);
      workspaceMembers.splice(i, 1);
      const ws = workspaces.find((w) => w.slug === slug);
      if (ws) ws.member_count = workspaceMembers.filter((m) => m.workspace_slug === slug).length;
      return { success: true };
    },
  },

  // Projects
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/$/,
    resolve: ([, slug], _body, query) => {
      const wsProjects = projects.filter((p) => p.workspace_slug === slug);
      const showAll = query.get("all") === "true";
      const isAdmin = workspaceMembers.some(
        (m) =>
          m.workspace_slug === slug &&
          m.user_id === currentUser?.id &&
          (m.role === EWorkspaceRole.Owner || m.role === EWorkspaceRole.Admin),
      );
      if (showAll && isAdmin) return clone(wsProjects);
      const memberProjectIds = new Set(
        projectMembers
          .filter((m) => m.user_id === currentUser?.id && m.status === EMemberStatus.Active)
          .map((m) => m.project_id),
      );
      return clone(wsProjects.filter((p) => memberProjectIds.has(p.id)));
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/$/,
    resolve: ([, slug, id]) =>
      clone(
        projects.find((p) => p.workspace_slug === slug && p.id === id) ??
          notFound(`Project "${id}"`),
      ),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/activity\/$/,
    resolve: ([, , id]) =>
      clone(
        projectActivity
          .filter((a) => a.project_id === id)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      ),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/$/,
    resolve: ([, slug, id], body) => {
      const project = projects.find((p) => p.workspace_slug === slug && p.id === id);
      if (!project) return notFound(`Project "${id}"`);
      const b = body as {
        name?: string;
        description?: string;
        overview?: string;
        identifier?: string;
        has_ui?: boolean;
        start_date?: string;
        target_date?: string;
        lead_id?: string | null;
        cover_image_url?: string;
        logo_emoji?: string | null;
        logo_color?: string | null;
        logo_image_url?: string | null;
      };
      if (b.name) project.name = b.name.trim();
      if (b.description !== undefined) project.description = b.description.trim();
      if (b.overview !== undefined) project.overview = b.overview;
      if (b.identifier) project.identifier = b.identifier.trim().toUpperCase();
      if (b.has_ui !== undefined) project.has_ui = b.has_ui;
      if (b.start_date) project.start_date = b.start_date;
      if (b.target_date) project.target_date = b.target_date;
      if (b.lead_id !== undefined) project.lead_id = b.lead_id;
      if (b.cover_image_url) project.cover_image_url = b.cover_image_url;
      if (b.logo_emoji !== undefined) project.logo_emoji = b.logo_emoji;
      if (b.logo_color !== undefined) project.logo_color = b.logo_color;
      if (b.logo_image_url !== undefined) project.logo_image_url = b.logo_image_url;
      project.updated_at = new Date().toISOString();
      return clone(project);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/$/,
    resolve: ([, slug, id]) => {
      const i = projects.findIndex((p) => p.workspace_slug === slug && p.id === id);
      if (i === -1) return notFound(`Project "${id}"`);
      projects.splice(i, 1);
      const ws = workspaces.find((w) => w.slug === slug);
      if (ws) ws.project_count = projects.filter((p) => p.workspace_slug === slug).length;
      return { success: true };
    },
  },
  // Project labels
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/labels\/$/,
    resolve: ([, , projectId]) =>
      clone(projectLabels.filter((l) => l.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/labels\/$/,
    resolve: ([, , projectId], body) => {
      const b = body as { name: string; color: string };
      const now = new Date().toISOString();
      const created = {
        id: `lbl_${++lblSeq}`,
        project_id: projectId,
        name: b.name.trim(),
        color: b.color,
        created_at: now,
      };
      projectLabels.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/labels\/([^/]+)\/$/,
    resolve: ([, , projectId, labelId]) => {
      const i = projectLabels.findIndex((l) => l.project_id === projectId && l.id === labelId);
      if (i === -1) return notFound(`Label "${labelId}"`);
      projectLabels.splice(i, 1);
      return { success: true };
    },
  },
  // Project workflow states
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/states\/$/,
    resolve: ([, , projectId]) =>
      clone(
        projectStates
          .filter((s) => s.project_id === projectId)
          .sort((a, b) => a.order - b.order),
      ),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/states\/$/,
    resolve: ([, , projectId], body) => {
      const b = body as { name: string; color: string; group: string };
      const existing = projectStates.filter((s) => s.project_id === projectId);
      const created = {
        id: `pst_${++pstSeq}`,
        project_id: projectId,
        name: b.name.trim(),
        color: b.color,
        group: b.group as (typeof projectStates)[number]["group"],
        order: existing.length,
      };
      projectStates.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/states\/([^/]+)\/$/,
    resolve: ([, , projectId, stateId]) => {
      const i = projectStates.findIndex((s) => s.project_id === projectId && s.id === stateId);
      if (i === -1) return notFound(`State "${stateId}"`);
      projectStates.splice(i, 1);
      return { success: true };
    },
  },
  // Project features (toggles)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/features\/$/,
    resolve: ([, , projectId]) =>
      clone(projectFeatures.filter((f) => f.project_id === projectId)),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/features\/([^/]+)\/$/,
    resolve: ([, , projectId, featureId], body) => {
      const feat = projectFeatures.find((f) => f.project_id === projectId && f.id === featureId);
      if (!feat) return notFound(`Feature "${featureId}"`);
      const enabled = (body as { enabled?: boolean }).enabled;
      if (enabled !== undefined) feat.enabled = enabled;
      return clone(feat);
    },
  },
  // Project estimates
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/estimates\/$/,
    resolve: ([, , projectId]) =>
      clone(projectEstimates.filter((e) => e.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/estimates\/$/,
    resolve: ([, , projectId], body) => {
      const b = body as { name: string; type: string; description?: string };
      const now = new Date().toISOString();
      const created = {
        id: `est_${++estSeq}`,
        project_id: projectId,
        name: b.name.trim(),
        type: b.type as (typeof projectEstimates)[number]["type"],
        description: b.description?.trim() ?? "",
        created_at: now,
      };
      projectEstimates.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/estimates\/([^/]+)\/$/,
    resolve: ([, , projectId, estimateId]) => {
      const i = projectEstimates.findIndex((e) => e.project_id === projectId && e.id === estimateId);
      if (i === -1) return notFound(`Estimate "${estimateId}"`);
      projectEstimates.splice(i, 1);
      return { success: true };
    },
  },
  // Project automations
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/automations\/$/,
    resolve: ([, , projectId]) =>
      clone(projectAutomations.filter((a) => a.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/automations\/$/,
    resolve: ([, , projectId], body) => {
      const b = body as { name: string; trigger: string; action: string };
      const now = new Date().toISOString();
      const created = {
        id: `auto_${++autoSeq}`,
        project_id: projectId,
        name: b.name.trim(),
        trigger: b.trigger.trim(),
        action: b.action.trim(),
        enabled: true,
        created_at: now,
      };
      projectAutomations.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/automations\/([^/]+)\/$/,
    resolve: ([, , projectId, automationId]) => {
      const i = projectAutomations.findIndex(
        (a) => a.project_id === projectId && a.id === automationId,
      );
      if (i === -1) return notFound(`Automation "${automationId}"`);
      projectAutomations.splice(i, 1);
      return { success: true };
    },
  },
  // Project custom fields
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/custom-fields\/$/,
    resolve: ([, , projectId]) =>
      clone(
        customFields
          .filter((f) => f.project_id === projectId)
          .sort((a, b) => a.sort_order - b.sort_order),
      ),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/custom-fields\/$/,
    resolve: ([, , projectId], body) => {
      const b = body as {
        name: string;
        field_type: (typeof customFields)[number]["field_type"];
        options?: string[] | null;
        sort_order?: number;
      };
      const existing = customFields.filter((f) => f.project_id === projectId);
      const created = {
        id: `cf_${++cfSeq}`,
        project_id: projectId,
        name: b.name.trim(),
        field_type: b.field_type,
        options: b.options ?? null,
        sort_order: b.sort_order ?? existing.length,
        // Deterministic timestamp (no Date.now) to keep mock fixtures stable.
        created_at: "2026-05-04T10:00:00Z",
      };
      customFields.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/custom-fields\/([^/]+)\/$/,
    resolve: ([, , projectId, fieldId], body) => {
      const field = customFields.find((f) => f.project_id === projectId && f.id === fieldId);
      if (!field) return notFound(`Custom field "${fieldId}"`);
      const b = body as { name?: string; options?: string[] | null; sort_order?: number };
      if (b.name !== undefined) field.name = b.name.trim();
      if (b.options !== undefined) field.options = b.options;
      if (b.sort_order !== undefined) field.sort_order = b.sort_order;
      return clone(field);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/custom-fields\/([^/]+)\/$/,
    resolve: ([, , projectId, fieldId]) => {
      const i = customFields.findIndex((f) => f.project_id === projectId && f.id === fieldId);
      if (i === -1) return notFound(`Custom field "${fieldId}"`);
      customFields.splice(i, 1);
      return { success: true };
    },
  },
  // Project members
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/members\/$/,
    resolve: ([, , projectId]) => clone(projectMembers.filter((m) => m.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/members\/$/,
    resolve: ([, slug, projectId], body) => {
      const b = body as { user_id?: string; email?: string };
      const id = `pm_${++pmSeq}`;
      let member: IProjectMember;
      if (b.user_id) {
        const u = users.find((x) => x.id === b.user_id) ?? notFound(`User "${b.user_id}"`);
        member = {
          id, project_id: projectId, user_id: u.id, display_name: u.display_name,
          email: u.email, avatar_url: u.avatar_url, role: EProjectRole.Member,
          status: EMemberStatus.Active,
        };
      } else if (b.email) {
        member = {
          id, project_id: projectId, user_id: `u_pending_${id}`, display_name: b.email,
          email: b.email, avatar_url: null, role: EProjectRole.Member,
          status: EMemberStatus.Pending,
        };
        // Email-invite to a project also creates a pending workspace member.
        workspaceMembers.push({
          id: `wm_${++wmSeq}`, workspace_slug: slug,
          user_id: member.user_id, display_name: b.email, email: b.email, avatar_url: null,
          role: EWorkspaceRole.Member, status: EMemberStatus.Pending,
          created_at: new Date().toISOString(),
        });
        const ws = workspaces.find((w) => w.slug === slug);
        if (ws) ws.member_count = workspaceMembers.filter((m) => m.workspace_slug === slug).length;
      } else {
        throw new APIError(400, "user_id or email required");
      }
      projectMembers.push(member);
      syncProjectMembers(projectId);
      return clone(member);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/members\/([^/]+)\/$/,
    resolve: ([, , projectId, memberId], body) => {
      const member = projectMembers.find((m) => m.project_id === projectId && m.id === memberId);
      if (!member) return notFound(`Member "${memberId}"`);
      const role = (body as { role?: EProjectRole }).role;
      if (role) member.role = role;
      return clone(member);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/members\/([^/]+)\/$/,
    resolve: ([, , projectId, memberId]) => {
      const i = projectMembers.findIndex((m) => m.project_id === projectId && m.id === memberId);
      if (i === -1) return notFound(`Member "${memberId}"`);
      projectMembers.splice(i, 1);
      syncProjectMembers(projectId);
      return { success: true };
    },
  },
  // Cycles (sprints)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/$/,
    resolve: ([, slug, projectId]) =>
      clone(cycles.filter((c) => c.workspace_slug === slug && c.project_id === projectId)),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)\/$/,
    resolve: ([, slug, projectId, cycleId]) =>
      clone(
        cycles.find(
          (c) => c.workspace_slug === slug && c.project_id === projectId && c.id === cycleId,
        ) ?? notFound(`Cycle "${cycleId}"`),
      ),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)\/progress\/$/,
    resolve: ([, slug, projectId, cycleId]) => {
      const cycle = cycles.find(
        (c) => c.workspace_slug === slug && c.project_id === projectId && c.id === cycleId,
      );
      if (!cycle) return notFound(`Cycle "${cycleId}"`);
      const cycleStories = allStories.filter((s) => s.cycle_id === cycleId);
      return clone(buildCycleProgress(cycle, cycleStories, "2026-07-02"));
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/$/,
    resolve: ([, slug, projectId], body) => {
      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      if (!project) return notFound(`Project "${projectId}"`);
      const b = body as { name: string; description?: string; start_date?: string; end_date?: string };
      const now = new Date().toISOString();
      const created = {
        id: `cyc_${++cycSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        name: b.name.trim(),
        description: b.description?.trim() ?? "",
        status: ECycleStatus.Draft,
        is_sprint_zero: false,
        start_date: b.start_date ?? null,
        end_date: b.end_date ?? null,
        story_count: 0,
        completed_story_count: 0,
        created_at: now,
        updated_at: now,
      };
      cycles.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)\/$/,
    resolve: ([, slug, projectId, cycleId], body) => {
      const cycle = cycles.find(
        (c) => c.workspace_slug === slug && c.project_id === projectId && c.id === cycleId,
      );
      if (!cycle) return notFound(`Cycle "${cycleId}"`);
      const b = body as {
        name?: string;
        description?: string;
        start_date?: string | null;
        end_date?: string | null;
        status?: ECycleStatus;
      };
      if (b.name) cycle.name = b.name.trim();
      if (b.description !== undefined) cycle.description = b.description.trim();
      if (b.start_date !== undefined) cycle.start_date = b.start_date;
      if (b.end_date !== undefined) cycle.end_date = b.end_date;
      if (b.status) cycle.status = b.status;
      cycle.updated_at = new Date().toISOString();
      return clone(cycle);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)\/$/,
    resolve: ([, slug, projectId, cycleId]) => {
      const i = cycles.findIndex(
        (c) => c.workspace_slug === slug && c.project_id === projectId && c.id === cycleId,
      );
      if (i < 0) return notFound(`Cycle "${cycleId}"`);
      cycles.splice(i, 1);
      // mirror the backend SET NULL: orphan the cycle's stories
      allStories.forEach((s) => {
        if (s.cycle_id === cycleId) s.cycle_id = null;
      });
      return { success: true };
    },
  },

  // Modules
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/modules\/$/,
    resolve: ([, slug, projectId]) =>
      clone(modules.filter((m) => m.workspace_slug === slug && m.project_id === projectId)),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/modules\/([^/]+)\/$/,
    resolve: ([, slug, projectId, moduleId]) =>
      clone(
        modules.find(
          (m) => m.workspace_slug === slug && m.project_id === projectId && m.id === moduleId,
        ) ?? notFound(`Module "${moduleId}"`),
      ),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/modules\/$/,
    resolve: ([, slug, projectId], body) => {
      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      if (!project) return notFound(`Project "${projectId}"`);
      const b = body as { name: string; description?: string };
      const now = new Date().toISOString();
      const created = {
        id: `mod_${++modSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        name: b.name.trim(),
        description: b.description?.trim() ?? "",
        status: EModuleStatus.Backlog,
        lead_id: currentUser?.id ?? null,
        story_count: 0,
        completed_story_count: 0,
        created_at: now,
        updated_at: now,
      };
      modules.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/modules\/([^/]+)\/$/,
    resolve: ([, slug, projectId, moduleId], body) => {
      const mod = modules.find(
        (m) => m.workspace_slug === slug && m.project_id === projectId && m.id === moduleId,
      );
      if (!mod) return notFound(`Module "${moduleId}"`);
      const b = body as { name?: string; description?: string; status?: EModuleStatus };
      if (b.name) mod.name = b.name.trim();
      if (b.description !== undefined) mod.description = b.description.trim();
      if (b.status) mod.status = b.status;
      mod.updated_at = new Date().toISOString();
      return clone(mod);
    },
  },

  // Workspace analytics
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/analytics\/$/,
    resolve: ([, slug]) => clone(buildAnalytics(slug)),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/billing\/wallet\/$/,
    resolve: ([, slug]) => {
      if (!walletBySlug[slug]) {
        walletBySlug[slug] = { available_cents: 0, held_cents: 0, currency: "usd" };
      }
      return clone(walletBySlug[slug]);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/billing\/transactions\/$/,
    resolve: ([, slug]) => clone(walletTxnsBySlug[slug] ?? []),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/billing\/topup\/$/,
    resolve: ([, slug], body) => {
      const b = body as { amount_cents?: number };
      const amount = b.amount_cents ?? 0;
      if (amount <= 0) throw new APIError(400, "amount must be positive");
      const wallet = walletBySlug[slug] ?? { available_cents: 0, held_cents: 0, currency: "usd" };
      wallet.available_cents += amount;
      walletBySlug[slug] = wallet;
      const txn = {
        id: `wt_${Date.now()}`,
        type: "topup",
        amount_cents: amount,
        available_after: wallet.available_cents,
        held_after: wallet.held_cents,
        ref_type: "topup",
        created_at: new Date().toISOString(),
      };
      walletTxnsBySlug[slug] = [txn, ...(walletTxnsBySlug[slug] ?? [])];
      return {
        checkout_url: `http://localhost:3000/${slug}/settings/billing?topup=success`,
        provider_ref: "mock_pi",
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/billing\/subscription\/$/,
    resolve: ([, slug]: string[]) => clone(getMockSubscription(slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/billing\/checkout\/$/,
    resolve: ([, slug]: string[]) => ({
      checkout_url: `/${slug}/settings/billing?checkout=success`,
    }),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/billing\/portal\/$/,
    resolve: ([, slug]: string[]) => ({
      checkout_url: `/${slug}/settings/billing?portal=fake`,
    }),
  },
  {
    method: "GET",
    pattern: /^\/billing\/connect\/status\/$/,
    resolve: () => ({ status: "active", payouts_enabled: true }),
  },
  {
    method: "POST",
    pattern: /^\/billing\/connect\/onboard\/$/,
    resolve: () => ({ url: "/marketplace/profile?mock_onboard=1" }),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/ai-usage\/$/,
    resolve: ([, slug]) => clone(getWorkspaceUsage(slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/ai-usage\/estimate\/$/,
    resolve: () => ({ ok: true }), // estimate resolves client-side; endpoint reserved for cutover
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/thread\/([^/]+)\/usage\/$/,
    resolve: ([, , , , threadId]) => clone(getThreadUsage(threadId)),
  },
  // Webhooks
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/$/,
    resolve: ([, slug]) => clone(webhooks.filter((w) => w.workspace_slug === slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/$/,
    resolve: ([, slug], body) => {
      const b = body as { url?: string; events?: string[] };
      if (!b.url?.trim()) throw new APIError(400, "URL is required");
      const now = new Date().toISOString();
      const created = {
        id: `wh_${++whSeq}`,
        workspace_slug: slug,
        url: b.url.trim(),
        events: b.events ?? ["story.created"],
        secret_preview: `whsec_••••••••${Math.random().toString(16).slice(2, 6)}`,
        enabled: true,
        last_delivery: null,
        created_at: now,
        updated_at: now,
      };
      webhooks.push(created);
      return clone(created);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/([^/]+)\/$/,
    resolve: ([, slug, webhookId]) =>
      clone(
        webhooks.find((w) => w.workspace_slug === slug && w.id === webhookId) ??
          notFound(`Webhook "${webhookId}"`),
      ),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/([^/]+)\/$/,
    resolve: ([, slug, webhookId], body) => {
      const wh = webhooks.find((w) => w.workspace_slug === slug && w.id === webhookId);
      if (!wh) return notFound(`Webhook "${webhookId}"`);
      const b = body as { url?: string; events?: string[]; enabled?: boolean };
      if (b.url !== undefined) wh.url = b.url.trim();
      if (b.events !== undefined) wh.events = b.events;
      if (b.enabled !== undefined) wh.enabled = b.enabled;
      wh.updated_at = new Date().toISOString();
      return clone(wh);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/([^/]+)\/$/,
    resolve: ([, slug, webhookId]) => {
      const i = webhooks.findIndex((w) => w.workspace_slug === slug && w.id === webhookId);
      if (i < 0) return notFound(`Webhook "${webhookId}"`);
      webhooks.splice(i, 1);
      return undefined;
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/webhooks\/([^/]+)\/test\/$/,
    resolve: ([, slug, webhookId]) => {
      const wh = webhooks.find((w) => w.workspace_slug === slug && w.id === webhookId);
      if (!wh) return notFound(`Webhook "${webhookId}"`);
      const now = new Date().toISOString();
      const delivery = {
        id: `del_${++whSeq}`,
        status: "success" as const,
        response_code: 200,
        created_at: now,
      };
      wh.last_delivery = delivery;
      wh.updated_at = now;
      return clone(delivery);
    },
  },
  // Workspace time-tracking report (GIN-58 by person / GIN-59 by work item)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/time-entries\/$/,
    resolve: ([, slug], _body, query) => {
      const userId = query.get("user_id");
      const storyId = query.get("story_id");
      const rows = timeEntries
        .map((e) => {
          const story = allStories.find((s) => s.id === e.story_id);
          if (!story || story.workspace_slug !== slug) return null;
          const project = projects.find((p) => p.id === story.project_id);
          return {
            id: e.id,
            hours: e.hours,
            note: e.note,
            created_at: e.created_at,
            user_id: e.user_id,
            user_name: e.user_name,
            user_avatar_url: e.user_avatar_url,
            story_id: story.id,
            story_title: story.title,
            story_code: `${project?.identifier ?? "—"}-${story.story_number ?? story.order ?? 0}`,
            project_id: story.project_id,
            project_name: project?.name ?? "Project",
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .filter((r) => (userId ? r.user_id === userId : true))
        .filter((r) => (storyId ? r.story_id === storyId : true))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return clone(rows);
    },
  },
  // Stickies
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/stickies\/$/,
    resolve: ([, slug]) => clone(stickies.filter((s) => s.workspace_slug === slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/stickies\/$/,
    resolve: ([, slug], body) => {
      const b = body as { body?: string; color?: string };
      // Notes are created blank and edited inline (click-to-type), so an empty
      // body is valid on create.
      const now = new Date().toISOString();
      const created = {
        id: `stk_${++stkSeq}`,
        workspace_slug: slug,
        body: (b.body ?? "").trim(),
        color: b.color ?? "#fbbf24",
        created_at: now,
        updated_at: now,
      };
      stickies.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/stickies\/([^/]+)\/$/,
    resolve: ([, slug, stickyId], body) => {
      const sticky = stickies.find((s) => s.workspace_slug === slug && s.id === stickyId);
      if (!sticky) return notFound(`Sticky "${stickyId}"`);
      const b = body as { body?: string; color?: string };
      if (b.body !== undefined) sticky.body = b.body.trim();
      if (b.color !== undefined) sticky.color = b.color;
      sticky.updated_at = new Date().toISOString();
      return clone(sticky);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/stickies\/([^/]+)\/$/,
    resolve: ([, slug, stickyId]) => {
      const i = stickies.findIndex((s) => s.workspace_slug === slug && s.id === stickyId);
      if (i < 0) return notFound(`Sticky "${stickyId}"`);
      stickies.splice(i, 1);
      return undefined;
    },
  },
  // Dashboards (personal, owner-scoped — GIN-46)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/$/,
    resolve: ([, slug]) =>
      clone(
        dashboards.filter(
          (d) => d.workspace_slug === slug && d.owner_id === currentUser?.id,
        ),
      ),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/$/,
    resolve: ([, slug], body) => {
      const b = body as Partial<IDashboard>;
      if (!b.name?.trim()) throw new APIError(400, "Name is required");
      const now = new Date().toISOString();
      const created: IDashboard = {
        id: `dsh_${++dshSeq}`,
        workspace_slug: slug,
        owner_id: currentUser?.id ?? "u_1",
        name: b.name.trim(),
        description: b.description ?? "",
        is_favorite: false,
        layout: b.layout ?? { columns: 2 },
        config: b.config ?? { widgets: [] },
        visibility: EDashboardVisibility.Private,
        public_token: null,
        published_at: null,
        created_at: now,
        updated_at: now,
      };
      dashboards.push(created);
      return clone(created);
    },
  },
  // Public sharing (GIN-489). The real enforcement is server-side; these mirror
  // the endpoints so the mock-backed app exercises the same flow.
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/share\/$/,
    resolve: ([, slug, id], body) => {
      const d = dashboards.find((x) => x.workspace_slug === slug && x.id === id);
      if (!d) return notFound(`Dashboard "${id}"`);
      const wanted = (body as { visibility?: EDashboardVisibility }).visibility;
      if (wanted === EDashboardVisibility.Public) {
        if (!d.config.widgets.some((w) => PUBLIC_ELIGIBLE_WIDGET_TYPES.has(w.type))) {
          throw new APIError(422, "This dashboard has no widgets that can be shared publicly");
        }
        d.visibility = EDashboardVisibility.Public;
        d.public_token = d.public_token ?? `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        d.published_at = new Date().toISOString();
      } else {
        d.visibility = EDashboardVisibility.Private;
        d.public_token = null;
      }
      return clone(d);
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/share\/regenerate\/$/,
    resolve: ([, slug, id]) => {
      const d = dashboards.find((x) => x.workspace_slug === slug && x.id === id);
      if (!d) return notFound(`Dashboard "${id}"`);
      if (d.visibility !== EDashboardVisibility.Public) {
        throw new APIError(422, "This dashboard is not published");
      }
      d.public_token = `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      return clone(d);
    },
  },
  // Widget data for the public page. The real API applies the widget's stored
  // filters server-side; the mock delegates to the workspace aggregation with
  // the same settings, which keeps one implementation of the maths.
  {
    method: "GET",
    pattern: /^\/public\/dashboards\/([^/]+)\/widgets\/([^/]+)\/(metrics|activity)\/$/,
    resolve: ([, token, widgetId, kind], _body, query) => {
      const d = publishedByToken(token);
      const widget = d.config.widgets.find(
        (w) => w.id === widgetId && PUBLIC_ELIGIBLE_WIDGET_TYPES.has(w.type),
      );
      if (!widget) throw new APIError(404, "This dashboard is unavailable");
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(widget.settings ?? {})) {
        if (value) params.set(key, String(value));
      }
      for (const key of ["date_from", "date_to"]) {
        const value = query.get(key);
        if (value) params.set(key, value);
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      return resolveMock("GET", `/workspaces/${d.workspace_slug}/dashboards/${kind}/${qs}`);
    },
  },
  {
    method: "GET",
    pattern: /^\/public\/dashboards\/([^/]+)\/analytics\/$/,
    resolve: ([, token]) =>
      resolveMock("GET", `/workspaces/${publishedByToken(token).workspace_slug}/analytics/`),
  },
  {
    method: "GET",
    pattern: /^\/public\/dashboards\/([^/]+)\/$/,
    resolve: ([, token]) => {
      const d = publishedByToken(token);
      return clone({
        name: d.name,
        description: d.description,
        updated_at: d.updated_at,
        widgets: d.config.widgets
          .filter((w) => PUBLIC_ELIGIBLE_WIDGET_TYPES.has(w.type))
          .map(({ id, type, title, x, y, w: width, h, settings }) => ({
            id,
            type,
            title,
            x,
            y,
            w: width,
            h,
            // Identity filters stay server-side, same as the real endpoint.
            settings: { metric: settings?.metric, date_range: settings?.date_range },
          })),
      });
    },
  },
  // Dashboard metrics (GIN-54) — declared BEFORE /dashboards/:id/ so "metrics"
  // isn't captured as a dashboard id. Aggregates workspace stories client-side.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/metrics\/$/,
    resolve: ([, slug], _body, query) => {
      let rows = allStories.filter((s) => s.workspace_slug === slug);
      const projectId = query.get("project_id");
      const assigneeId = query.get("assignee_id");
      const priority = query.get("priority");
      const status = query.get("status");
      const dateFrom = query.get("date_from");
      const dateTo = query.get("date_to");
      if (projectId) rows = rows.filter((s) => s.project_id === projectId);
      if (assigneeId) rows = rows.filter((s) => s.assignee_id === assigneeId);
      if (priority) rows = rows.filter((s) => s.priority === priority);
      if (status) rows = rows.filter((s) => s.status === status);
      // Bounds created_at, matching the server; date_to includes its whole day.
      if (dateFrom) rows = rows.filter((s) => s.created_at.slice(0, 10) >= dateFrom);
      if (dateTo) rows = rows.filter((s) => s.created_at.slice(0, 10) <= dateTo);

      const status_counts: Record<string, number> = {};
      for (const s of Object.values(EStoryStatus)) status_counts[s] = 0;
      const priority_counts: Record<string, number> = {};
      for (const p of Object.values(EStoryPriority)) priority_counts[p] = 0;
      const assignee_counts: Record<string, number> = {};
      const assignee_status_counts: Record<string, Record<string, number>> = {};
      const labelTally = new Map<string, number>();
      for (const s of rows) {
        status_counts[s.status] = (status_counts[s.status] ?? 0) + 1;
        priority_counts[s.priority] = (priority_counts[s.priority] ?? 0) + 1;
        const key = s.assignee_id ?? "unassigned";
        assignee_counts[key] = (assignee_counts[key] ?? 0) + 1;
        const row =
          assignee_status_counts[key] ??
          (assignee_status_counts[key] = Object.fromEntries(
            Object.values(EStoryStatus).map((v) => [v, 0]),
          ));
        row[s.status] = (row[s.status] ?? 0) + 1;
        if (s.label_id) labelTally.set(s.label_id, (labelTally.get(s.label_id) ?? 0) + 1);
      }
      const total = rows.length;
      return {
        total,
        open: total - (status_counts[EStoryStatus.Done] ?? 0),
        status_counts,
        priority_counts,
        assignee_counts,
        assignee_status_counts,
        label_counts: Array.from(labelTally, ([id, count]) => ({
          id,
          name: projectLabels.find((l) => l.id === id)?.name ?? "Label",
          color: projectLabels.find((l) => l.id === id)?.color ?? "#94a3b8",
          count,
        })).sort((a, b) => b.count - a.count),
      };
    },
  },
  // Activity vs planned workload (GIN-161, GIN-527). The mock has no
  // status-transition log, so `updated`/`completed` are derived from each item's
  // CURRENT status against its creation day — enough to render the chart, but it
  // cannot show an item moving twice. The real endpoint reads story_activities.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/activity\/$/,
    resolve: ([, slug], _body, query) =>
      mockChartSeries(slug, query, ["created", "updated", "completed"], (s, tally) => {
        tally(s.created_at, "created");
        if (s.status !== EStoryStatus.Todo) tally(s.created_at, "updated");
        if (s.status === EStoryStatus.Done) tally(s.created_at, "completed");
      }),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/planned\/$/,
    resolve: ([, slug], _body, query) =>
      mockChartSeries(slug, query, ["starting", "due", "overdue"], (s, tally, today) => {
        tally(s.start_date, "starting");
        tally(s.target_date, "due");
        if (s.target_date && s.target_date < today && s.status !== EStoryStatus.Done) {
          tally(s.target_date, "overdue");
        }
      }),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/$/,
    resolve: ([, slug, dashboardId]) => {
      const d = dashboards.find(
        (x) =>
          x.workspace_slug === slug &&
          x.id === dashboardId &&
          x.owner_id === currentUser?.id,
      );
      return clone(d ?? notFound(`Dashboard "${dashboardId}"`));
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/$/,
    resolve: ([, slug, dashboardId], body) => {
      const d = dashboards.find(
        (x) =>
          x.workspace_slug === slug &&
          x.id === dashboardId &&
          x.owner_id === currentUser?.id,
      );
      if (!d) return notFound(`Dashboard "${dashboardId}"`);
      const b = body as Partial<IDashboard>;
      if (b.name !== undefined) d.name = b.name.trim();
      if (b.description !== undefined) d.description = b.description;
      if (b.is_favorite !== undefined) d.is_favorite = b.is_favorite;
      if (b.layout !== undefined) d.layout = b.layout;
      if (b.config !== undefined) d.config = b.config;
      d.updated_at = new Date().toISOString();
      return clone(d);
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/duplicate\/$/,
    resolve: ([, slug, dashboardId]) => {
      const src = dashboards.find(
        (x) =>
          x.workspace_slug === slug &&
          x.id === dashboardId &&
          x.owner_id === currentUser?.id,
      );
      if (!src) return notFound(`Dashboard "${dashboardId}"`);
      const now = new Date().toISOString();
      const copy: IDashboard = {
        ...structuredClone(src),
        id: `dsh_${++dshSeq}`,
        name: `${src.name} (copy)`,
        is_favorite: false,
        created_at: now,
        updated_at: now,
      };
      dashboards.push(copy);
      return clone(copy);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/dashboards\/([^/]+)\/$/,
    resolve: ([, slug, dashboardId]) => {
      const i = dashboards.findIndex(
        (x) =>
          x.workspace_slug === slug &&
          x.id === dashboardId &&
          x.owner_id === currentUser?.id,
      );
      if (i < 0) return notFound(`Dashboard "${dashboardId}"`);
      dashboards.splice(i, 1);
      return undefined;
    },
  },
  // Workspace views
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/workspace-views\/$/,
    resolve: ([, slug]) => clone(workspaceViews.filter((v) => v.workspace_slug === slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/workspace-views\/$/,
    resolve: ([, slug], body) => {
      const b = body as {
        name?: string;
        description?: string;
        layout?: EViewLayout;
        filter_query?: string;
      };
      if (!b.name?.trim()) throw new APIError(400, "name is required");
      const now = new Date().toISOString();
      const created = {
        id: `wv_${++wvSeq}`,
        workspace_slug: slug,
        name: b.name.trim(),
        description: b.description?.trim() ?? "",
        layout: b.layout ?? EViewLayout.List,
        filter_query: b.filter_query?.trim() ?? "",
        created_at: now,
        updated_at: now,
      };
      workspaceViews.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/workspace-views\/([^/]+)\/$/,
    resolve: ([, slug, viewId]) => {
      const i = workspaceViews.findIndex((v) => v.workspace_slug === slug && v.id === viewId);
      if (i < 0) return notFound(`Workspace view "${viewId}"`);
      workspaceViews.splice(i, 1);
      return undefined;
    },
  },
  // Exports
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/exports\/$/,
    resolve: ([, slug], _body, query) => {
      const rows = exportJobs.filter((e) => e.workspace_slug === slug);
      const { limit = 20, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/exports\/$/,
    resolve: ([, slug], body) => {
      const b = body as { name?: string; format?: "csv" | "json" | "xlsx" };
      if (!b.name?.trim()) throw new APIError(400, "name is required");
      const now = new Date();
      const expires = new Date(now);
      expires.setUTCDate(expires.getUTCDate() + 7);
      const created = {
        id: `exp_${++expSeq}`,
        workspace_slug: slug,
        name: b.name.trim(),
        format: b.format ?? "csv",
        // Mock keeps generation synchronous (READY immediately) — see Task 4 of
        // the GIN-20 plan; the real backend renders async (PENDING -> READY).
        status: EExportStatus.Ready,
        download_url: `#mock-export-${++expSeq}.${b.format ?? "csv"}`,
        expires_at: expires.toISOString(),
        created_at: now.toISOString(),
      };
      exportJobs.push(created);
      return clone(created);
    },
  },
  // Imports (GIN-21)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/imports\/$/,
    resolve: ([, slug], _body, query) => {
      const rows = importJobs.filter((j) => j.workspace_slug === slug);
      const { limit = 20, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/imports\/([^/]+)\/$/,
    resolve: ([, slug, id]) => {
      const job = importJobs.find((j) => j.workspace_slug === slug && j.id === id);
      if (!job) return notFound(`Import job "${id}"`);
      return clone(job);
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/imports\/$/,
    resolve: ([, slug], body) => {
      const form = body as FormData;
      const file = form?.get?.("file") as File | null;
      const format = (form?.get?.("format") as string) ?? "csv";
      if (!file) throw new APIError(400, "file is required");
      if (!["csv", "json", "xlsx"].includes(format)) {
        throw new APIError(400, `Unsupported import format "${format}"`);
      }
      if (file.size > 10 * 1024 * 1024) throw new APIError(413, "File exceeds the 10 MB limit");
      const now = new Date().toISOString();
      // ponytail: mock has no real Plane parser — fabricate a plausible summary
      // from the file size so the settings page has something to render.
      const storiesCreated = Math.max(1, Math.round(file.size / 300));
      const created: IImportJob = {
        id: `imp_${++impSeq}`,
        workspace_slug: slug,
        source_format: format as "csv" | "json" | "xlsx",
        status: EImportStatus.Completed,
        summary: {
          projects_created: 1,
          stories_created: storiesCreated,
          stories_updated: 0,
          cycles_created: 0,
          modules_created: 0,
          labels_created: 0,
          states_created: 0,
          skipped_drafts: 0,
          unmatched_members: [],
          errors: [],
        },
        created_at: now,
      };
      importJobs.push(created);
      return clone(created);
    },
  },
  // GitHub-issues importer (GIN-23b) — mock has no real GitHub client, so (like
  // the Plane CSV mock above) fabricate a plausible, deterministic count from
  // owner/repo instead of a real fetch+map.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/imports\/github\/preview\/$/,
    resolve: (_match, _body, query) => {
      const owner = query.get("owner") ?? "";
      const repo = query.get("repo") ?? "";
      if (!owner.trim() || !repo.trim()) throw new APIError(400, "owner and repo are required");
      const n = (owner.length + repo.length) % 5;
      return { issue_count: 3 + n, label_count: 1 + (n % 3), assignee_count: 1 + (n % 2) };
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/imports\/github\/$/,
    resolve: ([, slug], body) => {
      const b = body as { owner?: string; repo?: string; project_id?: string };
      if (!b.owner?.trim() || !b.repo?.trim()) throw new APIError(400, "owner and repo are required");
      if (!b.project_id) throw new APIError(400, "project_id is required");
      const n = (b.owner.length + b.repo.length) % 5;
      const now = new Date().toISOString();
      const created: IImportJob = {
        id: `imp_${++impSeq}`,
        workspace_slug: slug,
        source_format: "github",
        status: EImportStatus.Completed,
        summary: {
          issues_created: 3 + n,
          issues_skipped: 0,
          labels_created: 1 + (n % 3),
          unassigned_logins: [],
          notes: ["mock import — no real GitHub fetch performed"],
        },
        created_at: now,
      };
      importJobs.push(created);
      return clone(created);
    },
  },
  // Work-item drafts (GIN-16)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/drafts\/$/,
    resolve: ([, slug]) =>
      clone(
        draftRecords
          .filter((d) => d.workspace_slug === slug)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      ),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/drafts\/$/,
    resolve: ([, slug, projectId], body) => {
      const b = body as { title?: string; payload?: unknown };
      const now = new Date().toISOString();
      const created = {
        id: `draft_${++draftSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        title: b.title ?? "",
        payload: b.payload,
        created_at: now,
        updated_at: now,
      } as (typeof draftRecords)[number];
      draftRecords.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/drafts\/([^/]+)\/$/,
    resolve: ([, slug, draftId], body) => {
      const draft = draftRecords.find((d) => d.workspace_slug === slug && d.id === draftId);
      if (!draft) return notFound(`Draft "${draftId}"`);
      const b = body as { title?: string; payload?: unknown };
      if (b.title !== undefined) draft.title = b.title;
      if (b.payload !== undefined) draft.payload = b.payload as (typeof draft)["payload"];
      draft.updated_at = new Date().toISOString();
      return clone(draft);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/drafts\/([^/]+)\/$/,
    resolve: ([, slug, draftId]) => {
      const i = draftRecords.findIndex((d) => d.workspace_slug === slug && d.id === draftId);
      if (i < 0) return notFound(`Draft "${draftId}"`);
      draftRecords.splice(i, 1);
      return { success: true };
    },
  },
  // Workspace invitations
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/invitations\/$/,
    resolve: ([, slug]) =>
      clone(workspaceInvitations.filter((inv) => inv.workspace_slug === slug)),
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/invitations\/([^/]+)\/$/,
    resolve: ([, slug, invitationId]) => {
      const i = workspaceInvitations.findIndex(
        (inv) => inv.workspace_slug === slug && inv.id === invitationId,
      );
      if (i < 0) return notFound(`Invitation "${invitationId}"`);
      workspaceInvitations.splice(i, 1);
      return undefined;
    },
  },
  // Project pages / wiki
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/$/,
    resolve: ([, slug, projectId]) =>
      clone(pages.filter((p) => p.workspace_slug === slug && p.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/$/,
    resolve: ([, slug, projectId], body) => {
      const b = body as { title?: string; content?: string; content_format?: string };
      if (!b.title?.trim()) throw new APIError(400, "Title is required");
      const now = new Date().toISOString();
      const created = {
        id: `pg_${++pgSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        title: b.title.trim(),
        content: b.content?.trim() ?? "",
        created_at: now,
        updated_at: now,
      };
      pages.push(created);
      return clone(created);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/([^/]+)\/$/,
    resolve: ([, slug, projectId, pageId]) =>
      clone(
        pages.find(
          (p) => p.workspace_slug === slug && p.project_id === projectId && p.id === pageId,
        ) ?? notFound(`Page "${pageId}"`),
      ),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/([^/]+)\/$/,
    resolve: ([, slug, projectId, pageId], body) => {
      const page = pages.find(
        (p) => p.workspace_slug === slug && p.project_id === projectId && p.id === pageId,
      );
      if (!page) return notFound(`Page "${pageId}"`);
      const b = body as { title?: string; content?: string; content_format?: string; if_updated_at?: string };
      // GIN-24 presence v1: optimistic-concurrency guard — reject a save that was
      // loaded before someone else's, instead of silently clobbering it.
      if (b.if_updated_at !== undefined && b.if_updated_at !== page.updated_at) {
        throw new APIError(409, "This page was changed by someone else. Reload before saving.");
      }
      if (b.title !== undefined) page.title = b.title.trim();
      if (b.content !== undefined) page.content = b.content;
      page.updated_at = new Date().toISOString();
      return clone(page);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/([^/]+)\/$/,
    resolve: ([, slug, projectId, pageId]) => {
      const i = pages.findIndex(
        (p) => p.workspace_slug === slug && p.project_id === projectId && p.id === pageId,
      );
      if (i < 0) return notFound(`Page "${pageId}"`);
      pages.splice(i, 1);
      return undefined;
    },
  },
  // Page presence (GIN-24 v1): short-TTL in-memory "who's here" map — mirrors the
  // backend's in-proc heartbeat, not a websocket/CRDT stack.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/([^/]+)\/presence\/$/,
    resolve: ([, slug, projectId, pageId]) => {
      if (!findPage(slug, projectId, pageId)) return notFound(`Page "${pageId}"`);
      return presenceOut(pageId);
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/pages\/([^/]+)\/presence\/$/,
    resolve: ([, slug, projectId, pageId], body) => {
      if (!findPage(slug, projectId, pageId)) return notFound(`Page "${pageId}"`);
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const b = body as { editing?: boolean };
      const viewers = pagePresence.get(pageId) ?? new Map();
      viewers.set(currentUser.id, {
        display_name: currentUser.display_name,
        avatar_url: currentUser.avatar_url,
        editing: b.editing ?? false,
        last_seen: new Date().toISOString(),
      });
      pagePresence.set(pageId, viewers);
      return presenceOut(pageId);
    },
  },
  // BMAD planning documents
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/documents\/$/,
    resolve: ([, slug]) => clone(documents.filter((d) => d.workspace_slug === slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/documents\/$/,
    resolve: ([, slug], body) => {
      const b = body as {
        title: string;
        project_id: string;
        kind: EDocumentKind;
        content?: string;
      };
      const project = projects.find((p) => p.workspace_slug === slug && p.id === b.project_id);
      if (!project) return notFound(`Project "${b.project_id}"`);
      const now = new Date().toISOString();
      const created = {
        id: `doc_${++docSeq}`,
        workspace_slug: slug,
        project_id: b.project_id,
        project_name: project.name,
        title: b.title.trim(),
        kind: b.kind ?? EDocumentKind.Other,
        workflow: null,
        content: b.content?.trim() || `# ${b.title.trim()}\n\nDraft content — edit or comment to refine.`,
        comments: [],
        is_draft: false,
        source: EDocumentSource.User,
        story_id: null,
        workspace_path: `uploads/${b.title.trim().toLowerCase().replace(/\s+/g, "-")}.md`,
        file_name: `${b.title.trim().toLowerCase().replace(/\s+/g, "-")}.md`,
        mime_type: "text/markdown",
        created_at: now,
        updated_at: now,
      };
      documents.push(created);
      return clone(created);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/documents\/$/,
    resolve: ([, slug, projectId, storyId]) => {
      const story = allStories.find(
        (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
      );
      const workflow = story?.bmad?.workflow ?? null;
      return clone(
        documentsForStory(
          documents.filter((d) => d.workspace_slug === slug && d.project_id === projectId),
          storyId,
          workflow,
        ),
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/documents\/$/,
    resolve: ([, slug, projectId, storyId], body) => {
      const b = body as {
        title: string;
        project_id: string;
        story_id: string;
        file_name: string;
        mime_type: string;
        content?: string;
      };
      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      if (!project) return notFound(`Project "${projectId}"`);
      const now = new Date().toISOString();
      const created = {
        id: `doc_${++docSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        project_name: project.name,
        title: b.title.trim(),
        kind: EDocumentKind.Other,
        workflow: null,
        content: b.content?.trim() || `# ${b.title.trim()}\n\nUploaded reference file.`,
        comments: [],
        is_draft: false,
        source: EDocumentSource.User,
        story_id: storyId,
        workspace_path: `uploads/${b.file_name}`,
        file_name: b.file_name,
        mime_type: b.mime_type,
        created_at: now,
        updated_at: now,
      };
      documents.push(created);
      return clone(created);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/documents\/([^/]+)\/$/,
    resolve: ([, slug, docId]) => {
      const idx = documents.findIndex((d) => d.workspace_slug === slug && d.id === docId);
      if (idx < 0) return notFound(`Document "${docId}"`);
      if (documents[idx].source === EDocumentSource.Agent) {
        throw new APIError(403, "Agent documents cannot be deleted.");
      }
      documents.splice(idx, 1);
      return clone({ success: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/documents\/([^/]+)\/$/,
    resolve: ([, slug, docId]) =>
      clone(
        documents.find((d) => d.workspace_slug === slug && d.id === docId) ??
          notFound(`Document "${docId}"`),
      ),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/documents\/([^/]+)\/$/,
    resolve: ([, slug, docId], body) => {
      const doc = documents.find((d) => d.workspace_slug === slug && d.id === docId);
      if (!doc) return notFound(`Document "${docId}"`);
      if (doc.source === EDocumentSource.Agent) {
        const b = body as { title?: string; content?: string; is_draft?: boolean };
        if (b.title !== undefined || b.content !== undefined) {
          throw new APIError(403, "Agent documents cannot be edited.");
        }
      }
      const b = body as { title?: string; content?: string; is_draft?: boolean };
      if (b.title !== undefined) doc.title = b.title.trim();
      if (b.content !== undefined) doc.content = b.content;
      if (b.is_draft !== undefined) doc.is_draft = b.is_draft;
      doc.updated_at = new Date().toISOString();
      return clone(doc);
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/documents\/([^/]+)\/comments\/$/,
    resolve: ([, slug, docId], body) => {
      const doc = documents.find((d) => d.workspace_slug === slug && d.id === docId);
      if (!doc) return notFound(`Document "${docId}"`);
      const payload = body as { block_index: number; body: string; assignee?: string | null };
      const now = new Date().toISOString();
      const comment = {
        id: `cmt_${++docSeq}`,
        document_id: docId,
        block_index: payload.block_index,
        body: payload.body.trim(),
        author_name: currentUser?.display_name ?? "You",
        assignee: payload.assignee ?? null,
        resolved: false,
        created_at: now,
      };
      doc.comments.push(comment);
      doc.updated_at = now;
      return clone(comment);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/documents\/([^/]+)\/comments\/([^/]+)\/$/,
    resolve: ([, slug, docId, commentId], body) => {
      const doc = documents.find((d) => d.workspace_slug === slug && d.id === docId);
      if (!doc) return notFound(`Document "${docId}"`);
      const comment = doc.comments.find((c) => c.id === commentId);
      if (!comment) return notFound(`Comment "${commentId}"`);
      const resolved = (body as { resolved?: boolean }).resolved;
      if (resolved !== undefined) comment.resolved = resolved;
      doc.updated_at = new Date().toISOString();
      return clone(comment);
    },
  },
  // Notifications
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/notifications\/$/,
    resolve: ([, slug], _body, query) => {
      const category = query?.get("category");
      const rows = notificationsForUser(slug, currentUser?.id).filter((n) =>
        isNotificationCategory(category)
          ? notificationMatchesCategory(n, category)
          : true,
      );
      const { limit = 30, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/notifications\/unread\/$/,
    resolve: ([, slug]) => clone(unreadCountForUser(slug, currentUser?.id)),
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/notifications\/([^/]+)\/$/,
    resolve: ([, slug, id], body) => {
      const n = notifications.find(
        (x) =>
          x.workspace_slug === slug &&
          x.id === id &&
          x.receiver_user_id === currentUser?.id,
      );
      if (!n) return notFound(`Notification "${id}"`);
      const read = (body as { read?: boolean }).read;
      if (read !== undefined) n.read = read;
      return clone(toWireNotification(n));
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/notifications\/mark-all-read\/$/,
    resolve: ([, slug]) => {
      notifications
        .filter((n) => n.workspace_slug === slug && n.receiver_user_id === currentUser?.id)
        .forEach((n) => {
          n.read = true;
        });
      return { success: true };
    },
  },
  // Digest preferences (GIN-100) — one per user; absence = defaults.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/digests\/preferences\/$/,
    resolve: () => clone(digestPreference),
  },
  {
    method: "PUT",
    pattern: /^\/workspaces\/([^/]+)\/digests\/preferences\/$/,
    resolve: (_m, body) => {
      Object.assign(digestPreference, body as Partial<typeof digestPreference>);
      return clone(digestPreference);
    },
  },
  // Saved project views
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/views\/$/,
    resolve: ([, slug, projectId]) =>
      clone(views.filter((v) => v.workspace_slug === slug && v.project_id === projectId)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/views\/$/,
    resolve: ([, slug, projectId], body) => {
      const b = body as {
        name: string;
        description?: string;
        layout: string;
        filter_query?: string;
        share_scope?: string;
      };
      const now = new Date().toISOString();
      const created = {
        id: `view_${++viewSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        name: b.name,
        description: b.description ?? "",
        layout: b.layout,
        filter_query: b.filter_query ?? "",
        owner_id: currentUser?.id ?? "u_1",
        owner_name: currentUser?.display_name ?? "Ada Lovelace",
        share_scope: b.share_scope ?? "private",
        is_favorite: false,
        created_at: now,
        updated_at: now,
      };
      views.push(created as (typeof views)[number]);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/views\/([^/]+)\/$/,
    resolve: ([, slug, projectId, viewId], body) => {
      const view = views.find(
        (v) => v.workspace_slug === slug && v.project_id === projectId && v.id === viewId,
      );
      if (!view) return notFound(`View "${viewId}"`);
      if (view.owner_id !== currentUser?.id) {
        throw new APIError(403, "Only the view owner can update this view");
      }
      const b = body as {
        name?: string;
        description?: string;
        layout?: string;
        filter_query?: string;
        share_scope?: string;
      };
      if (b.name) view.name = b.name;
      if (b.description !== undefined) view.description = b.description;
      if (b.layout) view.layout = b.layout as (typeof view.layout);
      if (b.filter_query !== undefined) view.filter_query = b.filter_query;
      if (b.share_scope) view.share_scope = b.share_scope as (typeof view.share_scope);
      view.updated_at = new Date().toISOString();
      return clone(view);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/views\/([^/]+)\/$/,
    resolve: ([, slug, projectId, viewId]) => {
      const view = views.find(
        (v) => v.workspace_slug === slug && v.project_id === projectId && v.id === viewId,
      );
      if (!view) return notFound(`View "${viewId}"`);
      if (view.owner_id !== currentUser?.id) {
        throw new APIError(403, "Only the view owner can delete this view");
      }
      const i = views.findIndex(
        (v) => v.workspace_slug === slug && v.project_id === projectId && v.id === viewId,
      );
      views.splice(i, 1);
      return { success: true };
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/views\/([^/]+)\/favorite\/$/,
    resolve: ([, slug, projectId, viewId]) => {
      const view = views.find(
        (v) => v.workspace_slug === slug && v.project_id === projectId && v.id === viewId,
      );
      if (!view) return notFound(`View "${viewId}"`);
      view.is_favorite = !view.is_favorite;
      view.updated_at = new Date().toISOString();
      return clone(view);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/github\/$/,
    resolve: ([, slug]) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws) return notFound(`Workspace "${slug}"`);
      return clone({
        connected: ws.github_connected,
        repo_url: ws.github_repo_url,
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/github\/connect\/$/,
    resolve: ([, slug], body) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws) return notFound(`Workspace "${slug}"`);
      const repo = (body as { repo_name?: string }).repo_name ?? "gigsnano-docs";
      ws.github_connected = true;
      ws.github_repo_url = `https://github.com/acme-corp/${repo}`;
      ws.updated_at = new Date().toISOString();
      return clone({ connected: true, repo_url: ws.github_repo_url });
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/github\/disconnect\/$/,
    resolve: ([, slug]) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws) return notFound(`Workspace "${slug}"`);
      ws.github_connected = false;
      ws.github_repo_url = null;
      return { success: true };
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/github\/install-url\/$/,
    resolve: ([, slug]) => clone({ url: `https://github.com/login/oauth/authorize?mock=1&ws=${slug}` }),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/github\/repos\/$/,
    resolve: ([, slug]) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws || !ws.github_connected) throw new APIError(409, "Connect GitHub first");
      return clone(MOCK_GITHUB_REPOS);
    },
  },
  // Callable agent roster (GIN voice-agent-contacts)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/agents\/bundles\/$/,
    resolve: () => clone(agentBundles),
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/agents\/$/,
    resolve: ([, slug]) => clone(agents.filter((a) => a.workspace_slug === slug)),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/agents\/$/,
    resolve: ([, slug], body) => {
      const b = body as {
        name: string;
        persona?: string;
        domain?: string;
        avatar_color?: string;
        voice_id?: string;
        instructions?: string;
        bundles?: string[];
        project_id?: string | null;
      };
      const created: IAgent = {
        id: `agent_custom_${++agtSeq}`,
        workspace_slug: slug,
        project_id: b.project_id ?? null,
        name: b.name.trim(),
        persona: b.persona?.trim() ?? "",
        domain: b.domain?.trim() || "general",
        avatar_color: b.avatar_color ?? "#64748b",
        voice_id: b.voice_id ?? "",
        instructions: b.instructions?.trim() ?? "",
        bundles: b.bundles ?? [],
        is_builtin: false,
        enabled: true,
      };
      agents.push(created);
      return clone(created);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/agents\/([^/]+)\/$/,
    resolve: ([, slug, agentId], body) => {
      const agent = agents.find((a) => a.workspace_slug === slug && a.id === agentId);
      if (!agent) return notFound(`Agent "${agentId}"`);
      Object.assign(agent, body as Partial<IAgent>);
      return clone(agent);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/agents\/([^/]+)\/$/,
    resolve: ([, slug, agentId]) => {
      const idx = agents.findIndex((a) => a.workspace_slug === slug && a.id === agentId);
      if (idx === -1) return notFound(`Agent "${agentId}"`);
      agents.splice(idx, 1);
      return { success: true };
    },
  },
  // Cycle stories (product sprints)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/cycles\/([^/]+)\/stories\/$/,
    resolve: ([, slug, projectId, cycleId]) =>
      clone(
        allStories
          .filter(
            (s) =>
              s.workspace_slug === slug &&
              s.project_id === projectId &&
              s.cycle_id === cycleId,
          )
          .sort((a, b) => a.order - b.order),
      ),
  },
  // Module stories
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/modules\/([^/]+)\/stories\/$/,
    resolve: ([, slug, projectId, moduleId]) =>
      clone(
        allStories
          .filter(
            (s) =>
              s.workspace_slug === slug &&
              s.project_id === projectId &&
              s.module_id === moduleId,
          )
          .sort((a, b) => a.order - b.order),
      ),
  },

  // Sprint-0 board: the BMAD planning stories for a project.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/sprint-zero\/stories\/$/,
    resolve: ([, slug, projectId]) => {
      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      const ps = stories.filter((s) => s.workspace_slug === slug && s.project_id === projectId);
      if (project) applyStoryLocks(ps, { has_ui: project.has_ui });
      return clone(ps.sort((a, b) => a.order - b.order));
    },
  },
  // All stories for a project (saved views, tables)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/$/,
    resolve: ([, slug, projectId], _body, query) => {
      let rows = allStories
        .filter((s) => s.workspace_slug === slug && s.project_id === projectId)
        .sort((a, b) => a.order - b.order);
      const q = query.get("q")?.trim().toLowerCase();
      if (q) rows = rows.filter((s) => s.title.toLowerCase().includes(q));
      if (query.get("product_only") === "true") rows = rows.filter((s) => s.bmad === null);
      if (query.get("unassigned") === "true" || query.get("unassigned_only") === "true") {
        rows = rows.filter((s) => !s.assignee_id);
      }
      const status = query.get("status");
      if (status) rows = rows.filter((s) => s.status === status);
      const statusIn = query.get("status_in")?.split(",").filter(Boolean);
      if (statusIn?.length) rows = rows.filter((s) => statusIn.includes(s.status));
      const priorityIn = query.get("priority_in")?.split(",").filter(Boolean);
      if (priorityIn?.length) rows = rows.filter((s) => priorityIn.includes(s.priority));
      const typeIn = query.get("type_in")?.split(",").filter(Boolean);
      if (typeIn?.length) rows = rows.filter((s) => typeIn.includes(s.type ?? "story"));
      const cycleId = query.get("cycle_id");
      if (cycleId) rows = rows.filter((s) => s.cycle_id === cycleId);
      const moduleId = query.get("module_id");
      if (moduleId) rows = rows.filter((s) => s.module_id === moduleId);
      const assigneeId = query.get("assignee_id");
      if (assigneeId) rows = rows.filter((s) => s.assignee_id === assigneeId);
      const labelId = query.get("label_id");
      if (labelId) rows = rows.filter((s) => s.label_id === labelId);
      const from = query.get("target_date_from");
      const to = query.get("target_date_to");
      if (from) rows = rows.filter((s) => s.target_date && s.target_date >= from);
      if (to) rows = rows.filter((s) => s.target_date && s.target_date <= to);
      if (query.get("scheduled_only") === "true") {
        rows = rows.filter((s) => s.start_date && s.target_date);
      }
      const orderBy = query.get("order_by");
      if (orderBy === "created") {
        rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
      } else if (orderBy === "updated") {
        rows = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      }
      const { limit = 50, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/$/,
    resolve: ([, slug, projectId], body) => {
      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      if (!project) return notFound(`Project "${projectId}"`);
      const b = body as {
        title: string;
        description?: string;
        cycle_id?: string | null;
        module_id?: string | null;
        status?: EStoryStatus;
        parent_id?: string | null;
        priority?: EStoryPriority;
      };
      if (!b.title?.trim()) throw new APIError(400, "title is required");
      if (b.cycle_id) {
        const cycle = cycles.find(
          (c) => c.workspace_slug === slug && c.project_id === projectId && c.id === b.cycle_id,
        );
        if (!cycle) return notFound(`Cycle "${b.cycle_id}"`);
      }
      if (b.module_id) {
        const mod = modules.find(
          (m) => m.workspace_slug === slug && m.project_id === projectId && m.id === b.module_id,
        );
        if (!mod) return notFound(`Module "${b.module_id}"`);
      }
      const now = new Date().toISOString();
      const cycleId = b.cycle_id ?? null;
      const moduleId = b.module_id ?? null;
      const created: IStory = {
        id: `st_${++stSeq}`,
        workspace_slug: slug,
        project_id: projectId,
        cycle_id: cycleId,
        module_id: moduleId,
        title: b.title.trim(),
        description: b.description?.trim() ?? "",
        status: b.status ?? EStoryStatus.Todo,
        priority: b.priority ?? EStoryPriority.None,
        start_date: null,
        target_date: null,
        order: nextStoryOrder(projectId, cycleId, moduleId),
        assignee_id: null,
        ai_agent_id: null,
        label_id: null, label_ids: [],
        estimate_id: null,
        estimate_points: null,
        parent_id: b.parent_id ?? null,
        sub_issue_count: 0,
        bmad: null,
        created_at: now,
        updated_at: now,
      };
      allStories.push(created);
      if (cycleId) syncCycleStoryCounts(cycleId);
      if (moduleId) syncModuleStoryCounts(moduleId);
      syncSubIssueCount(created.parent_id);
      return clone(created);
    },
  },
  // Stories assigned to the signed-in user
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/stories\/$/,
    resolve: ([, slug], _body, query) => {
      let rows = allStories
        .filter((s) => s.workspace_slug === slug)
        .sort((a, b) => a.order - b.order);
      const q = query.get("q")?.trim().toLowerCase();
      if (q) rows = rows.filter((s) => s.title.toLowerCase().includes(q));
      if (query.get("product_only") === "true") rows = rows.filter((s) => s.bmad === null);
      const status = query.get("status");
      if (status) rows = rows.filter((s) => s.status === status);
      const { limit = 30, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/my-stories\/$/,
    resolve: ([, slug], _body, query) => {
      if (!currentUser) throw new APIError(401, "Not authenticated");
      const userId = currentUser.id;
      const openOnly = query.get("open_only") !== "false";
      let rows = allStories.filter(
        (s) => s.workspace_slug === slug && s.assignee_id === userId,
      );
      if (openOnly) {
        rows = rows.filter(
          (s) => s.status !== EStoryStatus.Done && !(s.bmad?.skipped === true),
        );
      }
      rows = rows
        .map((s) => {
          const p = projects.find((pr) => pr.id === s.project_id);
          return {
            ...s,
            project_name: p?.name ?? "",
            project_identifier: p?.identifier ?? "",
          };
        })
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const { limit = 30, offset = 0 } = readOffsetPageParams(query);
      return clone(paginateArray(rows, limit, offset));
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/$/,
    resolve: ([, slug, projectId, storyId]) => {
      const story =
        allStories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        ) ??
        stories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        );
      if (!story) return notFound(`Story "${storyId}"`);
      return clone(story);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/sub-stories\/$/,
    resolve: ([, slug, projectId, storyId]) =>
      clone(
        allStories
          .filter((s) => s.workspace_slug === slug && s.project_id === projectId && s.parent_id === storyId)
          .sort((a, b) => a.order - b.order),
      ),
  },
  {
    method: "DELETE",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/$/,
    resolve: ([, slug, projectId, storyId]) => {
      const i = allStories.findIndex(
        (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
      );
      if (i === -1) return notFound(`Story "${storyId}"`);
      const removed = allStories[i];
      // Re-parent orphans to the removed story's parent.
      allStories.filter((s) => s.parent_id === storyId).forEach((c) => { c.parent_id = removed.parent_id; });
      allStories.splice(i, 1);
      syncSubIssueCount(removed.parent_id);
      if (removed.cycle_id) syncCycleStoryCounts(removed.cycle_id);
      if (removed.module_id) syncModuleStoryCounts(removed.module_id);
      return { success: true };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/$/,
    resolve: ([, slug, projectId, storyId], body) => {
      const story =
        allStories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        ) ??
        stories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        );
      if (!story) return notFound(`Story "${storyId}"`);

      const project = projects.find((p) => p.workspace_slug === slug && p.id === projectId);
      if (!project) return notFound(`Project "${projectId}"`);

      const actor = {
        id: currentUser?.id ?? "user_unknown",
        name: currentUser?.display_name ?? "Someone",
      };
      const logChange = (
        field: EStoryActivityField,
        summary: string,
        oldValue: string | null,
        newValue: string | null,
      ) => {
        if (oldValue === newValue) return;
        logStoryPropertyChange(storyId, actor, field, summary, oldValue, newValue);
      };

      const payload = body as {
        status?: EStoryStatus;
        priority?: EStoryPriority;
        start_date?: string | null;
        target_date?: string | null;
        skipped?: boolean;
        readiness_result?: EReadinessResult;
        assignee_id?: string | null;
        ai_agent_id?: string | null;
        label_id?: string | null;
        estimate_id?: string | null;
        estimate_points?: number | null;
        parent_id?: string | null;
        title?: string;
        description?: string;
        cycle_id?: string | null;
        module_id?: string | null;
      };

      if (payload.priority !== undefined && payload.priority !== story.priority) {
        logChange(
          EStoryActivityField.Priority,
          "changed priority",
          story.priority,
          payload.priority,
        );
        story.priority = payload.priority;
      }
      if (payload.start_date !== undefined && payload.start_date !== story.start_date) {
        logChange(
          EStoryActivityField.StartDate,
          "changed start date",
          story.start_date ?? null,
          payload.start_date ?? null,
        );
        story.start_date = payload.start_date;
      }
      if (payload.target_date !== undefined && payload.target_date !== story.target_date) {
        logChange(
          EStoryActivityField.TargetDate,
          "changed due date",
          story.target_date ?? null,
          payload.target_date ?? null,
        );
        story.target_date = payload.target_date;
      }
      if (payload.title !== undefined && payload.title.trim() && payload.title.trim() !== story.title) {
        logChange(
          EStoryActivityField.Title,
          "changed title",
          story.title,
          payload.title.trim(),
        );
        story.title = payload.title.trim();
      }
      if (payload.description !== undefined && payload.description !== story.description) {
        logChange(
          EStoryActivityField.Description,
          "updated the description",
          story.description,
          payload.description,
        );
        story.description = payload.description;
      }
      if (payload.parent_id !== undefined) {
        const prev = story.parent_id;
        story.parent_id = payload.parent_id;
        if (prev !== payload.parent_id) {
          logChange(
            EStoryActivityField.Parent,
            "changed parent",
            prev ?? null,
            payload.parent_id ?? null,
          );
          syncSubIssueCount(prev);
          syncSubIssueCount(payload.parent_id);
        }
      }

      if (payload.skipped === true) {
        if (!story.bmad || story.bmad.is_required) {
          throw new APIError(400, "Required steps cannot be skipped");
        }
        story.bmad.skipped = true;
        afterStoryMutation(slug, projectId);
        story.updated_at = new Date().toISOString();
        return clone(story);
      }

      if (
        payload.readiness_result &&
        story.bmad?.workflow === "bmad-check-implementation-readiness"
      ) {
        story.bmad.readiness_result = payload.readiness_result;
      }

      if (payload.label_id !== undefined) {
        const prevLabel = story.label_id;
        if (payload.label_id === null) {
          story.label_id = null;
        } else {
          const label = projectLabels.find(
            (l) => l.project_id === projectId && l.id === payload.label_id,
          );
          if (!label) {
            throw new APIError(400, "Label must belong to this project");
          }
          story.label_id = payload.label_id;
        }
        if (prevLabel !== story.label_id) {
          logChange(
            EStoryActivityField.Label,
            "changed label",
            prevLabel ?? null,
            story.label_id ?? null,
          );
        }
      }

      if (payload.estimate_id !== undefined || payload.estimate_points !== undefined) {
        if (payload.estimate_id === null || payload.estimate_points === null) {
          story.estimate_id = null;
          story.estimate_points = null;
        } else {
          const estimate = projectEstimates.find(
            (e) => e.project_id === projectId && e.id === payload.estimate_id,
          );
          if (!estimate) {
            throw new APIError(400, "Estimate scale must belong to this project");
          }
          if (payload.estimate_points == null || payload.estimate_points <= 0) {
            throw new APIError(400, "Estimate points must be a positive number");
          }
          story.estimate_id = payload.estimate_id ?? null;
          story.estimate_points = payload.estimate_points ?? null;
        }
      }

      if (payload.assignee_id !== undefined) {
        const prevAssignee = story.assignee_id;
        if (payload.assignee_id === null) {
          story.assignee_id = null;
        } else {
          const isMember = projectMembers.some(
            (m) =>
              m.project_id === projectId &&
              m.user_id === payload.assignee_id &&
              m.status === EMemberStatus.Active,
          );
          if (!isMember) {
            throw new APIError(400, "Assignee must be an active project member");
          }
          story.assignee_id = payload.assignee_id;
          if (payload.assignee_id !== prevAssignee && payload.assignee_id !== currentUser?.id) {
            const now = new Date().toISOString();
            pushNotification({
              id: `notif_${++notifSeq}`,
              workspace_slug: slug,
              receiver_user_id: payload.assignee_id,
              kind: ENotificationKind.Assignment,
              title: story.title,
              body: `${currentUser?.display_name ?? "Someone"} assigned you in ${project.name}`,
              href: storyNotificationHref(slug, projectId, story),
              read: false,
              created_at: now,
              actor: currentUser
                ? {
                    id: currentUser.id,
                    display_name: currentUser.display_name,
                    avatar_url: currentUser.avatar_url ?? null,
                  }
                : null,
              project: { id: projectId, name: project.name },
            });
          }
        }
        if (prevAssignee !== story.assignee_id) {
          logChange(
            EStoryActivityField.Assignee,
            "changed assignee",
            prevAssignee ?? null,
            story.assignee_id ?? null,
          );
        }
      }

      if (payload.ai_agent_id !== undefined) {
        if (payload.ai_agent_id === null) {
          story.ai_agent_id = null;
        } else {
          const known = BMAD_AGENTS.some((a) => a.id === payload.ai_agent_id);
          if (!known) {
            throw new APIError(400, "Unknown AI agent");
          }
          story.ai_agent_id = payload.ai_agent_id;
        }
      }

      if (payload.status && payload.status !== story.status) {
        const isGate = story.bmad?.workflow === "bmad-check-implementation-readiness";
        if (
          payload.status === EStoryStatus.Done &&
          isGate &&
          !story.bmad?.readiness_result
        ) {
          throw new APIError(400, "Select a readiness result (PASS, CONCERNS, or FAIL) first");
        }
        logChange(
          EStoryActivityField.Status,
          "changed status",
          story.status,
          payload.status,
        );
        story.status = payload.status;
      }

      if (payload.cycle_id !== undefined) {
        const prev = story.cycle_id;
        story.cycle_id = payload.cycle_id;
        if (prev !== payload.cycle_id) {
          const prevName = cycles.find((c) => c.id === prev)?.name ?? "None";
          const nextName = cycles.find((c) => c.id === payload.cycle_id)?.name ?? "None";
          logChange(EStoryActivityField.Cycle, "changed cycle", prevName, nextName);
          if (prev) syncCycleStoryCounts(prev);
          if (payload.cycle_id) syncCycleStoryCounts(payload.cycle_id);
        }
      }

      if (payload.module_id !== undefined) {
        const prev = story.module_id;
        story.module_id = payload.module_id;
        if (prev !== payload.module_id) {
          const prevName = modules.find((m) => m.id === prev)?.name ?? "None";
          const nextName = modules.find((m) => m.id === payload.module_id)?.name ?? "None";
          logChange(EStoryActivityField.Module, "changed module", prevName, nextName);
          if (prev) syncModuleStoryCounts(prev);
          if (payload.module_id) syncModuleStoryCounts(payload.module_id);
        }
      }

      if (story.status === EStoryStatus.Done && story.bmad && !story.bmad.skipped) {
        const hasDoc = documents.some(
          (d) => d.project_id === projectId && d.workflow === story.bmad!.workflow,
        );
        if (!hasDoc) {
          const tpl = artifactDocumentFromStory(
            slug,
            projectId,
            project.name,
            story.bmad.workflow,
            story.title,
            story.bmad.artifact,
          );
          if (tpl) {
            const now = new Date().toISOString();
            documents.push({
              id: `doc_${++docSeq}`,
              ...tpl,
              story_id: story.id,
              comments: [],
              is_draft: false,
              created_at: now,
              updated_at: now,
            });
          }
        }
        if (story.bmad.workflow === "bmad-sprint-planning") {
          seedSprintOne(slug, projectId);
        }
      }

      afterStoryMutation(slug, projectId);
      story.updated_at = new Date().toISOString();
      return clone(story);
    },
  },
  // Agent-authored description: distills the chat transcript into story.description.
  // Threads are a live backend domain (not represented in the mock store), so this
  // distills from an empty transcript — still produces a valid placeholder description
  // so the finalize-description UI path is exercisable end-to-end in pure-mock dev.
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/thread\/finalize-description\/$/,
    resolve: ([, slug, projectId, storyId]) => {
      const story =
        allStories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        ) ??
        stories.find(
          (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
        );
      if (!story) return notFound(`Story "${storyId}"`);
      const agentName =
        story.bmad?.agent ??
        BMAD_AGENTS.find((a) => a.id === story.ai_agent_id)?.name ??
        "your agent";
      const { html } = distillDescription([], agentName);
      story.description = html;
      story.updated_at = new Date().toISOString();
      return { story: clone(story) };
    },
  },

  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/$/,
    resolve: ([, slug], body) => {
      const payload = body as ICreateProjectPayload;
      const now = "2026-07-01T00:00:00Z";
      const projectId = `prj_${payload.identifier.toLowerCase()}_${++prjSeq}`;
      const startDate = payload.start_date ?? now.slice(0, 10);
      const targetDate =
        payload.target_date ??
        new Date(Date.parse(startDate) + 14 * 86_400_000).toISOString().slice(0, 10);
      const created: IProject = {
        id: projectId,
        workspace_slug: slug,
        name: payload.name,
        identifier: payload.identifier,
        cover_image_url: payload.cover_image_url,
        logo_emoji: payload.logo_emoji ?? null,
        logo_color: payload.logo_color ?? null,
        logo_image_url: payload.logo_image_url ?? null,
        start_date: startDate,
        target_date: targetDate,
        description: payload.description ?? "",
        overview: defaultOverviewHtml(payload.name),
        lead_id: null,
        member_count: 1,
        members: [{ id: "u_1", display_name: "Ada Lovelace", avatar_url: null }],
        flow: payload.flow,
        has_ui: payload.has_ui ?? true,
        planning_method: "automatic",
        planning_method_updated_at: null,
        sprint_zero_status: ESprintZeroStatus.InProgress,
        sprint_zero_progress: 0,
        // Brownfield ("existing") flow with a chosen repo simulates an instant clone;
        // otherwise there's no linked repo yet.
        repo_full_name:
          payload.flow === EProjectFlow.Existing && payload.repo_full_name
            ? payload.repo_full_name
            : null,
        // The real backend records this when it clones; nothing to record yet here.
        repo_default_branch: null,
        clone_status:
          payload.flow === EProjectFlow.Existing && payload.repo_full_name
            ? ECloneStatus.Ready
            : ECloneStatus.None,
        clone_error: null,
        index_status: EIndexStatus.None,
        index_error: null,
        indexed_commit_sha: null,
        indexed_at: null,
        created_at: now,
        updated_at: now,
      };
      projects.push(created);

      // Blank project: the container only — no Sprint-0 cycle or stories.
      if (!payload.blank) {
        const cycleId = `cyc_${projectId}_s0`;
        const seeded = seedSprintZeroStories(
          payload.flow,
          slug,
          projectId,
          cycleId,
          0,
          payload.has_ui ?? true,
        );
        cycles.push({
          id: cycleId,
          workspace_slug: slug,
          project_id: projectId,
          name: "Sprint-0 · Planning",
          description: "BMAD planning: brief → PRD → architecture → epics.",
          status: ECycleStatus.Active,
          is_sprint_zero: true,
          start_date: now.slice(0, 10),
          end_date: null,
          story_count: seeded.length,
          completed_story_count: 0,
          created_at: now,
          updated_at: now,
        });
        stories.push(...seeded);
        allStories.push(...seeded);
      }

      const defaultFeatures = [
        { key: "cycles", name: "Cycles", description: "Time-boxed sprints for delivery after Sprint-0." },
        { key: "modules", name: "Modules", description: "Group stories into feature areas across sprints." },
        { key: "views", name: "Views", description: "Saved board, list, and table filters." },
        { key: "pages", name: "Pages", description: "Wiki-style project documentation (coming soon)." },
      ];
      for (const f of defaultFeatures) {
        projectFeatures.push({
          id: `feat_${projectId}_${f.key}`,
          project_id: projectId,
          ...f,
          enabled: f.key !== "pages",
        });
      }
      const defaultStates = [
        { name: "Backlog", color: "#94a3b8", group: EStateGroup.Backlog },
        { name: "Todo", color: "#64748b", group: EStateGroup.Unstarted },
        { name: "In progress", color: "#3b82f6", group: EStateGroup.Started },
        { name: "In review", color: "#8b5cf6", group: EStateGroup.Started },
        { name: "Done", color: "#22c55e", group: EStateGroup.Completed },
      ];
      defaultStates.forEach((s, order) => {
        projectStates.push({
          id: `pst_${projectId}_${order}`,
          project_id: projectId,
          name: s.name,
          color: s.color,
          group: s.group,
          order,
        });
      });

      return clone(created);
    },
  },

  // GitHub (brownfield: repo picker, app-install deep link, clone retry)
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/github\/repos\/$/,
    resolve: () => [
      { full_name: "acme/docs", url: "https://github.com/acme/docs", default_branch: "main" },
      { full_name: "acme/mobile-app", url: "https://github.com/acme/mobile-app", default_branch: "main" },
    ],
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/github\/install-url\/$/,
    resolve: () => ({
      url: "https://github.com/login/oauth/authorize?client_id=mock&state=mock",
    }),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/github\/oauth\/callback\/$/,
    resolve: ([, slug]) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (ws) ws.github_connected = true;
      return { connected: true, repo_url: ws?.github_repo_url ?? null };
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/workspace\/tree\/$/,
    resolve: ([, slug, projectId]) => {
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      return clone(
        mockWorkspaceTreeForProject(
          p.repo_full_name,
          p.clone_status === ECloneStatus.Ready,
        ),
      );
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/workspace\/file\/$/,
    resolve: ([, slug, projectId], _body, query) => {
      const filePath = query.get("path");
      if (!filePath) throw new APIError(400, "path query param required");
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      if (p.clone_status !== ECloneStatus.Ready) {
        throw new APIError(404, "Workspace not ready");
      }
      const content = mockWorkspaceFileContent(filePath);
      if (content == null) throw new APIError(404, `File "${filePath}" not found`);
      return { path: filePath, content };
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/clone\/retry\/$/,
    resolve: ([, , projectId]) => {
      const p = projects.find((x) => x.id === projectId);
      if (p) p.clone_status = ECloneStatus.Ready;
      return { id: projectId, clone_status: ECloneStatus.Ready };
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/link-repo\/$/,
    resolve: ([, slug, projectId], body) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws || !ws.github_connected) throw new APIError(409, "Connect GitHub first");
      const repoName = (body as { repo_full_name?: string }).repo_full_name;
      const repo = MOCK_GITHUB_REPOS.find((r) => r.full_name === repoName);
      if (!repo) throw new APIError(404, "Repository not found in the connected account");
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      p.repo_full_name = repo.full_name;
      // Simulate an instant clone so the repository view shows files (mirrors the
      // keyless-dev clone; the real backend flips PENDING → READY asynchronously).
      p.clone_status = ECloneStatus.Ready;
      p.updated_at = new Date().toISOString();
      return clone(p);
    },
  },

  // Codebase graph (repo-aware Plan 3) — mock-first so the Sigma view and the
  // staleness banner both work with no backend.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/code\/graph\/$/,
    resolve: ([, slug, projectId]) => {
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      if (p.index_status !== EIndexStatus.Ready) {
        throw new APIError(409, "Code index is not ready.");
      }
      return clone(mockCodeGraph);
    },
  },
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/code\/metrics\/$/,
    resolve: ([, slug, projectId]) => {
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      if (p.index_status !== EIndexStatus.Ready) {
        throw new APIError(409, "Code index is not ready.");
      }
      return clone(mockCodeMetrics);
    },
  },
  // Full static-analysis findings — the Codebase → Issues tab. `scanned: true`
  // because this fixture represents a scan that ran; the "not scanned" state is
  // reachable in the real backend (no semgrep on native Windows), not faked here.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/code\/issues\/$/,
    resolve: ([, slug, projectId]) => {
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      if (p.index_status !== EIndexStatus.Ready) {
        throw new APIError(409, "Code index is not ready.");
      }
      return clone(mockCodeIssues);
    },
  },
  // ER schema (repo-aware) — a small canned data model so the Codebase → Schema
  // tab renders an ER diagram with no backend.
  {
    method: "GET",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/code\/er\/$/,
    resolve: ([, slug, projectId]) => {
      const p =
        projects.find((x) => x.workspace_slug === slug && x.id === projectId) ??
        notFound(`Project "${projectId}"`);
      if (p.index_status !== EIndexStatus.Ready) {
        throw new APIError(409, "Code index is not ready.");
      }
      return {
        id: `er-${p.id}`,
        based_on_sha: p.indexed_commit_sha,
        tables: [
          { name: "projects", columns: [
            { name: "id", type: "uuid", pk: true },
            { name: "workspace_id", type: "uuid", fk: true },
            { name: "name", type: "text" },
          ] },
          { name: "stories", columns: [
            { name: "id", type: "uuid", pk: true },
            { name: "project_id", type: "uuid", fk: true },
            { name: "title", type: "text" },
            { name: "status", type: "text" },
          ] },
          { name: "workspaces", columns: [
            { name: "id", type: "uuid", pk: true },
            { name: "slug", type: "text" },
          ] },
        ],
        relations: [
          { from_table: "stories", from_column: "project_id", to_table: "projects", to_column: "id", cardinality: "many-to-one" },
          { from_table: "projects", from_column: "workspace_id", to_table: "workspaces", to_column: "id", cardinality: "many-to-one" },
        ],
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/code\/parse-dbml\/$/,
    // Mock can't run pydbml; return an empty schema (chat dbml-only blocks just
    // won't render under mocks — they render against the real backend).
    resolve: () => ({ tables: [], relations: [] }),
  },
  {
    method: "POST",
    pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/index\/$/,
    resolve: ([, , projectId]) => {
      const p = projects.find((x) => x.id === projectId) ?? notFound(`Project "${projectId}"`);
      // Mock simulates an instant index (the real backend flips
      // PENDING → INDEXING → READY asynchronously via a background task).
      p.index_status = EIndexStatus.Ready;
      p.index_error = null;
      p.indexed_commit_sha = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
      p.indexed_at = new Date().toISOString();
      p.updated_at = p.indexed_at;
      return { id: p.id, index_status: p.index_status };
    },
  },

  ...makeStoryDetailHandlers(() => currentUser),
  ...makeAgentDelegationHandlers(() => currentUser),
  ...makeMarketplaceFlowHandlers(() => currentUser),
  ...makeSlackHandlers(),
  ...makeSearchHandlers(),
  ...makeWorkItemIoHandlers(),
  ...makeIntakeHandlers(),
  ...makeEntitlementsHandlers(),
  ...makeTeamspaceHandlers(),
  ...makeRoadmapHandlers(),
  ...makeExecutionProfileHandlers(),
  ...makeCodebaseHandlers(),
  ...makeWorkflowHandlers(),
  ...makeAutomationHandlers(),
  ...makeTemplateHandlers(),
  ...makeMeetingHandlers(),
  ...makeSolutionHandlers(() => currentUser?.id ?? null),
  ...makeSolutionRuntimeHandlers(() => currentUser?.id ?? null),
];

export async function resolveMock<T>(method: string, path: string, body?: unknown): Promise<T> {
  await delay();
  const [pathname, queryString] = path.split("?");
  const query = new URLSearchParams(queryString ?? "");

  for (const handler of handlers) {
    if (handler.method !== method) continue;
    const match = pathname.match(handler.pattern);
    if (match) return handler.resolve(match, body, query) as T;
  }

  throw new APIError(404, `No mock handler for ${method} ${pathname}`);
}
