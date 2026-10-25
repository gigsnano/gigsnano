import { mergeAttributes } from "@tiptap/core";
import Mention, { type MentionOptions } from "@tiptap/extension-mention";
import { ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

import { MentionMenu, type MentionMenuHandle } from "./mention-menu";
import type { IMentionMember } from "./types";
import { EMentionAttribute, EMentionHtmlAttribute } from "./types";
import { UserMentionChip } from "./user-mention-chip";

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
  el.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
}

function filterMembers(members: IMentionMember[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice(0, 8);
  return members.filter((m) => m.display_name.toLowerCase().includes(q)).slice(0, 8);
}

export type TMentionExtensionOptions = {
  getMembers: () => IMentionMember[];
  resolveDisplayName?: (userId: string) => string | undefined;
  suggestion?: MentionOptions<IMentionMember>["suggestion"];
  HTMLAttributes?: Record<string, unknown>;
};

/** Plane-style `mention-component` TipTap node + `@` suggestion dropdown. */
export const UserMentionExtension = Mention.extend<TMentionExtensionOptions>({
  name: "mention",

  addOptions() {
    return {
      ...this.parent?.(),
      getMembers: () => [],
      resolveDisplayName: undefined,
    };
  },

  // Deliberately does NOT spread `this.parent?.()`. The base Mention node
  // declares `id`/`label`, which would sit alongside these in the emitted JSON
  // and be dropped by the backend registry — leaving a mention with no id.
  addAttributes() {
    return {
      [EMentionAttribute.EntityId]: {
        default: null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute(EMentionHtmlAttribute.EntityIdentifier) ??
          el.getAttribute(EMentionHtmlAttribute.Id),
        // Both names emitted: `entity_identifier` is what lib/mentions.py reads
        // to raise notifications, `id` is what the pre-existing markup carried.
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EMentionAttribute.EntityId]
            ? {
                [EMentionHtmlAttribute.EntityIdentifier]: attrs[EMentionAttribute.EntityId],
                [EMentionHtmlAttribute.Id]: attrs[EMentionAttribute.EntityId],
              }
            : {},
      },
      [EMentionAttribute.EntityType]: {
        default: "user",
        parseHTML: (el: HTMLElement) =>
          (el.getAttribute(EMentionHtmlAttribute.EntityName) ?? "user_mention").replace(
            /_mention$/,
            "",
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          [EMentionHtmlAttribute.EntityName]: `${attrs[EMentionAttribute.EntityType] ?? "user"}_mention`,
        }),
      },
      [EMentionAttribute.Label]: {
        default: "",
        // Legacy markup carries the label as element text, not an attribute, so
        // fall back to it — those rows predate `data-label` entirely.
        parseHTML: (el: HTMLElement) =>
          el.getAttribute(EMentionHtmlAttribute.Label) ??
          el.textContent?.replace(/^@/, "") ??
          "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EMentionAttribute.Label]
            ? { [EMentionHtmlAttribute.Label]: attrs[EMentionAttribute.Label] }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "mention-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mention-component", mergeAttributes(HTMLAttributes)];
  },

  renderText({ node }) {
    // Resolve live so a renamed user reads correctly; the stored label is the
    // fallback for when the target is gone (ADR 0001 section 4.1).
    const userId = node.attrs[EMentionAttribute.EntityId] as string | null;
    const name = userId ? this.options.resolveDisplayName?.(userId) : null;
    return `@${name ?? node.attrs[EMentionAttribute.Label] ?? userId ?? "user"}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(UserMentionChip);
  },
});

export function createUserMentionExtension(
  getMembers: () => IMentionMember[],
  resolveDisplayName: (userId: string) => string | undefined,
) {
  return UserMentionExtension.configure({
    getMembers,
    resolveDisplayName,
    suggestion: {
      char: "@",
      allowSpaces: true,
      items: ({ query }) => filterMembers(getMembers(), query),
      command: ({ editor, range, props }) => {
        const member = props as unknown as IMentionMember;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: {
                [EMentionAttribute.EntityId]: member.user_id,
                [EMentionAttribute.EntityType]: "user",
                // Captured at insert time as the display fallback, so a deleted
                // or renamed target still reads as something (ADR 0001 s4.1).
                [EMentionAttribute.Label]: member.display_name,
              },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let component: ReactRenderer<MentionMenuHandle> | null = null;
        let popup: HTMLDivElement | null = null;

        return {
          onStart: (props: SuggestionProps<IMentionMember>) => {
            component = new ReactRenderer(MentionMenu, {
              props: {
                items: props.items,
                command: (member: IMentionMember) => props.command(member),
              },
              editor: props.editor,
            });
            popup = document.createElement("div");
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            positionPopup(popup, props.clientRect);
          },
          onUpdate: (props: SuggestionProps<IMentionMember>) => {
            component?.updateProps({
              items: props.items,
              command: (member: IMentionMember) => props.command(member),
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

export type { IMentionMember } from "./types";
