/**
 * Mention node attributes.
 *
 * Two vocabularies, deliberately:
 *
 * - **JSON** (`entityId` / `entityType` / `label`) is the canonical document
 *   shape from ADR 0001. The backend's node registry validates against exactly
 *   these names and drops anything undeclared, so a mention emitting the old
 *   `entity_identifier` in its JSON would lose its identity the moment the
 *   editor started saving JSON.
 * - **HTML** (`entity_identifier` / `entity_name` / `id`) is the wire format
 *   already sitting in every legacy column and parsed by the backend's
 *   `lib/mentions.py` to raise notifications. It cannot change without breaking
 *   stored content.
 *
 * The node maps between them per attribute, so JSON is canonical while the HTML
 * it renders and parses stays byte-compatible with what shipped before.
 */

/** Canonical JSON attribute names (ADR 0001 node registry). */
export enum EMentionAttribute {
  EntityId = "entityId",
  EntityType = "entityType",
  Label = "label",
}

/** Legacy HTML attribute names on the `mention-component` element. */
export enum EMentionHtmlAttribute {
  Id = "id",
  EntityIdentifier = "entity_identifier",
  EntityName = "entity_name",
  Label = "data-label",
}

export type TMentionEntityType = "user" | "team";

export interface IUserMentionAttrs {
  entityId: string;
  entityType: TMentionEntityType;
  label?: string;
}

export interface IMentionMember {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
}
