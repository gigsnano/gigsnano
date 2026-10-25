import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from gigsnano_api.admin.router import router as admin_router
from gigsnano_api.agent_delegation.router import router as agent_delegation_router
from gigsnano_api.auth.mobile_router import router as auth_mobile_router
from gigsnano_api.auth.router import router as auth_router
from gigsnano_api.billing.ai_usage import router as ai_usage_router
from gigsnano_api.billing.entitlements_router import router as entitlements_router
from gigsnano_api.billing.router import router as billing_router
from gigsnano_api.bmad.router import router as bmad_router
from gigsnano_api.content.schema import ContentError
from gigsnano_api.core.config import deployment_warnings, settings
from gigsnano_api.core.db import async_session
from gigsnano_api.core.rate_limit import limiter, rate_limit_exceeded_handler
from gigsnano_api.email.router import router as email_router
from gigsnano_api.features.agent_runs.router import router as agent_runs_router
from gigsnano_api.features.agents.router import router as agents_router
from gigsnano_api.features.ai_assistant.router import router as ai_assistant_router
from gigsnano_api.features.analytics.router import router as analytics_router
from gigsnano_api.features.automations.router import router as automations_router
from gigsnano_api.features.autonomy.router import router as autonomy_router
from gigsnano_api.features.blockers.router import router as blockers_router
from gigsnano_api.features.briefing.router import router as briefing_router
from gigsnano_api.features.code_index.router import router as code_index_router
from gigsnano_api.features.content.router import router as content_router
from gigsnano_api.features.context_engine.router import router as context_engine_router
from gigsnano_api.features.control.router import router as control_router
from gigsnano_api.features.cycles.router import router as cycles_router
from gigsnano_api.features.dashboards.public import router as public_dashboards_router
from gigsnano_api.features.dashboards.router import router as dashboards_router
from gigsnano_api.features.digests.router import router as digests_router
from gigsnano_api.features.documents.router import router as documents_router
from gigsnano_api.features.estimation.router import router as estimation_router
from gigsnano_api.features.execution_profiles.router import router as execution_profiles_router
from gigsnano_api.features.experts.router import router as rooms_router
from gigsnano_api.features.exports.router import router as exports_router
from gigsnano_api.features.forecasting.router import router as forecasting_router
from gigsnano_api.features.foundation.router import router as foundation_router
from gigsnano_api.features.gigs_ai.router import router as gigs_ai_router
from gigsnano_api.features.governance.router import router as governance_router
from gigsnano_api.features.images.router import router as images_router
from gigsnano_api.features.importers.router import router as importers_router
from gigsnano_api.features.inbox.router import router as inbox_router
from gigsnano_api.features.intake.router import router as intake_router
from gigsnano_api.features.invitations.router import router as invitations_router
from gigsnano_api.features.journey.router import router as journey_router
from gigsnano_api.features.marketplace_talent.router import router as marketplace_router
from gigsnano_api.features.meetings.router import router as meetings_router
from gigsnano_api.features.members.router import router as members_router
from gigsnano_api.features.meta.router import router as meta_router
from gigsnano_api.features.modules.router import router as modules_router
from gigsnano_api.features.notifications.router import router as notifications_router
from gigsnano_api.features.package_import.router import router as package_import_router
from gigsnano_api.features.pages.router import router as pages_router
from gigsnano_api.features.pm_health.router import router as pm_health_router
from gigsnano_api.features.project_members.router import router as project_members_router
from gigsnano_api.features.project_settings.router import router as project_settings_router
from gigsnano_api.features.projects.router import router as projects_router
from gigsnano_api.features.push.router import router as push_router
from gigsnano_api.features.recovery.router import router as recovery_router
from gigsnano_api.features.reports.router import router as reports_router
from gigsnano_api.features.roadmap.router import router as roadmap_router
from gigsnano_api.features.search.router import router as search_router
from gigsnano_api.features.skill_events.router import router as skill_events_router
from gigsnano_api.features.skills.router import router as skills_router
from gigsnano_api.features.slack.router import router as slack_router
from gigsnano_api.features.solutions.router import router as solutions_router
from gigsnano_api.features.stickies.router import router as stickies_router
from gigsnano_api.features.stories.bulk import router as stories_bulk_router
from gigsnano_api.features.stories.readiness_router import router as stories_readiness_router
from gigsnano_api.features.stories.router import router as stories_router
from gigsnano_api.features.story_detail.router import router as story_detail_router
from gigsnano_api.features.story_drafts.router import router as story_drafts_router
from gigsnano_api.features.system.router import router as system_router
from gigsnano_api.features.teamspaces.router import router as teamspaces_router
from gigsnano_api.features.templates.router import router as templates_router
from gigsnano_api.features.time_tracking.router import router as time_tracking_router
from gigsnano_api.features.tokens.router import router as tokens_router
from gigsnano_api.features.users.router import router as users_router
from gigsnano_api.features.views.router import router as views_router
from gigsnano_api.features.voice.router import router as voice_router
from gigsnano_api.features.work_item_io.router import router as work_item_io_router
from gigsnano_api.features.workflows.router import router as workflows_router
from gigsnano_api.features.workspaces.router import router as workspaces_router
from gigsnano_api.marketplace.router import router as marketplace_flow_router
from gigsnano_api.sync.router import router as sync_router
from gigsnano_api.webhooks.router import router as webhooks_router
from gigsnano_api.workspace.files_router import router as workspace_files_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from gigsnano_api.admin.seed import seed_staff
    from gigsnano_api.features.agent_runs.live import reap_interrupted_runs
    from gigsnano_api.features.skills.seed import seed_skills
    from gigsnano_api.mcp_server.server import mcp_session_lifespan
    from gigsnano_api.workspace.code_index import reap_interrupted_indexes

    async with async_session() as session:
        await seed_staff(session)
        await seed_skills(session)  # built-in cross-agent skill catalogue (GIN-291)
        await reap_interrupted_indexes(session)
        await reap_interrupted_runs(session)

    import asyncio

    scheduler_task = None
    if settings.digests_enabled:
        from gigsnano_api.features.digests.scheduler import digest_scheduler

        scheduler_task = asyncio.create_task(
            digest_scheduler(
                getattr(app.state, "email_provider", None),
                getattr(app.state, "llm_provider", None),
            )
        )
    push_task = None
    if settings.push_enabled:
        from gigsnano_api.features.push.worker import push_worker

        push_task = asyncio.create_task(push_worker(app.state.push_sender))
    recurrence_task = None
    if settings.recurrence_enabled:
        from gigsnano_api.features.automations.scheduler import recurrence_scheduler

        recurrence_task = asyncio.create_task(recurrence_scheduler())
    forecast_task = None
    if settings.forecast_recalc_enabled:
        from gigsnano_api.features.forecasting.scheduler import forecast_scheduler

        forecast_task = asyncio.create_task(forecast_scheduler())
    meetings_task = None
    meeting_provider = getattr(app.state, "meeting_provider", None)
    if settings.meetings_poll_enabled and meeting_provider is not None:
        from gigsnano_api.features.meetings.sync import meetings_sync_loop

        meetings_task = asyncio.create_task(
            meetings_sync_loop(meeting_provider, getattr(app.state, "llm_provider", None))
        )
    elif meeting_provider is not None:
        logging.getLogger("gigsnano.meetings").warning(
            "meeting provider is configured but meetings_poll_enabled is false — "
            "meetings will never progress past their initial state"
        )
    from gigsnano_api.features.solutions.registry import validate_builtin_registry

    problems = validate_builtin_registry()
    if problems:
        raise RuntimeError("Invalid solution registry: " + "; ".join(problems))

    try:
        async with mcp_session_lifespan():
            yield
    finally:
        for task in (scheduler_task, recurrence_task, forecast_task, meetings_task, push_task):
            if task is not None:
                task.cancel()


def create_app() -> FastAPI:
    app = FastAPI(title="GigsNano API", lifespan=lifespan)
    for warning in deployment_warnings(settings):
        logging.getLogger("gigsnano.config").warning(warning)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # Bad content — an unknown content_format, unparseable canonical JSON — is a
    # client error with an actionable message, not a 500 (GIN-300). Registered
    # once here so every content-bearing route gets it without repeating a
    # try/except at each call site.
    @app.exception_handler(ContentError)
    async def _content_error(_request: Request, exc: ContentError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc), "path": exc.path},
        )

    # The Next.js frontend sends credentialed requests (httpOnly auth cookies).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # `/health` and `/healthz` both answer — Azure's App Service health probe
    # hits `/health` (GIN-77: it was 404-ing in live), k8s-style checks use `/healthz`.
    @app.get("/health")
    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    from gigsnano_api.mcp_server.oauth_router import grants_router
    from gigsnano_api.mcp_server.oauth_router import router as oauth_router

    app.include_router(oauth_router)
    app.include_router(grants_router, prefix="/api")

    app.include_router(auth_router, prefix="/api")
    app.include_router(auth_mobile_router, prefix="/api")
    app.include_router(tokens_router, prefix="/api")
    app.include_router(workspaces_router, prefix="/api")
    app.include_router(members_router, prefix="/api")
    app.include_router(invitations_router, prefix="/api")
    app.include_router(projects_router, prefix="/api")
    app.include_router(code_index_router, prefix="/api")
    app.include_router(context_engine_router, prefix="/api")
    app.include_router(project_members_router, prefix="/api")
    app.include_router(foundation_router, prefix="/api")
    app.include_router(skills_router, prefix="/api")
    app.include_router(skill_events_router, prefix="/api")
    app.include_router(control_router, prefix="/api")
    app.include_router(cycles_router, prefix="/api")
    app.include_router(journey_router, prefix="/api")
    app.include_router(modules_router, prefix="/api")
    app.include_router(stories_router, prefix="/api")
    app.include_router(stories_bulk_router, prefix="/api")
    app.include_router(stories_readiness_router, prefix="/api")
    app.include_router(story_detail_router, prefix="/api")
    app.include_router(execution_profiles_router, prefix="/api")
    app.include_router(voice_router, prefix="/api")
    app.include_router(time_tracking_router, prefix="/api")
    app.include_router(story_drafts_router, prefix="/api")
    app.include_router(bmad_router, prefix="/api")
    app.include_router(documents_router, prefix="/api")
    app.include_router(images_router, prefix="/api")
    app.include_router(exports_router, prefix="/api")
    app.include_router(content_router, prefix="/api")
    app.include_router(importers_router, prefix="/api")
    app.include_router(package_import_router, prefix="/api")
    app.include_router(work_item_io_router, prefix="/api")
    app.include_router(project_settings_router, prefix="/api")
    app.include_router(system_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(sync_router, prefix="/api")
    app.include_router(workspace_files_router, prefix="/api")
    app.include_router(gigs_ai_router, prefix="/api")
    app.include_router(rooms_router, prefix="/api")
    app.include_router(ai_assistant_router, prefix="/api")
    app.include_router(views_router, prefix="/api")
    app.include_router(search_router, prefix="/api")
    app.include_router(intake_router, prefix="/api")
    app.include_router(workflows_router, prefix="/api")
    app.include_router(automations_router, prefix="/api")
    app.include_router(autonomy_router, prefix="/api")
    app.include_router(blockers_router, prefix="/api")
    app.include_router(governance_router, prefix="/api")
    app.include_router(recovery_router, prefix="/api")
    app.include_router(templates_router, prefix="/api")
    app.include_router(entitlements_router, prefix="/api")
    app.include_router(roadmap_router, prefix="/api")
    app.include_router(teamspaces_router, prefix="/api")
    app.include_router(pages_router, prefix="/api")
    app.include_router(stickies_router, prefix="/api")
    app.include_router(dashboards_router, prefix="/api")
    # Unauthenticated by design (GIN-489): the share token is the credential.
    app.include_router(public_dashboards_router, prefix="/api")
    app.include_router(digests_router, prefix="/api")
    app.include_router(notifications_router, prefix="/api")
    app.include_router(analytics_router, prefix="/api")
    app.include_router(forecasting_router, prefix="/api")
    app.include_router(estimation_router, prefix="/api")
    app.include_router(pm_health_router, prefix="/api")
    app.include_router(agents_router, prefix="/api")
    app.include_router(agent_runs_router, prefix="/api")
    app.include_router(marketplace_router, prefix="/api")
    app.include_router(marketplace_flow_router, prefix="/api")
    app.include_router(webhooks_router, prefix="/api")
    app.include_router(slack_router, prefix="/api")
    app.include_router(solutions_router, prefix="/api")
    app.include_router(admin_router, prefix="/api")
    app.include_router(billing_router, prefix="/api")
    app.include_router(ai_usage_router, prefix="/api")
    app.include_router(email_router, prefix="/api")
    app.include_router(agent_delegation_router, prefix="/api")
    app.include_router(meetings_router, prefix="/api")
    app.include_router(inbox_router, prefix="/api")
    app.include_router(briefing_router, prefix="/api")
    app.include_router(reports_router, prefix="/api")
    app.include_router(push_router, prefix="/api")
    app.include_router(meta_router, prefix="/api")

    import gigsnano_api.mcp_server.tools  # noqa: F401 — register MCP tools
    from gigsnano_api.mcp_server.middleware import McpNoSlashMiddleware
    from gigsnano_api.mcp_server.server import build_mcp_app

    mcp_asgi = build_mcp_app()
    app.mount("/mcp", mcp_asgi)
    app.add_middleware(McpNoSlashMiddleware, mcp_app=mcp_asgi)

    from gigsnano_api.bmad.loader import get_registry

    get_registry()  # fail at startup on malformed BMAD assets, never mid-chat

    from gigsnano_api.bmad.provider import build_default_provider

    app.state.llm_provider = build_default_provider()

    from gigsnano_api.sync.github_client import build_default_github_client

    app.state.github_client = build_default_github_client()

    from gigsnano_api.sync.github_oauth import build_oauth

    app.state.github_oauth = build_oauth()

    from gigsnano_api.webhooks.sender import build_default_webhook_sender

    app.state.webhook_sender = build_default_webhook_sender()

    from gigsnano_api.meetings.provider import build_default_meeting_provider

    app.state.meeting_provider = build_default_meeting_provider()

    from gigsnano_api.sync.slack_oauth import build_slack_oauth

    app.state.slack_oauth = build_slack_oauth()

    from gigsnano_api.webhooks.slack_sender import build_default_slack_sender

    app.state.slack_sender = build_default_slack_sender()

    from gigsnano_api.features.push.sender import build_default_push_sender

    app.state.push_sender = build_default_push_sender()

    from gigsnano_api.payments.provider import build_default_payment_provider

    app.state.payment_provider = build_default_payment_provider()

    from gigsnano_api.email.provider import AcsEmailProvider, build_default_email_provider

    app.state.email_provider = build_default_email_provider()
    import logging

    _email_log = logging.getLogger("gigsnano.email")
    if isinstance(app.state.email_provider, AcsEmailProvider):
        _email_log.info(
            "ACS email enabled sender=%r app_base_url=%r",
            settings.email_from,
            settings.app_base_url,
        )
    else:
        _email_log.warning(
            "ACS not configured (ACS_CONNECTION_STRING unset) — using FakeEmailProvider; "
            "verification/receipt emails will NOT be delivered"
        )

    from gigsnano_api.agent_delegation.provider import build_default_agent_provider

    app.state.agent_provider = build_default_agent_provider()

    return app


app = create_app()
