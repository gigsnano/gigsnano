import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import {
  ParagraphIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  CheckmarkSquare01Icon,
  QuoteDownIcon,
  MinusSignIcon,
  CodeSquareIcon,
  FlowchartIcon,
} from "@hugeicons/core-free-icons";

import { SlashMenu, type SlashItem, type SlashMenuHandle } from "../slash-menu";

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: ParagraphIcon,
    searchTerms: ["paragraph", "p"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: Heading01Icon,
    searchTerms: ["h1", "title", "big"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading02Icon,
    searchTerms: ["h2", "subtitle"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading03Icon,
    searchTerms: ["h3"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bullet list",
    description: "Simple bulleted list",
    icon: LeftToRightListBulletIcon,
    searchTerms: ["unordered", "ul", "bullet"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "List with ordering",
    icon: LeftToRightListNumberIcon,
    searchTerms: ["ordered", "ol", "number"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    description: "Track tasks with checkboxes",
    icon: CheckmarkSquare01Icon,
    searchTerms: ["todo", "task", "check", "checkbox"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Quote",
    description: "Capture a quote",
    icon: QuoteDownIcon,
    searchTerms: ["blockquote", "citation"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Divider",
    description: "Visually divide blocks",
    icon: MinusSignIcon,
    searchTerms: ["hr", "horizontal", "rule", "line"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Code block",
    description: "Capture a code snippet",
    icon: CodeSquareIcon,
    searchTerms: ["codeblock", "snippet", "pre"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Mermaid diagram",
    description: "Flowchart / sequence diagram, rendered live",
    icon: FlowchartIcon,
    searchTerms: ["mermaid", "diagram", "flowchart", "chart", "graph", "sequence"],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCodeBlock({ language: "mermaid" })
        .insertContent("graph TD\n  A[Start] --> B[Done]")
        .run(),
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) => {
    const haystack = [item.title, ...(item.searchTerms ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Positions a floating element under the caret using the suggestion's
 * `clientRect`. Flips above the caret when there isn't room below.
 */
function positionPopup(el: HTMLElement, clientRect: (() => DOMRect | null) | null | undefined) {
  const rect = clientRect?.();
  if (!rect) return;
  const margin = 6;
  el.style.position = "fixed";
  el.style.zIndex = "50";
  const belowRoom = window.innerHeight - rect.bottom;
  const menuHeight = el.offsetHeight || 320;
  const top =
    belowRoom < menuHeight + margin && rect.top > menuHeight + margin
      ? rect.top - menuHeight - margin
      : rect.bottom + margin;
  el.style.top = `${Math.max(margin, top)}px`;
  el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
}

/**
 * Notion-style `/` slash command. Built on `@tiptap/suggestion` + a React-rendered
 * menu positioned manually (no tippy/floating-ui dependency). The suggestion's
 * "selected" payload IS a SlashItem, whose `command` runs the block insertion.
 */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<SlashMenuHandle> | null = null;
          let popup: HTMLDivElement | null = null;

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              });
              popup = document.createElement("div");
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              positionPopup(popup, props.clientRect);
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              });
              if (popup) positionPopup(popup, props.clientRect);
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                popup?.remove();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
