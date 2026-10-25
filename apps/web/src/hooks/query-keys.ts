import type { IStoryFilters } from "@/types";

/** Central query-key factory so cache keys stay consistent across hooks. */
type ILlmUsageKeyFilters = {
  from?: string;
  to?: string;
  selected_date?: string;
  workspace_id?: string;
  user_id?: string;
  source?: string;
  operation?: string;
  model?: string;
  metric?: string;
  limit?: number;
  offset?: number;
};

export const queryKeys = {
  workspaces: ["workspaces"] as const,
  workspace: (slug: string) => ["workspaces", slug] as const,
  members: (slug: string) => ["workspaces", slug, "members"] as const,
  projects: (slug: string) => ["workspaces", slug, "projects"] as const,
  solutions: (slug: string) => ["workspaces", slug, "solutions"] as const,
  setupDrafts: (slug: string) => ["workspaces", slug, "setup-drafts"] as const,
  analysisJob: (slug: string, jobId: string) =>
    ["workspaces", slug, "analysis-jobs", jobId] as const,
  connections: (slug: string) => ["workspaces", slug, "connections"] as const,
  connection: (slug: string, connectionId: string) =>
    ["workspaces", slug, "connections", connectionId] as const,
  workspaceSearch: (
    slug: string,
    params: { q: string; scope?: string; projectId?: string },
  ) => ["workspaces", slug, "search", params.q, params.scope ?? null, params.projectId ?? null] as const,
  project: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId] as const,
  journey: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "journey"] as const,
  deliveryPlan: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "journey", "delivery"] as const,
  experienceContract: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "journey", "experience"] as const,
  topologyContract: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "journey", "topology"] as const,
  discovery: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "journey", "discovery"] as const,
  projectTransfer: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "transfer"] as const,
  transferRequest: (token: string) => ["transfer-requests", token] as const,
  projectLabels: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "labels"] as const,
  projectStates: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "states"] as const,
  projectFeatures: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "features"] as const,
  projectEstimates: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "estimates"] as const,
  projectAutomations: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "automations"] as const,
  customFields: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "custom-fields"] as const,
  workspaceTree: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "workspace", "tree"] as const,
  codeOverview: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "code", "overview"] as const,
  codeGraph: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "code", "graph"] as const,
  codeMetrics: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "code", "metrics"] as const,
  codeIssues: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "code", "issues"] as const,
  codeEr: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "code", "er"] as const,
  parseDbml: (slug: string, projectId: string, id: string) =>
    ["workspaces", slug, "projects", projectId, "code", "parse-dbml", id] as const,
  workspaceFile: (slug: string, projectId: string, path: string) =>
    ["workspaces", slug, "projects", projectId, "workspace", "file", path] as const,
  syncJob: (slug: string, projectId: string, jobId: string) =>
    ["workspaces", slug, "projects", projectId, "sync", jobId] as const,
  foundation: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "foundation"] as const,
  repositories: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "repositories"] as const,
  systemBundles: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "system-bundles"] as const,
  systemBundle: (slug: string, projectId: string, bundleId: string) =>
    ["workspaces", slug, "projects", projectId, "system-bundles", bundleId] as const,
  codeScope: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "code-scope"] as const,
  delivery: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "delivery"] as const,
  cycles: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "cycles"] as const,
  cycle: (slug: string, projectId: string, cycleId: string) =>
    ["workspaces", slug, "projects", projectId, "cycles", cycleId] as const,
  cycleProgress: (slug: string, projectId: string, cycleId: string) =>
    ["workspaces", slug, "projects", projectId, "cycles", cycleId, "progress"] as const,
  modules: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "modules"] as const,
  view: (slug: string, projectId: string, viewId: string) =>
    ["workspaces", slug, "projects", projectId, "views", viewId] as const,
  module: (slug: string, projectId: string, moduleId: string) =>
    ["workspaces", slug, "projects", projectId, "modules", moduleId] as const,
  sprintZeroStories: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "sprint-zero", "stories"] as const,
  projectStories: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", "all"] as const,
  projectStoriesPage: (slug: string, projectId: string, filters: IStoryFilters = {}) =>
    ["workspaces", slug, "projects", projectId, "stories", "page", JSON.stringify(filters)] as const,
  story: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId] as const,
  subStories: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "sub-stories"] as const,
  thread: (slug: string, projectId: string, storyId: string, workflow?: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "thread", workflow ?? null] as const,
  myStories: (slug: string, filters: { open_only?: boolean; limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "my-stories", filters.open_only ?? null, filters.limit ?? null, filters.offset ?? null] as const,
  trash: (slug: string, filters: { q?: string; limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "trash", filters.q ?? null, filters.limit ?? null, filters.offset ?? null] as const,
  users: (filters: { q?: string; limit?: number; offset?: number } = {}) =>
    ["users", filters.q ?? null, filters.limit ?? null, filters.offset ?? null] as const,
  user: (userId: string) => ["users", userId] as const,
  projectMembers: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "members"] as const,
  documentPackage: (slug: string, projectId: string, packageId: string) =>
    ["workspaces", slug, "projects", projectId, "packages", packageId] as const,
  packageFindings: (slug: string, projectId: string, packageId: string) =>
    ["workspaces", slug, "projects", projectId, "packages", packageId, "findings"] as const,
  importPlan: (slug: string, projectId: string, packageId: string) =>
    ["workspaces", slug, "projects", projectId, "packages", packageId, "plan"] as const,
  documents: (slug: string) => ["workspaces", slug, "documents"] as const,
  document: (slug: string, docId: string) => ["workspaces", slug, "documents", docId] as const,
  storyDocuments: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "documents"] as const,
  storyLinks: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "links"] as const,
  storyRelations: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "relations"] as const,
  /** Every relation edge in the project — the graph layout's edges (GIN-159). */
  projectRelations: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "story-relations"] as const,
  storyComments: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "comments"] as const,
  storyHistory: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "history"] as const,
  storyTimeEntries: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "time-entries"] as const,
  storySubscribe: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "subscribe"] as const,
  executionProfile: (slug: string, projectId: string, storyId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "execution-profile"] as const,
  skillEvents: (slug: string, projectId: string, storyId: string, runId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "runs", runId, "skill-events"] as const,
  notifications: (slug: string, filters: { limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "notifications", filters.limit ?? null, filters.offset ?? null] as const,
  notificationUnread: (slug: string) => ["workspaces", slug, "notifications", "unread"] as const,
  digestPreferences: (slug: string) => ["workspaces", slug, "digests", "preferences"] as const,
  gigsAiThreads: (slug: string, filters: { limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "gigs-ai", "threads", filters.limit ?? null, filters.offset ?? null] as const,
  gigsAiThread: (slug: string, threadId: string) =>
    ["workspaces", slug, "gigs-ai", "threads", threadId] as const,
  rooms: (slug: string, filters: { limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "rooms", filters.limit ?? null, filters.offset ?? null] as const,
  room: (slug: string, roomId: string) =>
    ["workspaces", slug, "rooms", roomId] as const,
  roomExperts: (slug: string) => ["workspaces", slug, "rooms", "experts"] as const,
  views: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "views"] as const,
  analytics: (slug: string) => ["workspaces", slug, "analytics"] as const,
  projectActivity: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "activity"] as const,
  forecast: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "forecast"] as const,
  deliveryMetrics: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "delivery-metrics"] as const,
  projectHealth: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "health"] as const,
  pmHealthLatest: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "pm-health", "latest"] as const,
  pmHealthHistory: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "pm-health", "history"] as const,
  agents: (slug: string) => ["workspaces", slug, "agents"] as const,
  agentConnections: ["agent-connections"] as const,
  tokens: () => ["tokens"] as const,
  oauthGrants: () => ["oauth-grants"] as const,
  delegation: (slug: string, projectId: string, id: string) =>
    ["workspaces", slug, "projects", projectId, "delegations", id] as const,
  cycleStories: (slug: string, projectId: string, cycleId: string) =>
    ["workspaces", slug, "projects", projectId, "cycles", cycleId, "stories"] as const,
  moduleStories: (slug: string, projectId: string, moduleId: string) =>
    ["workspaces", slug, "projects", projectId, "modules", moduleId, "stories"] as const,
  authMe: ["auth", "me"] as const,
  pendingInvites: ["auth", "pending-invites"] as const,
  github: (slug: string) => ["workspaces", slug, "github"] as const,
  githubRepos: (slug: string) => ["workspaces", slug, "github", "repos"] as const,
  billing: (slug: string) => ["workspaces", slug, "billing"] as const,
  wallet: (slug: string) => ["wallet", slug] as const,
  subscription: (slug: string) => ["workspaces", slug, "billing", "subscription"] as const,
  entitlements: (slug: string) => ["workspaces", slug, "entitlements"] as const,
  initiatives: (slug: string) => ["workspaces", slug, "initiatives"] as const,
  initiativeRollup: (slug: string, initiativeId: string) =>
    ["workspaces", slug, "initiatives", initiativeId, "rollup"] as const,
  releases: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "releases"] as const,
  workflowRules: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "workflow-rules"] as const,
  automationRules: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "automation-rules"] as const,
  automationRuns: (slug: string, projectId: string, ruleId: string) =>
    ["workspaces", slug, "projects", projectId, "automation-rules", ruleId, "runs"] as const,
  templates: (slug: string, kind?: string) =>
    ["workspaces", slug, "templates", kind ?? "all"] as const,
  recurrences: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "recurrences"] as const,
  teamspaces: (slug: string) => ["workspaces", slug, "teamspaces"] as const,
  teamspaceOverview: (slug: string, teamspaceId: string) =>
    ["workspaces", slug, "teamspaces", teamspaceId, "overview"] as const,
  walletTransactions: (slug: string) => ["wallet", slug, "transactions"] as const,
  aiThreadUsage: (slug: string, projectId: string, storyId: string, threadId: string) =>
    ["workspaces", slug, "projects", projectId, "stories", storyId, "ai-usage", threadId] as const,
  aiWorkspaceUsage: (slug: string) => ["workspaces", slug, "ai-usage"] as const,
  pages: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "pages"] as const,
  page: (slug: string, projectId: string, pageId: string) =>
    ["workspaces", slug, "projects", projectId, "pages", pageId] as const,
  meetings: (slug: string, projectId: string) =>
    ["workspaces", slug, "projects", projectId, "meetings"] as const,
  meeting: (slug: string, projectId: string, meetingId: string) =>
    ["workspaces", slug, "projects", projectId, "meetings", meetingId] as const,
  meetingSegments: (slug: string, projectId: string, meetingId: string) =>
    ["workspaces", slug, "projects", projectId, "meetings", meetingId, "segments"] as const,
  meetingActionItems: (slug: string, projectId: string, meetingId: string) =>
    ["workspaces", slug, "projects", projectId, "meetings", meetingId, "action-items"] as const,
  pagePresence: (slug: string, projectId: string, pageId: string, editing: boolean) =>
    ["workspaces", slug, "projects", projectId, "pages", pageId, "presence", editing] as const,
  webhooks: (slug: string) => ["workspaces", slug, "webhooks"] as const,
  webhook: (slug: string, webhookId: string) =>
    ["workspaces", slug, "webhooks", webhookId] as const,
  stickies: (slug: string) => ["workspaces", slug, "stickies"] as const,
  triage: (slug: string) => ["workspaces", slug, "triage"] as const,
  customers: (slug: string) => ["workspaces", slug, "customers"] as const,
  workspaceTimeEntries: (
    slug: string,
    filters: { user_id?: string; story_id?: string } = {},
  ) =>
    ["workspaces", slug, "time-entries", filters.user_id ?? null, filters.story_id ?? null] as const,
  dashboards: (slug: string) => ["workspaces", slug, "dashboards"] as const,
  dashboard: (slug: string, dashboardId: string) =>
    ["workspaces", slug, "dashboards", dashboardId] as const,
  dashboardMetrics: (
    slug: string,
    params: {
      project_id?: string;
      assignee_id?: string;
      priority?: string;
      status?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) =>
    [
      "workspaces",
      slug,
      "dashboards",
      "metrics",
      params.project_id ?? null,
      params.assignee_id ?? null,
      params.priority ?? null,
      params.status ?? null,
      params.date_from ?? null,
      params.date_to ?? null,
    ] as const,
  dashboardActivity: (
    slug: string,
    params: {
      project_id?: string;
      date_from?: string;
      date_to?: string;
      bucket?: string;
    } = {},
  ) =>
    [
      "workspaces",
      slug,
      "dashboards",
      "activity",
      params.project_id ?? null,
      params.date_from ?? null,
      params.date_to ?? null,
      params.bucket ?? null,
    ] as const,
  dashboardPlanned: (
    slug: string,
    params: {
      project_id?: string;
      date_from?: string;
      date_to?: string;
      bucket?: string;
    } = {},
  ) =>
    [
      "workspaces",
      slug,
      "dashboards",
      "planned",
      params.project_id ?? null,
      params.date_from ?? null,
      params.date_to ?? null,
      params.bucket ?? null,
    ] as const,
  // Public (token-scoped) dashboard reads — GIN-489. Keyed by token, never by
  // workspace: the anonymous page has no workspace to key on.
  publicDashboard: (token: string) => ["public-dashboards", token] as const,
  publicDashboardMetrics: (
    token: string,
    widgetId: string,
    params: { date_from?: string; date_to?: string } = {},
  ) =>
    [
      "public-dashboards",
      token,
      "metrics",
      widgetId,
      params.date_from ?? null,
      params.date_to ?? null,
    ] as const,
  publicDashboardActivity: (
    token: string,
    widgetId: string,
    params: { date_from?: string; date_to?: string; bucket?: string } = {},
  ) =>
    [
      "public-dashboards",
      token,
      "activity",
      widgetId,
      params.date_from ?? null,
      params.date_to ?? null,
      params.bucket ?? null,
    ] as const,
  publicDashboardPlanned: (
    token: string,
    widgetId: string,
    params: { date_from?: string; date_to?: string; bucket?: string } = {},
  ) =>
    [
      "public-dashboards",
      token,
      "planned",
      widgetId,
      params.date_from ?? null,
      params.date_to ?? null,
      params.bucket ?? null,
    ] as const,
  publicDashboardAnalytics: (token: string) =>
    ["public-dashboards", token, "analytics"] as const,
  workspaceViews: (slug: string) => ["workspaces", slug, "workspace-views"] as const,
  exports: (slug: string, filters: { limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "exports", filters.limit ?? null, filters.offset ?? null] as const,
  imports: (slug: string, filters: { limit?: number; offset?: number } = {}) =>
    ["workspaces", slug, "imports", filters.limit ?? null, filters.offset ?? null] as const,
  workItemImportJob: (slug: string, projectId: string, jobId: string) =>
    ["work-item-import-job", slug, projectId, jobId] as const,
  workItemExportJob: (slug: string, projectId: string, jobId: string) =>
    ["work-item-export-job", slug, projectId, jobId] as const,
  githubImportPreview: (slug: string, owner: string, repo: string) =>
    ["workspaces", slug, "imports", "github", "preview", owner, repo] as const,
  slack: (slug: string) => ["workspaces", slug, "slack"] as const,
  slackChannels: (slug: string) => ["workspaces", slug, "slack", "channels"] as const,
  invitations: (slug: string) => ["workspaces", slug, "invitations"] as const,
  drafts: (workspaceSlug: string) => ["workspaces", workspaceSlug, "drafts"] as const,
  workspaceStories: (
    slug: string,
    filters: {
      q?: string;
      status?: string;
      product_only?: boolean;
      assignee_id?: string;
      watching?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) =>
    [
      "workspaces",
      slug,
      "stories",
      filters.q ?? null,
      filters.status ?? null,
      filters.product_only ?? null,
      filters.assignee_id ?? null,
      filters.watching ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  marketplaceJobs: ["marketplace", "jobs"] as const,
  marketplaceJob: (jobId: string) => ["marketplace", "jobs", jobId] as const,
  marketplaceListings: ["marketplace", "listings"] as const,
  marketplaceListing: (listingId: string) => ["marketplace", "listings", listingId] as const,
  workspaceListings: (slug: string) => ["workspaces", slug, "marketplace", "listings"] as const,
  listingBids: (slug: string, listingId: string) =>
    ["workspaces", slug, "marketplace", "listings", listingId, "bids"] as const,
  workspaceContracts: (slug: string) => ["workspaces", slug, "marketplace", "contracts"] as const,
  marketplaceContract: (contractId: string) => ["marketplace", "contracts", contractId] as const,
  contractStories: (contractId: string) => ["marketplace", "contracts", contractId, "stories"] as const,
  contractDocuments: (contractId: string) => ["marketplace", "contracts", contractId, "documents"] as const,
  myContracts: (role: string) => ["marketplace", "contracts", "mine", role] as const,
  marketplaceFreelancers: ["marketplace", "talent"] as const,
  marketplaceFreelancer: (freelancerId: string) => ["marketplace", "talent", freelancerId] as const,
  adminMe: ["admin", "me"] as const,
  adminPrivileges: ["admin", "privileges"] as const,
  adminRoles: ["admin", "roles"] as const,
  adminStaff: ["admin", "staff"] as const,
  adminNotificationTemplates: ["admin", "notification-templates"] as const,
  adminPlanPrices: ["admin", "plan-prices"] as const,
  adminNotificationTemplate: (triggerKey: string) =>
    ["admin", "notification-templates", triggerKey] as const,
  adminAuditLogs: (
    filters: {
      action?: string;
      actor_staff_id?: string;
      created_from?: string;
      created_to?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) =>
    [
      "admin",
      "audit-logs",
      filters.action ?? null,
      filters.actor_staff_id ?? null,
      filters.created_from ?? null,
      filters.created_to ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminPlatformUsers: (filters: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    [
      "admin",
      "platform-users",
      filters.q ?? null,
      filters.status ?? "all",
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminPlatformUser: (userId: string) => ["admin", "platform-users", userId] as const,
  adminPlatformUserWorkspaces: (userId: string) =>
    ["admin", "platform-users", userId, "workspaces"] as const,
  adminPlatformUserActivity: (userId: string, filters: { limit?: number; offset?: number } = {}) =>
    [
      "admin",
      "platform-users",
      userId,
      "activity",
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageSummary: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "summary",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageTimeseries: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "timeseries",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageHeatmapDaily: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "heatmap-daily",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageHeatmapHourly: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "heatmap-hourly",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageMatrix: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "matrix",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageByWorkspace: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "by-workspace",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageByUser: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "by-user",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
  adminLlmUsageEvents: (filters: ILlmUsageKeyFilters = {}) =>
    [
      "admin",
      "llm-usage",
      "events",
      filters.from ?? null,
      filters.to ?? null,
      filters.selected_date ?? null,
      filters.workspace_id ?? null,
      filters.user_id ?? null,
      filters.source ?? null,
      filters.operation ?? null,
      filters.model ?? null,
      filters.metric ?? null,
      filters.limit ?? null,
      filters.offset ?? null,
    ] as const,
};
