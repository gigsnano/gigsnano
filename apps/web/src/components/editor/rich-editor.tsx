"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";

import { cn } from "@/lib/utils";
import { SlashCommand } from "./extensions/slash-command";
import {
  createUserMentionExtension,
  type IMentionMember,
} from "./extensions/mention/mention-extension";
import {
  createWorkItemRefExtension,
  setWorkItemRefData,
  type IWorkItemRefTarget,
} from "./extensions/work-item-ref/work-item-ref-extension";
import {
  AttachmentExtension,
  setAttachmentResolver,
} from "./extensions/attachment/attachment-extension";
import { EditorBubbleMenu } from "./editor-bubble-menu";
import { EditorToolbar } from "./editor-toolbar";
import { MermaidCodeBlock } from "./extensions/mermaid-code-block";
import { createImagePaste, type ImageUploader } from "./extensions/image-paste";
import { useSourceMode } from "@/hooks/editor/use-source-mode";
import { SourceModeToggle } from "./source-mode-toggle";
import "./editor.css";

// CodeMirror (markdown-source-editor.tsx) is only needed once a user opens
// source mode, so it's kept out of the main editor bundle (react-doctor #58).
const MarkdownSourceEditor = dynamic(
  () => import("./markdown-source-editor").then((m) => m.MarkdownSourceEditor),
  { ssr: false },
);

/**
 * Uploads an arbitrary file (the comment "attach" button) and returns the file's
 * identity + display metadata for the `attachment` node. The download URL is
 * derived from `fileId` at render, so it is not part of this contract (GIN-372).
 */
export type FileUploader = (file: File) => Promise<{
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}>;

interface RichEditorProps {
  value: string;
  /**
   * Called with the rendered HTML and the canonical ProseMirror JSON.
   *
   * `value` stays HTML because that is what the API returns for rendering; only
   * the *save* side needs the canonical form. Consumers that persist content
   * should send `json` with `content_format: "json"` — a save that only sends
   * HTML clears the row's canonical copy, because the backend deliberately has
   * no HTML parser on the write path (ADR 0001).
   */
  onChange: (html: string, json: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  /** When set, enables Plane-style `@` mentions (`mention-component` HTML). */
  mentionMembers?: IMentionMember[];
  /**
   * When set, enables `#` work-item references (`work-item-ref` HTML). The list
   * is the pool the picker offers and the chip resolves labels against.
   */
  workItems?: IWorkItemRefTarget[];
  /** Resolves a referenced work-item id to an in-app href for click-navigation. */
  resolveWorkItemHref?: (workItemId: string) => string | undefined;
  /**
   * `full` = seamless description editor (slash menu + bubble menu, no box);
   * `comment` = boxed editor with a persistent bottom toolbar (Plane comment
   * style); `lite` = paragraph + mentions only, no formatting.
   */
  variant?: "full" | "comment" | "lite";
  /**
   * When set, pasted/dropped images are uploaded via this fn and the returned
   * URL is inserted. Without it, images inline as base64 (full/comment only).
   */
  onUploadImage?: ImageUploader;
  /** Enables the comment toolbar's "attach file" button + the `attachment` node. */
  onUploadFile?: FileUploader;
  /** Resolves an attachment's `fileId` to a download URL for its chip. */
  resolveAttachmentUrl?: (fileId: string) => string | undefined;
  /** Rendered at the right of the comment toolbar (e.g. the "Comment" button). */
  toolbarActions?: ReactNode;
}

/**
 * Seamless inline rich-text editor (TipTap/ProseMirror). `full` = the content
 * IS the page body (slash `/` menu, `@` mentions, floating format menu on
 * selection); `comment` = a compact boxed editor with a persistent toolbar;
 * `lite` = plain paragraph + mentions.
 */
export function RichEditor({
  value,
  onChange,
  editable = true,
  placeholder = "Write something, or press '/' for commands…",
  autofocus = false,
  className,
  mentionMembers,
  workItems,
  resolveWorkItemHref,
  variant = "full",
  onUploadImage,
  onUploadFile,
  resolveAttachmentUrl,
  toolbarActions,
}: RichEditorProps) {
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const membersRef = useRef(mentionMembers ?? []);
  const uploaderRef = useRef(onUploadImage);

  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
    membersRef.current = mentionMembers ?? [];
    uploaderRef.current = onUploadImage;
  }, [onChange, value, mentionMembers, onUploadImage]);

  const mentionsEnabled = mentionMembers !== undefined;
  const workItemsEnabled = workItems !== undefined;
  const attachmentsEnabled = onUploadFile !== undefined;
  const isLite = variant === "lite";
  const isFull = variant === "full";
  const isComment = variant === "comment";
  // full + comment share the rich block set; only full gets headings/hr + slash.
  const rich = !isLite;

  // The `*Ref.current` reads below are inside getter closures that TipTap calls
  // while editing, never during render — the extensions are built once and read
  // their live data through these getters. `react-hooks-js/refs` matches the
  // lexical `.current` and can't see that, so it is a false positive here.
  /* oxlint-disable react-hooks-js/refs */
  const extensions = useMemo(() => {
    const base: Extensions = [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
        heading: isFull ? { levels: [1, 2, 3] } : false,
        blockquote: rich ? undefined : false,
        // rich variants swap in the mermaid-aware code block (added below); lite has none.
        codeBlock: false,
        horizontalRule: isFull ? undefined : false,
        bulletList: rich ? undefined : false,
        orderedList: rich ? undefined : false,
        listItem: rich ? undefined : false,
      }),
      Placeholder.configure({ placeholder }),
    ];
    if (rich) {
      base.push(TaskList, TaskItem.configure({ nested: true }));
      base.push(TextAlign.configure({ types: ["heading", "paragraph"] }));
      base.push(MermaidCodeBlock);
      base.push(createImagePaste(() => uploaderRef.current));
    }
    if (mentionsEnabled) {
      base.push(
        createUserMentionExtension(
          () => membersRef.current,
          (userId) => membersRef.current.find((m) => m.user_id === userId)?.display_name,
        ),
      );
    }
    if (workItemsEnabled) {
      base.push(createWorkItemRefExtension());
    }
    if (attachmentsEnabled) {
      base.push(AttachmentExtension);
    }
    if (isFull) {
      base.push(SlashCommand);
    }
    return base;
  }, [placeholder, mentionsEnabled, workItemsEnabled, attachmentsEnabled, isLite, isFull, rich]);
  /* oxlint-enable react-hooks-js/refs */

  // Gates `onChange` until the initial external value has been synced. TipTap
  // fires an `onUpdate` while initializing (immediatelyRender:false); without
  // this guard that init update propagates as a user edit and clobbers the
  // `value` prop — e.g. a `key`-remount seeded with AI-generated HTML would be
  // immediately overwritten with the empty "<p></p>" the fresh editor starts on.
  const readyRef = useRef(false);

  const syncExternalValue = (currentEditor: Editor) => {
    const external = valueRef.current;
    if (external !== currentEditor.getHTML()) {
      currentEditor.commands.setContent(external, { emitUpdate: false });
    }
  };

  // NOTE: do not re-seed from `value` on focus or blur. Consumers keep live
  // edits in refs and pass `value` only as a seed (page detail, work-item
  // description), so at blur time the *editor* holds the truth and the prop is
  // stale — re-seeding there discarded everything typed since the seed. That is
  // what made bubble-menu formatting look like it "reverted": the toolbar button
  // takes DOM focus, the editor blurs, and the document snaps back to the seed.
  // Genuine external changes are handled by the idle-only effect below.
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps: {
      attributes: {
        class: cn(
          "gn-prose focus:outline-none",
          (isLite || isComment) && "gn-comment-editor min-h-[4.5rem]",
          className,
        ),
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      syncExternalValue(createdEditor);
      createdEditor.setEditable(editable);
      if (autofocus) createdEditor.commands.focus();
      readyRef.current = true;
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (!readyRef.current) return; // ignore TipTap's init-time update (not a user edit)
      onChangeRef.current(updatedEditor.getHTML(), updatedEditor.getJSON());
    },
  });

  const source = useSourceMode({
    getJson: () => (editor ? (editor.getJSON() as Record<string, unknown>) : { type: "doc" }),
    setJson: (json) => editor?.commands.setContent(json),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Feed the workItemRef extension its live data through the editor's own
  // storage (the mutation lives in the extension module, never in this render)
  // so the once-built extension always sees the latest work items + resolver.
  useEffect(() => {
    if (!editor || !workItemsEnabled) return;
    setWorkItemRefData(editor, workItems ?? [], resolveWorkItemHref);
  }, [editor, workItemsEnabled, workItems, resolveWorkItemHref]);

  // Same storage seam for the attachment node's fileId -> download-URL resolver.
  useEffect(() => {
    if (!editor || !attachmentsEnabled || !resolveAttachmentUrl) return;
    setAttachmentResolver(editor, resolveAttachmentUrl);
  }, [editor, attachmentsEnabled, resolveAttachmentUrl]);

  // Re-sync when the bound `value` changes externally while the editor is idle
  // (e.g. restoring a description from history). Skipped when focused so it never
  // fights active typing or moves the cursor; `emitUpdate:false` stops the synced
  // content from echoing back through `onChange` as a user edit.
  useEffect(() => {
    if (!editor || !readyRef.current || editor.isFocused) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <>
      {editable && isFull ? (
        <div
          className="relative"
          onKeyDownCapture={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
              e.preventDefault();
              if (source.busy) return;
              if (source.mode === "visual") source.enter();
              else
                void source.exit().then((ok) => {
                  if (ok) editor?.commands.focus(undefined, { scrollIntoView: false });
                });
            }
          }}
        >
          <div className="absolute right-0 top-0 z-10">
            <SourceModeToggle
              mode={source.mode}
              disabled={source.busy}
              onToggle={() =>
                source.mode === "visual"
                  ? source.enter()
                  : void source.exit().then((ok) => {
                      if (ok) editor?.commands.focus(undefined, { scrollIntoView: false });
                    })
              }
            />
          </div>
          {source.lossy.length > 0 && source.mode === "source" ? (
            <p
              role="status"
              className="mb-2 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
            >
              Editing as Markdown may not preserve: {source.lossy.join(", ")}
            </p>
          ) : null}
          {source.errors.length > 0 ? (
            <p
              role="alert"
              aria-live="assertive"
              className="mb-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
            >
              Fix {source.errors.length} error(s) to return to the visual editor.
            </p>
          ) : null}
          {source.mode === "source" ? (
            <MarkdownSourceEditor value={source.buffer} onChange={source.setBuffer} errors={source.errors} />
          ) : (
            <div>
              <EditorBubbleMenu editor={editor} />
              <EditorContent editor={editor} />
            </div>
          )}
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
      {editable && isComment ? (
        <EditorToolbar
          editor={editor}
          onUploadImage={onUploadImage}
          onUploadFile={onUploadFile}
          rightSlot={toolbarActions}
        />
      ) : null}
    </>
  );
}

export type { IMentionMember };
