"use client";

import { Button } from "@/components/ui/button";
import { isEditorHtmlEmpty } from "@/lib/editor/is-html-empty";
import { imageService } from "@/services/image.service";

import { CommentEditor, type IMentionMember } from "./comment-editor";

/** Plane-style comment box: boxed rich editor + persistent toolbar + submit. */
export function CommentComposer({
  workspaceSlug,
  projectId,
  members,
  value,
  onChange,
  onSubmit,
  isPending,
}: {
  workspaceSlug: string;
  projectId: string;
  members: IMentionMember[];
  value: string;
  onChange: (html: string, json: Record<string, unknown>) => void;
  onSubmit: () => void;
  isPending?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
      <CommentEditor
        value={value}
        onChange={onChange}
        members={members}
        editable
        autofocus={false}
        className="px-3 pt-2"
        onUploadImage={(file) => imageService.uploadImage(workspaceSlug, file, projectId)}
        onUploadFile={(file) => imageService.uploadFile(workspaceSlug, file, projectId)}
        resolveAttachmentUrl={(fileId) => imageService.fileUrl(workspaceSlug, fileId)}
        toolbarActions={
          <Button
            type="button"
            size="sm"
            disabled={isEditorHtmlEmpty(value) || isPending}
            onClick={onSubmit}
          >
            {isPending ? "Posting…" : "Comment"}
          </Button>
        }
      />
    </div>
  );
}
