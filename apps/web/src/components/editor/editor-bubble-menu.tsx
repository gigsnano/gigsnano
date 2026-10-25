"use client";

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextStrikethroughIcon,
  ParagraphIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  CheckmarkSquare01Icon,
  QuoteDownIcon,
  SourceCodeIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/**
 * Floating format toolbar shown when text is selected — full formatting parity
 * with the comment toolbar (marks · headings · lists/to-do · quote/code · link),
 * so every option is reachable from a selection (GIN-78).
 */
export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, from, to }) =>
        from !== to && !e.isActive("codeBlock") && !e.isActive("horizontalRule")
      }
      className="flex max-w-[92vw] flex-wrap items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
    >
      <BubbleButton
        icon={TextBoldIcon}
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <BubbleButton
        icon={TextItalicIcon}
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <BubbleButton
        icon={TextUnderlineIcon}
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <BubbleButton
        icon={TextStrikethroughIcon}
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <Divider />
      <BubbleButton
        icon={ParagraphIcon}
        label="Normal text"
        active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      />
      <BubbleButton
        icon={Heading01Icon}
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <BubbleButton
        icon={Heading02Icon}
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <BubbleButton
        icon={Heading03Icon}
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <BubbleButton
        icon={LeftToRightListBulletIcon}
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <BubbleButton
        icon={LeftToRightListNumberIcon}
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <BubbleButton
        icon={CheckmarkSquare01Icon}
        label="To-do list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <Divider />
      <BubbleButton
        icon={QuoteDownIcon}
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <BubbleButton
        icon={SourceCodeIcon}
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Divider />
      <BubbleButton
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
    </BubbleMenu>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function BubbleButton({
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
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  );
}
