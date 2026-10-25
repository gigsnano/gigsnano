from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.auth.models import User
from gigsnano_api.features.gigs_ai.prompt import (
    DIAGRAM_INSTRUCTION,
    ERD_INSTRUCTION,
    GIGS_MODEL_MAP,
    GIGS_SYSTEM_PROMPT,
    METRICS_INSTRUCTION,
    build_gigs_system,
    gather_gigs_context,
)
from gigsnano_api.models import (
    EStoryPriority,
    EStoryStatus,
    EStoryType,
    Project,
    Story,
    Workspace,
)


async def _seed(db_session):
    ws = Workspace(slug="acme", name="Acme Labs")
    db_session.add(ws)
    await db_session.flush()
    project = Project(
        workspace_id=ws.id,
        name="Nano App",
        identifier="NANO",
        cover_image_url="https://img.test/c.jpg",
        overview="<h1>Vision</h1><p>Track experiments.</p>",
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add_all(
        [
            Story(project_id=project.id, title="A", status=EStoryStatus.TODO, sort_order=0),
            Story(project_id=project.id, title="B", status=EStoryStatus.DONE, sort_order=1),
        ]
    )
    await db_session.commit()
    return ws, project


async def test_context_workspace_only(db_session):
    ws = Workspace(slug="acme", name="Acme Labs")
    db_session.add(ws)
    await db_session.commit()
    ctx = await gather_gigs_context(db_session, ws, None)
    assert "Acme Labs" in ctx
    assert "Project:" not in ctx


async def test_context_with_project_summary(db_session):
    ws, project = await _seed(db_session)
    ctx = await gather_gigs_context(db_session, ws, project.id)
    assert "Nano App" in ctx
    assert "Track experiments." in ctx  # HTML stripped
    assert "<h1>" not in ctx
    assert "todo: 1" in ctx and "done: 1" in ctx


async def test_context_includes_work_item_details(db_session):
    """GIN-83: the context must carry actual work items with their metadata
    (code, title, status, priority, assignee) — not just per-status counts —
    so GigsAI can reference specific items instead of guessing."""
    ws, project = await _seed(db_session)
    user = User(email="dana@acme.test", display_name="Dana Dev")
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        Story(
            project_id=project.id,
            title="Login flow",
            status=EStoryStatus.IN_PROGRESS,
            priority=EStoryPriority.HIGH,
            type=EStoryType.STORY,
            story_number=7,
            assignee_id=user.id,
            sort_order=2,
        )
    )
    await db_session.commit()

    ctx = await gather_gigs_context(db_session, ws, project.id)

    assert "Work items:" in ctx
    assert "NANO-7 Login flow" in ctx  # human-readable code + title
    assert "in_progress" in ctx
    assert "high" in ctx  # priority
    assert "Dana Dev" in ctx  # assignee resolved to display name
    assert "Unassigned" in ctx  # the seeded stories A/B have no assignee


async def test_context_work_items_capped_and_counted(db_session):
    """The list is bounded so a large backlog can't blow the token budget; when
    truncated it says how many of the total are shown."""
    ws, project = await _seed(db_session)
    for i in range(60):
        db_session.add(
            Story(project_id=project.id, title=f"Item {i}", story_number=100 + i, sort_order=i)
        )
    await db_session.commit()

    ctx = await gather_gigs_context(db_session, ws, project.id)
    lines = [line for line in ctx.splitlines() if line.startswith("- ")]
    assert len(lines) <= 40
    assert "of 62" in ctx  # 60 + the 2 seeded stories


def test_build_system_blocks_and_model_map():
    blocks = build_gigs_system("Workspace: Acme")
    assert blocks[0]["text"] == (
        f"{GIGS_SYSTEM_PROMPT}\n\n{DIAGRAM_INSTRUCTION}\n\n{ERD_INSTRUCTION}\n\n{METRICS_INSTRUCTION}"
        f"\n\n{REPO_CONTEXT_INSTRUCTION}"
    )
    assert blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert blocks[1]["text"] == "Workspace: Acme"
    assert len(build_gigs_system("")) == 1  # no context block when empty
    assert GIGS_MODEL_MAP["opus-4-8"] == "claude-sonnet-5"
    assert not any("opus" in m for m in GIGS_MODEL_MAP.values())
    assert set(GIGS_MODEL_MAP) == {"opus-4-8", "sonnet-5", "haiku-4-5"}


def test_system_prompt_has_story_proposal_convention():
    # GIN-18: the assistant must be instructed to emit a ```gigs:story fenced
    # JSON block when the user asks to create a work item.
    assert "```gigs:story" in GIGS_SYSTEM_PROMPT
    assert '"title"' in GIGS_SYSTEM_PROMPT
    assert '"type"' in GIGS_SYSTEM_PROMPT
    assert '"description"' in GIGS_SYSTEM_PROMPT
