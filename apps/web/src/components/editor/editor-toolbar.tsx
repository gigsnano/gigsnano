"use client";

import { useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextStrikethroughIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  CheckmarkSquare01Icon,
  QuoteDownIcon,
  SourceCodeIcon,
  Link01Icon,
  Image01Icon,
  Attachment01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { ImageUploader } from "./extensions/image-paste";
import type { FileUploader } from "./rich-editor";

/**
 * Persistent Plane-style format toolbar for the comment editor. Rendered inside
 * RichEditor (which re-renders on every transaction), so `isActive` highlights
 * stay live. `rightSlot` holds the caller's submit button (the "Comment"
 * button) so the toolbar and action sit on one row, matching Plane.
 */
export function EditorToolbar({
  editor,
  onUploadImage,
  onUploadFile,
  rightSlot,
}: {
  editor: Editor;
  onUploadImage?: ImageUploader;
  onUploadFile?: FileUploader;
  rightSlot?: ReactNode;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file || !onUploadImage) return;
    const src = await onUploadImage(file);
    editor.chain().focus().setImage({ src }).run();
  };

  const pickFile = async (file: File | undefined) => {
    if (!file || !onUploadFile) return;
    const { fileId, fileName, mimeType, size } = await onUploadFile(file);
    editor
      .chain()
      .focus()
      .insertContent({ type: "attachment", attrs: { fileId, fileName, mimeType, size } })
      .run();
  };

  return (
    <div className="flex items-center gap-1 border-t px-1 py-1">
      <div className="flex flex-1 flex-wrap items-center gap-0.5">
        <ToolbarButton
          icon={TextBoldIcon}
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={TextItalicIcon}
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={TextUnderlineIcon}
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={TextStrikethroughIcon}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <Divider />
        <ToolbarButton
          icon={TextAlignLeftIcon}
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          icon={TextAlignCenterIcon}
          label="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          icon={TextAlignRightIcon}
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />
        <Divider />
        <ToolbarButton
          icon={LeftToRightListNumberIcon}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={LeftToRightListBulletIcon}
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={CheckmarkSquare01Icon}
          label="To-do list"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <Divider />
        <ToolbarButton
          icon={QuoteDownIcon}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={SourceCodeIcon}
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          icon={Link01Icon}
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Enter URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        />
        {onUploadImage ? (
          <>
            <Divider />
            <ToolbarButton
              icon={Image01Icon}
              label="Add image"
              active={false}
              onClick={() => imageInput.current?.click()}
            />
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        ) : null}
        {onUploadFile ? (
          <>
            <ToolbarButton
              icon={Attachment01Icon}
              label="Attach file"
              active={false}
              onClick={() => fileInput.current?.click()}
            />
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>
      {rightSlot}
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  );
}
