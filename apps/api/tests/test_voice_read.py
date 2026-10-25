"""Read-only voice commands (GIN-495): count/list/search, grounding, follow-ups."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.features.voice import read as READ
from gigsnano_api.models import EMemberStatus, EStoryStatus, EWorkspaceRole, Workspace
from gigsnano_api.shared.context import WorkspaceContext

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
async def acme(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    response = await client.post(
        "/api/workspaces/acme/projects/",
        json={
            "name": "Chess",
            "identifier": "CHS",
            "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        },
    )
    assert response.status_code in (200, 201), response.text
    return client, response.json()["id"]


async def add_story(client, project_id, title, **extra):
    response = await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/",
        json={"title": title, **extra},
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


async def ctx_for(db_session):
    workspace = (
        await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))
    ).scalar_one()
    user = (await db_session.execute(select(User))).scalars().first()
    return WorkspaceContext(
        user=user, workspace=workspace, role=EWorkspaceRole.OWNER, status=EMemberStatus.ACTIVE
    )


# ── Counting and listing ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_count_uses_the_stated_status_semantics(acme, db_session):
    """"How many are pending" has to mean one thing. Sprint-0 seeds stories, so
    the assertion is on the definition, not on a magic number."""
    client, project = acme
    await add_story(client, project, "A pending item")
    ctx = await ctx_for(db_session)

    pending = await READ.run(
        db_session, ctx, READ.Query(project_id=project, statuses=READ.PENDING_STATUSES, limit=50)
    )
    done = await READ.run(
        db_session, ctx, READ.Query(project_id=project, statuses=(EStoryStatus.DONE,), limit=50)
    )
    everything = await READ.run(db_session, ctx, READ.Query(project_id=project, limit=50))

    assert EStoryStatus.DONE not in READ.PENDING_STATUSES
    assert pending.total + done.total == everything.total


@pytest.mark.asyncio
async def test_a_text_search_matches_titles(acme, db_session):
    client, project = acme
    await add_story(client, project, "Mobile login fails after OTP")
    result = await READ.run(
        db_session, await ctx_for(db_session), READ.Query(project_id=project, text="login")
    )
    assert any("login" in i.title.lower() for i in result.items)


@pytest.mark.asyncio
async def test_results_carry_a_code_and_a_link(acme, db_session):
    client, project = acme
    await add_story(client, project, "Linkable")
    result = await READ.run(
        db_session, await ctx_for(db_session), READ.Query(project_id=project, text="Linkable")
    )
    item = result.items[0]
    assert item.code.startswith("CHS-")
    assert item.url.startswith("/acme/projects/")


@pytest.mark.asyncio
async def test_a_user_who_can_see_no_projects_gets_nothing_not_everything(acme, db_session):
    """The dangerous default: an empty allow-list becoming an unfiltered query.

    Needs a workspace member who joined no project — the creator is implicitly a
    project member, so testing with her would prove nothing.
    """
    from gigsnano_api.models import WorkspaceMember

    client, project = acme
    owner_ctx = await ctx_for(db_session)

    outsider = User(display_name="Mallory", email="mal@example.test", password_hash="x")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=owner_ctx.workspace.id,
            user_id=outsider.id,
            role=EWorkspaceRole.MEMBER,
            status=EMemberStatus.ACTIVE,
        )
    )
    await db_session.commit()

    ctx = WorkspaceContext(
        user=outsider,
        workspace=owner_ctx.workspace,
        role=EWorkspaceRole.MEMBER,
        status=EMemberStatus.ACTIVE,
    )
    assert (await READ.run(db_session, owner_ctx, READ.Query(limit=50))).total > 0

    result = await READ.run(db_session, ctx, READ.Query(limit=50))
    assert result.total == 0
    assert result.items == []


# ── The spoken answer must not outrun the data ───────────────────────────────


def result_of(total, returned, **q):
    query = READ.Query(limit=returned or 5, **q)
    items = [
        READ.Item(id=f"s-{n}", code=f"CHS-{n}", title=f"Item {n}", status="todo", url="/x")
        for n in range(returned)
    ]
    return READ.ReadResult(query=query, items=items, total=total)


def test_a_truncated_page_is_announced_as_a_page():
    """Saying "five" over five-of-forty is a lie the user acts on."""
    spoken = READ.narrate(result_of(total=40, returned=5))
    assert "40" in spoken
    assert "first 5" in spoken


def test_a_complete_result_does_not_claim_truncation():
    spoken = READ.narrate(result_of(total=3, returned=3))
    assert "next" not in spoken


def test_spoken_count_is_the_total_not_the_page_size():
    assert "40 items" in READ.narrate(result_of(total=40, returned=5))


def test_a_failed_query_says_so_instead_of_answering_zero():
    """"Nothing is assigned to you" and "I couldn't check" lead to opposite
    decisions, so they must never share a sentence."""
    failed = READ.ReadResult(query=READ.Query(), available=False, unavailable_reason="OperationalError")
    spoken = READ.narrate(failed)
    assert "couldn't check" in spoken
    assert "0" not in spoken


def test_an_empty_result_states_the_filters_it_applied():
    spoken = READ.narrate(result_of(total=0, returned=0, text="login"))
    assert "login" in spoken


def test_active_filters_are_always_speakable():
    query = READ.Query(statuses=READ.PENDING_STATUSES, text="otp", priorities=("high",))
    described = query.describe()
    assert "todo" in described and "otp" in described and "high" in described


# ── Grounded item context (GIN-509) ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_children_come_from_real_parent_links_not_code_arithmetic(acme, db_session):
    """GIN-491's own children are 503/504/507, not 492/493/494. A "next N codes"
    shortcut would confidently narrate three unrelated tickets."""
    client, project = acme
    epic = await add_story(client, project, "Epic")
    await add_story(client, project, "Unrelated neighbour")
    child = await add_story(client, project, "Real child", parent_id=epic["id"])

    context = await READ.fetch_context(db_session, await ctx_for(db_session), epic["id"])
    assert [i.id for i in context.children.items] == [child["id"]]
    assert "Unrelated" not in str(context.children.items)


@pytest.mark.asyncio
async def test_context_reports_the_parent_it_actually_has(acme, db_session):
    client, project = acme
    epic = await add_story(client, project, "Epic")
    child = await add_story(client, project, "Child", parent_id=epic["id"])

    context = await READ.fetch_context(db_session, await ctx_for(db_session), child["id"])
    assert context.parent is not None
    assert context.parent.id == epic["id"]
    assert "sits under" in READ.narrate_context(context)


@pytest.mark.asyncio
async def test_an_item_with_no_parent_is_not_narrated_as_having_one(acme, db_session):
    client, project = acme
    orphan = await add_story(client, project, "Standalone")
    context = await READ.fetch_context(db_session, await ctx_for(db_session), orphan["id"])
    assert context.parent is None
    assert "sits under" not in READ.narrate_context(context)


@pytest.mark.asyncio
async def test_an_inaccessible_item_is_indistinguishable_from_a_missing_one(acme, db_session):
    context = await READ.fetch_context(db_session, await ctx_for(db_session), "does-not-exist")
    assert context.available is False
    assert "couldn't find" in READ.narrate_context(context)


def test_a_section_that_failed_does_not_render_like_an_empty_one():
    failed = READ.ItemContext(
        item=READ.Item(id="s", code="CHS-1", title="T", status="todo", url="/x"),
        children=READ.Section(available=False),
    )
    empty = READ.ItemContext(
        item=READ.Item(id="s", code="CHS-1", title="T", status="todo", url="/x"),
        children=READ.Section(note="no children"),
    )
    assert "couldn't load" in READ.narrate_context(failed)
    assert "couldn't load" not in READ.narrate_context(empty)


# ── Follow-ups ───────────────────────────────────────────────────────────────


def test_a_follow_up_narrows_the_same_query():
    context = READ.remember(result_of(total=9, returned=5, project_id="p-1"))
    narrowed = READ.follow_up(context, types=("bug",), now=NOW)
    assert narrowed.project_id == "p-1"
    assert narrowed.types == ("bug",)


def test_narrowing_restarts_from_the_top():
    """"Only bugs" means from the beginning, not from wherever the last page
    happened to stop."""
    context = READ.ResultContext(query=READ.Query(offset=10), at=NOW)
    assert READ.follow_up(context, types=("bug",), now=NOW).offset == 0


def test_next_page_advances_the_cursor():
    context = READ.ResultContext(query=READ.Query(limit=5, offset=0), at=NOW)
    assert READ.next_page(context, now=NOW).offset == 5


def test_ordinal_resolves_against_what_was_announced():
    context = READ.remember(result_of(total=9, returned=3))
    assert context.ordinal(2) == "s-1"
    assert context.ordinal(99) is None


def test_a_stale_result_set_is_rejected_not_answered_from():
    context = READ.ResultContext(query=READ.Query(), at=NOW)
    later = NOW + timedelta(seconds=READ.FRESHNESS_SECONDS + 1)
    with pytest.raises(READ.StaleResultSet):
        READ.follow_up(context, types=("bug",), now=later)
    with pytest.raises(READ.StaleResultSet):
        READ.next_page(context, now=later)


def test_moving_project_invalidates_the_result_context():
    context = READ.ResultContext(query=READ.Query(project_id="p-1"), at=NOW)
    assert READ.project_changed(context, "p-2") is True
    assert READ.project_changed(context, "p-1") is False
    assert READ.project_changed(context, None) is False


def test_the_remembered_context_holds_ids_not_rows():
    """A cached row could answer a follow-up from data the user has since lost
    access to. Only the query definition and the announced order are kept."""
    context = READ.remember(result_of(total=9, returned=2))
    assert context.announced == ["s-0", "s-1"]
    assert not hasattr(context, "items")
