import { APIError } from "@/services/api-error";
import type { IAuthUser, IStory } from "@/types";
import type { ITimeEntry } from "@/types/story/story-detail";
import {
  EStoryActivityField,
  EStoryActivityKind,
  EStoryRelationType,
} from "@/types/story/story-detail";

import { projects } from "../data/projects";
import { allStories } from "../data/stories";
import {
  appendStoryActivity,
  ensureStoryCreatedActivity,
  nextCommentId,
  nextLinkId,
  nextRelationId,
  nextTimeEntryId,
  storyActivities,
  storyComments,
  storyLinks,
  storyRelations,
  storySubscriptions,
  timeEntries,
} from "../data/story-detail";
import { RELATION_TYPE_LABEL } from "@/constants/story-relation-meta";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const notFound = (what: string): never => {
  throw new APIError(404, `${what} not found`);
};

function storyKey(projectId: string, order: number) {
  const project = projects.find((p) => p.id === projectId);
  return `${project?.identifier ?? "—"}-${order}`;
}

function findStory(slug: string, projectId: string, storyId: string): IStory | undefined {
  return allStories.find(
    (s) => s.workspace_slug === slug && s.project_id === projectId && s.id === storyId,
  );
}

function actor(user: IAuthUser | null) {
  return {
    id: user?.id ?? "user_unknown",
    name: user?.display_name ?? "You",
    avatar: user?.avatar_url ?? null,
  };
}

export function makeStoryDetailHandlers(getUser: () => IAuthUser | null): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/links\/$/,
      resolve: ([, , , storyId]) =>
        clone(storyLinks.filter((l) => l.story_id === storyId)),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/links\/$/,
      resolve: ([, , , storyId], body) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        const b = body as { title: string; url: string };
        const now = new Date().toISOString();
        const link = {
          id: nextLinkId(),
          story_id: storyId,
          title: b.title.trim(),
          url: b.url.trim(),
          created_by_id: user.id,
          created_by_name: user.display_name,
          created_at: now,
        };
        storyLinks.push(link);
        appendStoryActivity({
          story_id: storyId,
          kind: EStoryActivityKind.Property,
          field: EStoryActivityField.Link,
          actor_id: user.id,
          actor_name: user.display_name,
          summary: `added link ${link.title}`,
          old_value: null,
          new_value: link.url,
          created_at: now,
        });
        return clone(link);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/links\/([^/]+)\/$/,
      resolve: ([, , , storyId, linkId], body) => {
        const link = storyLinks.find((l) => l.story_id === storyId && l.id === linkId);
        if (!link) return notFound(`Link "${linkId}"`);
        const b = body as { title?: string; url?: string };
        if (b.title?.trim()) link.title = b.title.trim();
        if (b.url?.trim()) link.url = b.url.trim();
        return clone(link);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/links\/([^/]+)\/$/,
      resolve: ([, , , storyId, linkId]) => {
        const i = storyLinks.findIndex((l) => l.story_id === storyId && l.id === linkId);
        if (i === -1) return notFound(`Link "${linkId}"`);
        storyLinks.splice(i, 1);
        return { success: true };
      },
    },
    // Time entries (GIN-55/56/57)
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/time-entries\/$/,
      resolve: ([, , , storyId]) =>
        clone(
          timeEntries
            .filter((e) => e.story_id === storyId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/time-entries\/$/,
      resolve: ([, , , storyId], body) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        const b = body as { hours: number; note?: string };
        if (!(b.hours > 0)) throw new APIError(422, "Hours must be greater than 0");
        const entry: ITimeEntry = {
          id: nextTimeEntryId(),
          story_id: storyId,
          hours: b.hours,
          note: (b.note ?? "").trim(),
          user_id: user.id,
          user_name: user.display_name,
          user_avatar_url: user.avatar_url,
          created_at: new Date().toISOString(),
        };
        timeEntries.push(entry);
        return clone(entry);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/time-entries\/([^/]+)\/$/,
      resolve: ([, , , storyId, entryId]) => {
        const i = timeEntries.findIndex((e) => e.story_id === storyId && e.id === entryId);
        if (i === -1) return notFound(`Time entry "${entryId}"`);
        timeEntries.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/relations\/$/,
      resolve: ([, , , storyId]) =>
        clone(storyRelations.filter((r) => r.story_id === storyId)),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/relations\/$/,
      resolve: ([, slug, projectId, storyId], body) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        const b = body as { relation_type: EStoryRelationType; related_story_id: string };
        const related = findStory(slug, projectId, b.related_story_id);
        if (!related) return notFound(`Story "${b.related_story_id}"`);
        const now = new Date().toISOString();
        const relation = {
          id: nextRelationId(),
          story_id: storyId,
          related_story_id: b.related_story_id,
          relation_type: b.relation_type,
          related_story_title: related.title,
          related_story_key: storyKey(projectId, related.order),
          created_at: now,
        };
        storyRelations.push(relation);
        appendStoryActivity({
          story_id: storyId,
          kind: EStoryActivityKind.Property,
          field: EStoryActivityField.Relation,
          actor_id: user.id,
          actor_name: user.display_name,
          summary: `${RELATION_TYPE_LABEL[b.relation_type].toLowerCase()} ${relation.related_story_key}`,
          old_value: null,
          new_value: related.title,
          created_at: now,
        });
        return clone(relation);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/relations\/([^/]+)\/$/,
      resolve: ([, , , storyId, relationId]) => {
        const i = storyRelations.findIndex((r) => r.story_id === storyId && r.id === relationId);
        if (i === -1) return notFound(`Relation "${relationId}"`);
        storyRelations.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/comments\/$/,
      resolve: ([, , , storyId]) =>
        clone(
          storyComments
            .filter((c) => c.story_id === storyId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/comments\/$/,
      resolve: ([, , , storyId], body) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        const b = body as { body: string };
        const now = new Date().toISOString();
        const comment = {
          id: nextCommentId(),
          story_id: storyId,
          body: b.body.trim(),
          author_id: user.id,
          author_name: user.display_name,
          author_avatar_url: user.avatar_url,
          created_at: now,
          updated_at: now,
        };
        storyComments.push(comment);
        appendStoryActivity({
          story_id: storyId,
          kind: EStoryActivityKind.Comment,
          field: null,
          actor_id: user.id,
          actor_name: user.display_name,
          summary: "left a comment",
          old_value: null,
          new_value: comment.body,
          created_at: now,
        });
        return clone(comment);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/comments\/([^/]+)\/$/,
      resolve: ([, , , storyId, commentId], body) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        const comment = storyComments.find((c) => c.story_id === storyId && c.id === commentId);
        if (!comment) return notFound(`Comment "${commentId}"`);
        const b = body as { body: string };
        comment.body = b.body.trim();
        comment.updated_at = new Date().toISOString();
        return clone(comment);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/comments\/([^/]+)\/$/,
      resolve: ([, , , storyId, commentId]) => {
        const i = storyComments.findIndex((c) => c.story_id === storyId && c.id === commentId);
        if (i === -1) return notFound(`Comment "${commentId}"`);
        storyComments.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/history\/$/,
      resolve: ([, slug, projectId, storyId]) => {
        const user = getUser();
        const story = findStory(slug, projectId, storyId);
        if (story) {
          ensureStoryCreatedActivity(storyId, actor(user).id, actor(user).name, story.created_at);
        }
        return clone(
          storyActivities
            .filter((a) => a.story_id === storyId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/subscribe\/$/,
      resolve: ([, , , storyId]) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        return { subscribed: storySubscriptions.has(`${user.id}:${storyId}`) };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/subscribe\/$/,
      resolve: ([, , , storyId]) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        storySubscriptions.add(`${user.id}:${storyId}`);
        return { subscribed: true as const };
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/subscribe\/$/,
      resolve: ([, , , storyId]) => {
        const user = getUser();
        if (!user) throw new APIError(401, "Not authenticated");
        storySubscriptions.delete(`${user.id}:${storyId}`);
        return { subscribed: false as const };
      },
    },
  ];
}
