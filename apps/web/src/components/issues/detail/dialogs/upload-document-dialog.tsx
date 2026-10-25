"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUploadStoryDocument } from "@/hooks/docs/use-documents";
import { readUploadFileContent } from "@/lib/docs/read-upload-file";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function UploadStoryDocumentDialog({
  story,
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const mimeTypeRef = useRef("text/plain");
  const [content, setContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadStoryDocument(workspaceSlug, projectId, story.id);

  const reset = () => {
    setTitle("");
    setFileName("");
    mimeTypeRef.current = "text/plain";
    setContent("");
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setTitle(file.name.replace(/\.[^.]+$/, "") || file.name);
    mimeTypeRef.current = file.type || "application/octet-stream";
    setContent(await readUploadFileContent(file));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileName || !content) return;
    await upload.mutateAsync({
      title: title.trim(),
      project_id: projectId,
      story_id: story.id,
      file_name: fileName,
      mime_type: mimeTypeRef.current,
      content,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>Upload document</DialogTitle>
        <DialogDescription>
          Attach a reference file to this work item. It will appear in Documents and can be
          referenced in chat.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              "rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-6 text-center text-sm text-muted-foreground outline-none",
              "transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              "hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]",
            )}
          >
            {fileName ? (
              <span className="font-medium text-foreground">{fileName}</span>
            ) : (
              <>Drop a file or click to browse · images, .md, .txt, .pdf</>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            aria-label="Choose file to upload"
            accept="image/*,.md,.txt,.pdf,.docx,text/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = "";
            }}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reference document title"
              className={field}
            />
          </label>
          <Button type="submit" disabled={upload.isPending || !fileName || !content}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
