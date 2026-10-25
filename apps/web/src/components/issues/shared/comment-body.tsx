"use client";

import { CommentEditor, type IMentionMember } from "./comment-editor";

/** Read-only comment body — same TipTap surface Plane uses for display. */
export function CommentBody({
  body,
  members,
  className,
}: {
  body: string;
  members: IMentionMember[];
  className?: string;
}) {
  return (
    <div className={className}>
      <CommentEditor value={body || "<p></p>"} members={members} editable={false} />
    </div>
  );
}

export type { IMentionMember };
