"""Pure helpers for work-item subtree coverage."""

from gigsnano_api.models import Story


def story_ids_in_subtree(root_story_id: str, stories: list[Story]) -> set[str]:
    """Return root story id plus all descendants linked via parent_id."""
    by_parent: dict[str | None, list[Story]] = {}
    for s in stories:
        by_parent.setdefault(s.parent_id, []).append(s)

    covered: set[str] = {root_story_id}
    stack = [root_story_id]
    while stack:
        parent_id = stack.pop()
        for child in by_parent.get(parent_id, []):
            if child.id not in covered:
                covered.add(child.id)
                stack.append(child.id)
    return covered


def story_in_subtree(story_id: str, root_story_id: str, stories: list[Story]) -> bool:
    return story_id in story_ids_in_subtree(root_story_id, stories)


def story_in_cycle(story: Story, root_cycle_id: str) -> bool:
    return story.cycle_id == root_cycle_id
