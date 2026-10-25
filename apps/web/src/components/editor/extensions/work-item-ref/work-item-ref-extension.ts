import { mergeAttributes } from "@tiptap/core";
import Mention, { type MentionOptions } from "@tiptap/extension-mention";
import { ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

import { WorkItemRefChip } from "./work-item-ref-chip";
import { WorkItemRefMenu, type WorkItemRefMenuHandle } from "./work-item-ref-menu";
import { EWorkItemRefAttribute, EWorkItemRefHtmlAttribute } from "./types";
import type { IWorkItemRefTarget } from "./types";

/**
 * Live data the node reads at interaction time. Lives on `editor.storage.workItemRef`
 * and is mutated from an effect by the host component — never read during render —
 * so the once-built extension always sees the latest work items without the caller
 * plumbing a ref through its render body (which React Compiler cannot optimize).
 */
export interface IWorkItemRefStore {
  items: IWorkItemRefTarget[];
  resolveHref?: (workItemId: string) => string | undefined;
}

// Distinct from the mention node's suggestion plugin — both extend Mention and
// run in the same editor, so a shared default key would clash at mount.
const WORK_ITEM_REF_PLUGIN_KEY = new PluginKey("workItemRefSuggestion");

function store(editor: Editor): IWorkItemRefStore {
  return (editor.storage as unknown as { workItemRef: IWorkItemRefStore }).workItemRef;
}

/**
 * Push the host's live work-item data onto the extension's storage. Kept here (a
 * module function, not the host's render body) so the once-built extension sees
 * the latest items without the caller mutating a hook value during render.
 */
export function setWorkItemRefData(
  editor: Editor,
  items: IWorkItemRefTarget[],
  resolveHref?: (workItemId: string) => string | undefined,
) {
  const s = (editor.storage as unknown as { workItemRef?: IWorkItemRefStore }).workItemRef;
  if (!s) return;
  s.items = items;
  s.resolveHref = resolveHref;
}

function positionPopup(el: HTMLElement, clientRect: (() => DOMRect | null) | null | undefined) {
  const rect = clientRect?.();
  if (!rect) return;
  const margin = 6;
  el.style.position = "fixed";
  el.style.zIndex = "50";
  const belowRoom = window.innerHeight - rect.bottom;
  const menuHeight = el.offsetHeight || 240;
  const top =
    belowRoom < menuHeight + margin && rect.top > menuHeight + margin
      ? rect.top - menuHeight - margin
      : rect.bottom + margin;
  el.style.top = `${Math.max(margin, top)}px`;
  el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
}

function filterItems(items: IWorkItemRefTarget[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 8);
  return items
    .filter((i) => i.code.toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
    .slice(0, 8);
}

/** `#` work-item reference node + suggestion dropdown — the mention node's twin
 *  for cross-linking work items (GIN-362). Emits the `<work-item-ref>` element
 *  the backend renders and parses (content/html.py, content/html_import.py). */
export const WorkItemRefExtension = Mention.extend({
  name: "workItemRef",

  addStorage(): IWorkItemRefStore {
    return { items: [], resolveHref: undefined };
  },

  addOptions() {
    const parent = this.parent?.() as MentionOptions;
    // Ensure even the bare extension (e.g. in tests, without createWorkItemRefExtension)
    // has a suggestion plugin key distinct from the mention node's.
    return {
      ...parent,
      suggestion: { ...parent.suggestion, pluginKey: WORK_ITEM_REF_PLUGIN_KEY },
    };
  },

  // Deliberately does NOT spread `this.parent?.()`: the base Mention node declares
  // `id`/`label`, which the backend registry would drop — leaving a ref with no id.
  addAttributes() {
    return {
      [EWorkItemRefAttribute.WorkItemId]: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute(EWorkItemRefHtmlAttribute.WorkItemId),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EWorkItemRefAttribute.WorkItemId]
            ? { [EWorkItemRefHtmlAttribute.WorkItemId]: attrs[EWorkItemRefAttribute.WorkItemId] }
            : {},
      },
      [EWorkItemRefAttribute.Code]: {
        default: "",
        // Legacy/derived markup carries the code both as an attribute and as the
        // element text; fall back to the text (minus a leading `#`) when needed.
        parseHTML: (el: HTMLElement) =>
          el.getAttribute(EWorkItemRefHtmlAttribute.Code) ??
          el.textContent?.replace(/^#/, "") ??
          "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EWorkItemRefAttribute.Code]
            ? { [EWorkItemRefHtmlAttribute.Code]: attrs[EWorkItemRefAttribute.Code] }
            : {},
      },
      // Non-identity display fallback; not carried in HTML (matches the backend),
      // so it round-trips only through JSON.
      [EWorkItemRefAttribute.Title]: {
        default: "",
        parseHTML: () => "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "work-item-ref" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const code = (node.attrs[EWorkItemRefAttribute.Code] as string) || "";
    return ["work-item-ref", mergeAttributes(HTMLAttributes), code];
  },

  renderText({ node }) {
    const id = node.attrs[EWorkItemRefAttribute.WorkItemId] as string | null;
    const resolved =
      id && this.editor ? store(this.editor).items.find((w) => w.id === id)?.code : null;
    return resolved ?? (node.attrs[EWorkItemRefAttribute.Code] as string) ?? id ?? "work-item";
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkItemRefChip);
  },
});

export function createWorkItemRefExtension() {
  return WorkItemRefExtension.configure({
    suggestion: {
      pluginKey: WORK_ITEM_REF_PLUGIN_KEY,
      // ponytail: `#` also opens a markdown heading via StarterKit's input rule,
      // but that only fires on `# ` (hash-space) at line start — typing `#GIN`
      // opens this picker, `# ` still makes a heading. Good enough; revisit if
      // it confuses.
      char: "#",
      items: ({ query, editor }) => filterItems(store(editor).items, query),
      command: ({ editor, range, props }) => {
        const item = props as unknown as IWorkItemRefTarget;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "workItemRef",
              attrs: {
                [EWorkItemRefAttribute.WorkItemId]: item.id,
                // Captured at insert time as the display fallback (ADR 0001 s4.1).
                [EWorkItemRefAttribute.Code]: item.code,
                [EWorkItemRefAttribute.Title]: item.title,
              },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let component: ReactRenderer<WorkItemRefMenuHandle> | null = null;
        let popup: HTMLDivElement | null = null;

        return {
          onStart: (props: SuggestionProps<IWorkItemRefTarget>) => {
            component = new ReactRenderer(WorkItemRefMenu, {
              props: {
                items: props.items,
                command: (item: IWorkItemRefTarget) => props.command(item),
              },
              editor: props.editor,
            });
            popup = document.createElement("div");
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            positionPopup(popup, props.clientRect);
          },
          onUpdate: (props: SuggestionProps<IWorkItemRefTarget>) => {
            component?.updateProps({
              items: props.items,
              command: (item: IWorkItemRefTarget) => props.command(item),
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
    },
  });
}

export type { IWorkItemRefTarget } from "./types";
