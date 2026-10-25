"""The GigsAI system prompt must carry the feature-intake behavior: offer first,
then create the epic + nested stories via the create_work_item tool. This guards
the *instruction* against accidental removal — the model's judgment (does it
actually detect a feature and drive the flow) is verified live, not here."""

from gigsnano_api.features.gigs_ai.prompt import GIGS_SYSTEM_PROMPT


def test_prompt_offers_before_creating_a_feature():
    lower = GIGS_SYSTEM_PROMPT.lower()
    # Offer-first CONTRACT (not exact prose): the assistant asks about shaping the
    # idea into an epic + stories, and the line ends in "?" — the cue the
    # choice-widget parser needs to render the Yes/No as buttons.
    assert "epic and stories?" in lower


def test_prompt_drives_tool_based_nested_creation():
    lower = GIGS_SYSTEM_PROMPT.lower()
    # Feature flow creates via the tool with nesting — not a flat gigs:story.
    assert "create_work_item" in GIGS_SYSTEM_PROMPT
    assert "parent" in lower
    assert "epic first" in lower


def test_prompt_keeps_single_item_gigs_story_path():
    # The one-off single-item path is still present and unchanged in intent.
    assert "```gigs:story" in GIGS_SYSTEM_PROMPT
    assert "single work item" in GIGS_SYSTEM_PROMPT.lower()


def test_prompt_proposes_stories_as_bullets_so_choice_renders_as_buttons():
    # The Create/Adjust choice must be the only numbered list in the proposal;
    # numbered stories would shadow it in the choice-widget parser (parseBmadResponse
    # renders only the longest numbered run, and the stories run has no "?" cue).
    assert "not a numbered list" in GIGS_SYSTEM_PROMPT.lower()
