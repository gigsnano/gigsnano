"use client";

import { useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Attachment01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { readUploadFileContent } from "@/lib/docs/read-upload-file";
import { cn } from "@/lib/utils";

/** A document staged in the create modal, uploaded to the story once it's created. */
export interface IPendingAttachment {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  content: string;
}

const ACCEPT = "image/*,.md,.txt,.pdf,.docx,text/*,application/pdf";

/**
 * Lets the user stage reference documents while creating a work item (GIN-79).
 * Files are read to content here and held by the modal; the actual upload runs
 * after the story is created (its id isn't known yet).
 */
export function AttachmentsField({
  value,
  onChange,
}: {
  value: IPendingAttachment[];
  onChange: (next: IPendingAttachment[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    const staged = await Promise.all(
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content: await readUploadFileContent(file),
      })),
    );
    onChange([...value, ...staged]);
  };

  const remove = (id: string) => onChange(value.filter((a) => a.id !== id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground",
          "transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]",
        )}
      >
        <HugeiconsIcon icon={Attachment01Icon} className="size-3.5" />
        Attach documents
      </button>
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        aria-label="Attach documents"
        accept={ACCEPT}
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void addFiles(Array.from(files));
          e.target.value = "";
        }}
      />
      {value.map((a) => (
        <span
          key={a.id}
          className="inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground"
        >
          <span className="truncate">{a.file_name}</span>
          <button
            type="button"
            aria-label={`Remove ${a.file_name}`}
            onClick={() => remove(a.id)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
