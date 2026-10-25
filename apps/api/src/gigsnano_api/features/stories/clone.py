"""Work-item duplication service (GIN-355/357/359/360).

Pure clone logic — field-copy policy, relative date shifting, and two-pass
hierarchy duplication with internal-relation remapping — kept out of the router
so it stays reusable by templates, bulk duplication and playbooks (GIN-357
technical note). The endpoint injects `insert_fn` (the shared `_insert_story`)
so this module never imports the router.
"""
from __future__ import annotations

from collections import deque
from datetime import date
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.stories.labels import load_story_label_ids
from gigsnano_api.features.stories.schemas import CloneCopyOptions, CloneRootOverrides
from gigsnano_api.models import (
    EStoryStatus,
    Project,
    Story,
    StoryCustomFieldValue,
    StoryRelation,
)

# Fields the policy always resets on a copy (GIN-357). Reported so the UI can show
# "what will be reset" without hard-coding the list client-side.
RESET_FIELDS = [
    "status",
    "assignee",
    "cycle",
    "start_date",
    "target_date",
    "completion",
    "created_at",
    "updated_at",
    "creator",
    "activity_history",
    "comments",
    "attachments",
    "external_relations",
    "ai_execution_state",
]

InsertFn = Callable[[AsyncSession, Project, object, dict], Awaitable[Story]]


def _base_fields(
    source: Story,
    options: CloneCopyOptions,
    dest: Project,
    warnings: list[str],
    source_label_ids: list[str],
) -> dict:
    """Field-copy policy for one source item → a create payload (no dates, no
    overrides). Project-scoped FKs (label/estimate/module/cycle) copy only within
    the same project; cross-project copies drop them with a warning."""
    same_project = dest.id == source.project_id
    fields: dict = {
        "title": source.title,
        "type": source.type,
        "status": EStoryStatus.TODO,  # reset to the destination's default open status
    }
    if options.description:
        fields["description"] = source.description
        fields["content_format"] = "html"  # the stored description is rendered HTML
    if options.priority:
        fields["priority"] = source.priority
    if options.labels and source_label_ids:
        if same_project:
            fields["label_ids"] = list(source_label_ids)
        else:
            warnings.append("labels not copied: they belong to the source project")
    if options.estimate:
        if source.estimate_id:
            if same_project:
                fields["estimate_id"] = source.estimate_id
            else:
                warnings.append("estimate scale not copied: it belongs to the source project")
        if source.estimate_points is not None:
            fields["estimate_points"] = source.estimate_points
        # Per-method inputs travel with the estimate copy flag (GIN-331); both are
        # project-agnostic raw values, so they copy across projects unlike the scale.
        if source.size is not None:
            fields["size"] = source.size
        if source.duration_minutes is not None:
            fields["duration_minutes"] = source.duration_minutes
    if options.module and source.module_id:
        if same_project:
            fields["module_id"] = source.module_id
        else:
            warnings.append("module not copied: it belongs to the source project")
    if options.assignee and source.assignee_id:
        fields["assignee_id"] = source.assignee_id
    if options.cycle and source.cycle_id and same_project:
        fields["cycle_id"] = source.cycle_id
    return fields


def _root_delta(root: Story, options: CloneCopyOptions, warnings: list[str]):
    """The offset applied to every shifted date (GIN-359). None ⇒ shifting is off
    or has no valid reference, in which case dates fall back to exact copies."""
    if not options.dates or options.date_mode != "shift":
        return None
    if options.new_start_date is None or root.start_date is None:
        warnings.append(
            "date shift skipped: missing new start date or source start date; kept exact dates"
        )
        return None
    return options.new_start_date - root.start_date


def _policy_dates(source: Story, options: CloneCopyOptions, delta, warnings: list[str]):
    """(start, target) for a copied item. Preserves duration and, in shift mode,
    each descendant's offset relative to the copied root (same delta)."""
    if not options.dates:
        return None, None
    if delta is None:  # exact mode, or shift with no valid reference
        return source.start_date, source.target_date
    start = source.start_date + delta if source.start_date else None
    target = source.target_date + delta if source.target_date else None
    if start and target and target < start:  # shifting never inverts, but be safe
        warnings.append("date shift produced target before start; dropped dates for one item")
        return None, None
    if (start and start < date.today()) or (target and target < date.today()):
        warnings.append("some shifted dates are in the past")
    return start, target


def _apply_overrides(fields: dict, overrides: CloneRootOverrides) -> None:
    """Edited root values win over the copy policy."""
    edited = overrides.model_dump(exclude_unset=True, exclude={"custom_fields"})
    for key, value in edited.items():
        fields[key] = value


async def collect_subtree(
    db: AsyncSession, root: Story, options: CloneCopyOptions
) -> tuple[list[Story], bool]:
    """The source items to copy, root first, parents before children (BFS). Honors
    child_depth and max_items, and guards against cyclic parent links. Returns
    (nodes, truncated)."""
    if not options.include_children:
        return [root], False
    nodes = [root]
    visited = {root.id}
    frontier: deque[tuple[Story, int]] = deque([(root, 0)])
    truncated = False
    while frontier:
        node, depth = frontier.popleft()
        if options.child_depth is not None and depth >= options.child_depth:
            continue
        children = (
            (
                await db.execute(
                    select(Story)
                    .where(Story.parent_id == node.id, Story.project_id == root.project_id)
                    .order_by(Story.sort_order)
                )
            )
            .scalars()
            .all()
        )
        for child in children:
            if child.id in visited:  # cyclic/corrupt parent link — skip safely
                continue
            if len(nodes) >= options.max_items:
                return nodes, True
            visited.add(child.id)
            nodes.append(child)
            frontier.append((child, depth + 1))
    return nodes, truncated


async def _copy_custom_values(db: AsyncSession, src_id: str, dest_id: str) -> None:
    rows = (
        (
            await db.execute(
                select(StoryCustomFieldValue).where(StoryCustomFieldValue.story_id == src_id)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        db.add(
            StoryCustomFieldValue(story_id=dest_id, field_id=row.field_id, value=row.value)
        )


async def _remap_relations(
    db: AsyncSession,
    nodes: list[Story],
    id_map: dict[str, Story],
    options: CloneCopyOptions,
    warnings: list[str],
) -> None:
    """Two-pass step 2 (GIN-360): re-point relations between copied items to the
    new items. Internal edges (both endpoints copied) are always remapped; edges
    to items outside the copy are recreated only when the user opts in."""
    node_ids = {n.id for n in nodes}
    seen: set[tuple[str, str, str]] = set()
    rows = (
        (
            await db.execute(select(StoryRelation).where(StoryRelation.story_id.in_(node_ids)))
        )
        .scalars()
        .all()
    )
    for rel in rows:
        new_from = id_map[rel.story_id].id
        if rel.related_story_id in node_ids:
            new_to = id_map[rel.related_story_id].id  # internal — remap to the copy
        elif options.relations:
            new_to = rel.related_story_id  # external — preserve original target
        else:
            continue
        key = (new_from, new_to, rel.relation_type.value)
        if key in seen or new_from == new_to:
            continue
        seen.add(key)
        db.add(
            StoryRelation(
                story_id=new_from, related_story_id=new_to, relation_type=rel.relation_type
            )
        )


class InvalidClone(Exception):
    """Raised for a clone that can't proceed (e.g. an inverted override date range)."""


async def clone_subtree(
    db: AsyncSession,
    root: Story,
    dest: Project,
    actor,
    options: CloneCopyOptions,
    overrides: CloneRootOverrides,
    insert_fn: InsertFn,
) -> dict:
    """Duplicate `root` (and, if requested, its descendants) into `dest`, applying
    the copy policy, date shifting and relation remapping in one transaction. The
    caller owns the commit. Returns a summary dict for CloneResultOut."""
    warnings: list[str] = []
    nodes, truncated = await collect_subtree(db, root, options)
    if truncated:
        warnings.append(f"copy truncated at max_items={options.max_items}; some descendants omitted")

    delta = _root_delta(root, options, warnings)
    # One query for the whole subtree's labels rather than one per copied item.
    labels_by_story = await load_story_label_ids(db, [n.id for n in nodes])
    id_map: dict[str, Story] = {}
    created: list[Story] = []

    for source in nodes:
        is_root = source.id == root.id
        fields = _base_fields(
            source, options, dest, warnings, labels_by_story.get(source.id, [])
        )
        start, target = _policy_dates(source, options, delta, warnings)
        if start is not None:
            fields["start_date"] = start
        if target is not None:
            fields["target_date"] = target

        if is_root:
            # The copied root keeps its parent only within the same project; a
            # copied child re-points to its NEW parent, never the original.
            if options.parent and source.parent_id and dest.id == source.project_id:
                fields["parent_id"] = source.parent_id
            _apply_overrides(fields, overrides)
        else:
            fields["parent_id"] = id_map[source.parent_id].id

        if fields.get("start_date") and fields.get("target_date"):
            if fields["target_date"] < fields["start_date"]:
                raise InvalidClone("target_date must not be before start_date")

        new_story = await insert_fn(db, dest, actor, fields)
        new_story.cloned_from_id = source.id
        id_map[source.id] = new_story
        created.append(new_story)

        if options.custom_fields and dest.id == source.project_id:
            await _copy_custom_values(db, source.id, new_story.id)
        elif options.custom_fields and dest.id != source.project_id:
            warnings.append("custom fields not copied across projects")

    if len(nodes) > 1:
        await _remap_relations(db, nodes, id_map, options, warnings)
    elif options.relations:
        # Single-item copy with external relations selected: recreate the source's
        # outgoing edges from the new item to the same targets.
        await _remap_relations(db, nodes, id_map, options, warnings)

    root_copy = id_map[root.id]
    copied = [k for k in ("description", "priority", "labels", "estimate", "module", "custom_fields")
              if getattr(options, k)]
    return {
        "source_id": root.id,
        "root": root_copy,
        "created": created,
        "copied_fields": copied,
        "reset_fields": RESET_FIELDS,
        "warnings": warnings,
    }
