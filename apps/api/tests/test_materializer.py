from gigsnano_api.models import (
    Artifact,
    EArtifactStatus,
    EStoryStatus,
    EStoryType,
    Project,
    Story,
    Workspace,
)
from gigsnano_api.sync.materializer import materialize, slugify, split_ux


def test_slugify():
    assert slugify("Sign-up Flow (MFA)!") == "sign-up-flow-mfa"
    assert slugify("  --Weird   spacing--  ") == "weird-spacing"


def test_split_ux():
    md = "# DESIGN\nTokens...\n\n## EXPERIENCE\nFlows..."
    design, experience = split_ux(md)
    assert "Tokens" in design and "EXPERIENCE" not in design
    assert experience.startswith("## EXPERIENCE")

    design_only, experience_stub = split_ux("# DESIGN\nEverything")
    assert "Everything" in design_only
    assert "experience" in experience_stub.lower()


async def seed_project(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    return project


async def test_materialize_full_tree(db_session):
    project = await seed_project(db_session)

    def final(doc_type, title, md, structured=None):
        return Artifact(project_id=project.id, doc_type=doc_type, title=title,
                        content_md=md, structured_json=structured,
                        status=EArtifactStatus.FINAL)

    prd_v2 = final("prd", "PRD", "# PRD v2")
    prd_v2.version = 2  # later version wins over the default version=1 row
    db_session.add_all([
        final("brief", "Brief", "# Brief"),
        final("prd", "PRD", "# PRD v1"),
        prd_v2,
        final("architecture", "Arch", "# Arch"),
        final("ux", "UX", "# DESIGN\nD\n## EXPERIENCE\nE"),
        Artifact(project_id=project.id, doc_type="research", title="Draft",
                 content_md="# Draft", status=EArtifactStatus.DRAFT),  # drafts excluded
    ])

    epic_story = Story(
        project_id=project.id,
        title="Onboarding",
        description="Get users in",
        sort_order=0,
        type=EStoryType.EPIC,
    )
    db_session.add(epic_story)
    await db_session.flush()
    story = Story(
        project_id=project.id,
        parent_id=epic_story.id,
        title="Sign-up Flow",
        sort_order=1,
        status=EStoryStatus.DONE,
        type=EStoryType.STORY,
    )
    db_session.add(story)
    await db_session.flush()

    plan = {"sprints": [{"name": "Sprint 1", "story_ids": [story.id]}]}
    db_session.add(final("sprint_plan", "Plan", "# Plan", structured=plan))
    await db_session.flush()

    files = await materialize(db_session, project)
    assert set(files) == {
        "docs/brief.md", "docs/prd.md", "docs/architecture.md",
        "docs/design.md", "docs/experience.md",
        "docs/epics/epic-1-onboarding.md", "docs/sprint-status.yaml",
    }
    assert files["docs/prd.md"] == "# PRD v2"
    assert "Sign-up Flow" in files["docs/epics/epic-1-onboarding.md"]
    assert "Sprint 1" in files["docs/sprint-status.yaml"]
    assert "done" in files["docs/sprint-status.yaml"]
    assert "research" not in " ".join(files)  # draft never materializes
