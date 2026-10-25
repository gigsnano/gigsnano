export interface Story {
  id: string;
  code: string | null;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: string;
  type?: string;
  project_id: string;
  workspace_slug: string;
  assignee_id?: string | null;
  /** >0 means this item has children — see `subStories`. */
  sub_issue_count?: number;
}

export interface Comment {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}
export interface Document {
  id: string;
  title: string;
  content: string;
  file_name: string | null;
  mime_type: string | null;
}
export interface Project {
  id: string;
  name: string;
  identifier: string;
  description?: string;
}
export interface ProjectState { id: string; name: string; color: string; }
export interface ProjectLabel { id: string; name: string; color: string; }
export interface Member { user_id: string; display_name: string; email: string; role: string; status: string; }
export interface UserRow { id: string; display_name: string; email: string; avatar_url: string | null; }
export interface Cycle { id: string; name: string; start_date: string | null; end_date: string | null; }
export interface Module { id: string; name: string; }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class GigsnanoClient {
  constructor(private cfg: { baseUrl: string; token: string }) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = ((await res.json()) as { detail?: string }).detail ?? detail; } catch {}
      throw new ApiError(res.status, detail);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  projectByRepo(fullName: string) {
    return this.req<{ workspace_slug: string; project_id: string; identifier: string }>(
      "GET", `/projects/by-repo?full_name=${encodeURIComponent(fullName)}`);
  }
  resolveStory(slug: string, code: string) {
    return this.req<Story>("GET", `/workspaces/${slug}/stories/resolve/${encodeURIComponent(code)}`);
  }
  /**
   * Resolve many codes at once (GIN-174).
   *
   * The API has no bulk-resolve endpoint, so this fans out. The win isn't fewer
   * HTTP requests — it's one agent round-trip instead of N, which is the cost
   * that actually dominates.
   *
   * One bad code doesn't sink the batch: results come back per code, so a typo
   * in item 3 still returns items 1, 2, 4… Duplicates are collapsed rather than
   * fetched twice.
   *
   * ponytail: unbounded fan-out; the tool caps the array. Add a real bulk
   * endpoint if batches ever get big enough for that to matter.
   */
  async bulkResolveStories(slug: string, codes: string[]) {
    const unique = [...new Set(codes)];
    const settled = await Promise.allSettled(
      unique.map((code) => this.resolveStory(slug, code)),
    );
    const items: Story[] = [];
    const errors: { code: string; error: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(r.value);
      else errors.push({ code: unique[i], error: (r.reason as Error)?.message ?? String(r.reason) });
    });
    return { items, errors };
  }
  subStories(slug: string, projectId: string, storyId: string) {
    return this.req<Story[]>(
      "GET", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/sub-stories/`);
  }
  /**
   * Workspace-wide text search. Unlike `listStories` this needs no project id,
   * which is the whole point: "does a ticket about X already exist anywhere?"
   * can't be asked of a project-scoped list.
   */
  searchStories(slug: string, params: { q: string; status?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams({ q: params.q });
    if (params.status) qs.set("status", params.status);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    return this.req<{ items: Story[]; total: number }>(
      "GET", `/workspaces/${slug}/stories/?${qs.toString()}`);
  }
  updateStory(slug: string, projectId: string, storyId: string, patch: object) {
    return this.req<Story>("PATCH",
      `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/`, patch);
  }
  addComment(slug: string, projectId: string, storyId: string, body: string, contentFormat = "markdown") {
    return this.req<void>("POST",
      `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/comments/`,
      { body, content_format: contentFormat });
  }
  myStories(slug: string) {
    return this.req<{ items: Story[] }>("GET", `/workspaces/${slug}/my-stories/`)
      .then((p) => p.items);
  }

  // --- Work items ---
  /**
   * Project-scoped list (project in the PATH). The workspace-wide
   * `/workspaces/{slug}/stories/` endpoint ignores project filtering.
   *
   * Returns the page AND the server's total. Callers must surface both: the
   * endpoint defaults to 50 rows, so dropping `total` silently presents a page
   * as if it were the whole project (GIN-174).
   */
  listStories(
    slug: string,
    projectId: string,
    params: {
      status?: string;
      assignee_id?: string;
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.assignee_id) q.set("assignee_id", params.assignee_id);
    if (params.q) q.set("q", params.q);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    return this.req<{ items: Story[]; total: number }>(
      "GET",
      `/workspaces/${slug}/projects/${projectId}/stories/${qs ? `?${qs}` : ""}`,
    );
  }
  createStory(slug: string, projectId: string, payload: Record<string, unknown>) {
    return this.req<Story>("POST", `/workspaces/${slug}/projects/${projectId}/stories/`, payload);
  }

  // --- Comments ---
  listComments(slug: string, projectId: string, storyId: string) {
    return this.req<Comment[]>("GET", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/comments/`);
  }
  updateComment(slug: string, projectId: string, storyId: string, commentId: string, body: string, contentFormat = "markdown") {
    return this.req<Comment>("PATCH", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/comments/${commentId}/`, { body, content_format: contentFormat });
  }
  deleteComment(slug: string, projectId: string, storyId: string, commentId: string) {
    return this.req<void>("DELETE", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/comments/${commentId}/`);
  }

  // --- Documents ---
  listStoryDocuments(slug: string, projectId: string, storyId: string) {
    return this.req<Document[]>("GET", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/documents/`);
  }
  getDocument(slug: string, documentId: string) {
    return this.req<Document>("GET", `/workspaces/${slug}/documents/${documentId}/`);
  }
  uploadStoryDocument(slug: string, projectId: string, storyId: string, payload: { title: string; file_name: string; mime_type: string; content: string }) {
    return this.req<Document>("POST", `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/documents/`, payload);
  }
  deleteDocument(slug: string, documentId: string) {
    return this.req<void>("DELETE", `/workspaces/${slug}/documents/${documentId}/`);
  }

  // --- Projects ---
  listProjects(slug: string) {
    return this.req<Project[]>("GET", `/workspaces/${slug}/projects/`);
  }
  getProject(slug: string, projectId: string) {
    return this.req<Project>("GET", `/workspaces/${slug}/projects/${projectId}/`);
  }

  // --- Metadata ---
  listStates(slug: string, projectId: string) {
    return this.req<ProjectState[]>("GET", `/workspaces/${slug}/projects/${projectId}/states/`);
  }
  listLabels(slug: string, projectId: string) {
    return this.req<ProjectLabel[]>("GET", `/workspaces/${slug}/projects/${projectId}/labels/`);
  }
  createLabel(slug: string, projectId: string, payload: { name: string; color: string }) {
    return this.req<ProjectLabel>("POST", `/workspaces/${slug}/projects/${projectId}/labels/`, payload);
  }
  listCycles(slug: string, projectId: string) {
    return this.req<Cycle[]>("GET", `/workspaces/${slug}/projects/${projectId}/cycles/`);
  }
  listModules(slug: string, projectId: string) {
    return this.req<Module[]>("GET", `/workspaces/${slug}/projects/${projectId}/modules/`);
  }

  // --- People ---
  listMembers(slug: string) {
    return this.req<Member[]>("GET", `/workspaces/${slug}/members/`);
  }
  getUser(userId: string) {
    return this.req<UserRow>("GET", `/users/${userId}/`);
  }
}
