"use client";

import type { ReactNode } from "react";

import { RichEditor, type IMentionMember } from "@/components/editor";
import type { FileUploader } from "@/components/editor";
import type { ImageUploader } from "@/components/editor";

export function CommentEditor({
  value,
  onChange,
  members,
  editable = true,
  placeholder = "Add comment",
  className,
  autofocus = false,
  onUploadImage,
  onUploadFile,
  resolveAttachmentUrl,
  toolbarActions,
}: {
  value: string;
  onChange?: (html: string, json: Record<string, unknown>) => void;
  members: IMentionMember[];
  editable?: boolean;
  placeholder?: string;
  className?: string;
  autofocus?: boolean;
  onUploadImage?: ImageUploader;
  onUploadFile?: FileUploader;
  resolveAttachmentUrl?: (fileId: string) => string | undefined;
  toolbarActions?: ReactNode;
}) {
  return (
    <RichEditor
      value={value || "<p></p>"}
      onChange={onChange ?? (() => {})}
      editable={editable}
      autofocus={autofocus}
      placeholder={placeholder}
      mentionMembers={members}
      variant="comment"
      className={className}
      onUploadImage={onUploadImage}
      onUploadFile={onUploadFile}
      resolveAttachmentUrl={resolveAttachmentUrl}
      toolbarActions={toolbarActions}
    />
  );
}

export type { IMentionMember };
