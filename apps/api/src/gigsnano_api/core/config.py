from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-secret-change-me"


class Settings(BaseSettings):
    """App configuration. Values come from env vars / .env; defaults suit local dev."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://gigsnano:gigsnano@localhost:5433/gigsnano"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: list[str] = ["http://localhost:3000"]
    cookie_secure: bool = False  # True in production (HTTPS)
    # "lax" for same-site local dev; "none" in production so the browser sends the
    # auth cookies on cross-site requests (e.g. a frontend on a different origin).
    # "none" REQUIRES cookie_secure=True.
    cookie_samesite: str = "lax"
    anthropic_api_key: str = ""  # empty ⇒ FakeProvider (keyless local dev)
    # Tool-loop budget per agent turn. The FINAL round runs with no tools so the model
    # must synthesize an answer instead of dead-ending on "reached the tool-call limit".
    # Repo-QA does grep+search+read per file, so 8 was too low (agents ran out mid-answer).
    agent_max_rounds: int = 16
    # Hard ceiling on ONE tool handler. A handler that never returns (graph query,
    # git/index I/O, a wedged DB call) otherwise hangs the whole SSE turn with no
    # terminal event, which the client can only show as an endless spinner.
    agent_tool_timeout_s: float = 120.0
    anthropic_model: str = "claude-haiku-4-5"  # use claude-haiku-4-5 for haiku
    # BMAD artifacts (UX/architecture/epics) routinely need ~10k output tokens;
    # the forced emit_artifact tool call truncates and fails schema validation if
    # this caps below the artifact size (the old 4096 default failed UX at 9.9k).
    # Ceiling: the non-streaming Anthropic `messages.create` used by extract()
    # rejects max_tokens above ~21k ("streaming required" for >10-min requests),
    # so 16384 is the safe max here. Raise extract() to streaming to go higher.
    llm_max_tokens: int = 16384
    github_app_id: str = ""  # empty ⇒ FakeGitHubClient (keyless local dev)
    github_app_private_key: str = ""  # PEM; \n-escaped when set via env var
    github_api_base: str = "https://api.github.com"
    workspace_base_path: str = "./.workspaces"  # host dev; set /workspaces in Docker
    github_app_slug: str = ""  # e.g. "gigsnano" — for the install URL
    github_setup_redirect_uri: str = "http://localhost:3000/settings/integrations/github"
    code_index_enabled: bool = False  # False => FakeCodeIndexer (keyless local dev / tests)
    # Multi-repository System Bundles (GIN-408). Off by default: the schema + backfill
    # ship dark, and new multi-repo behaviour only turns on once this is set.
    multi_repo_enabled: bool = False
    # Context Engine (SP1) — precise symbol graph. False ⇒ fake/keyless path (no FalkorDB/Node).
    context_engine_enabled: bool = False
    falkordb_url: str = "redis://localhost:6379"  # FalkorDB (Redis+graph module) container
    scip_timeout_s: int = 900  # per-invocation wall-clock cap for a SCIP indexer
    # Per-query cap (ms) for read-only nav Cypher. Variable-length traversals enumerate
    # paths before LIMIT applies, so on a large/dense graph they can run away; this bounds
    # them server-side so a single tool call can never stall an agent turn.
    context_engine_query_timeout_ms: int = 5000
    # Context Engine eval loop (SP5+SP6) — manual CLI, not a runtime surface.
    eval_target_repo_path: str = ""  # local gigsnano-v2 checkout to question
    eval_target_sha: str = ""  # pinned commit the goldens are authored against
    eval_judge_model: str = "claude-haiku-4-5"
    eval_judge_threshold: float = 0.7
    github_webhook_secret: str = ""  # HMAC secret for push webhooks; empty ⇒ webhook 503s
    # GitHub OAuth App (user-authorization web flow) — the live path when clientid+secret set.
    # Env: GITHUB_OAUTH_CLIENTID / GITHUB_OAUTH_CLIENTSECRET / TOKEN_ENCRYPTION_KEY /
    # GITHUB_REDIRECT_URI / GITHUB_OAUTH_SCOPES. Empty clientid ⇒ FakeGitHubOAuth (keyless dev).
    github_oauth_clientid: str = ""
    github_oauth_clientsecret: str = ""
    github_oauth_scopes: str = "repo read:user user:email"
    github_redirect_uri: str = "http://localhost:3000/settings/integrations/github/callback"
    token_encryption_key: str = ""  # Fernet key; encrypts stored OAuth tokens at rest
    # Coding-agent delegation (Cursor/Codex/Claude Code). Empty ⇒ FakeAgentProvider.
    cursor_oauth_clientid: str = ""
    cursor_oauth_clientsecret: str = ""
    cursor_api_base: str = "https://api.cursor.com"
    agent_oauth_redirect_uri: str = "http://localhost:3000/account/settings/agents/callback"
    agent_oauth_scopes: str = "agent"
    # Codex (OpenAI ChatGPT subscription OAuth). Public client when use_public_client.
    codex_oauth_clientid: str = ""
    codex_oauth_clientsecret: str = ""
    codex_use_public_client: bool = False
    codex_oauth_authorize_url: str = "https://auth.openai.com/oauth/authorize"
    codex_oauth_token_url: str = "https://auth.openai.com/oauth/token"
    codex_oauth_scopes: str = "openid profile email offline_access"
    codex_api_base: str = "https://chatgpt.com/backend-api/codex"
    # Claude Code (Anthropic OAuth app — register in Anthropic Console).
    claude_code_oauth_clientid: str = ""
    claude_code_oauth_clientsecret: str = ""
    claude_code_oauth_authorize_url: str = "https://console.anthropic.com/oauth/authorize"
    claude_code_oauth_token_url: str = "https://console.anthropic.com/oauth/token"
    claude_code_oauth_scopes: str = "org:read user:profile user:read"
    claude_code_api_base: str = "https://api.anthropic.com"
    webhooks_real_delivery: bool = False  # False ⇒ FakeWebhookSender (keyless local dev)

    # Canonical structured content (GIN-297 / ADR 0001). Two independent flags so
    # writes can be switched on and soaked long before anything reads them, and so
    # turning READ off restores exact prior behaviour with no data movement — the
    # rollback boundary. Both default off; the derived HTML column is maintained
    # throughout and is never dropped by this epic.
    content_json_write: bool = False  # populate *_json alongside the HTML column
    content_json_read: bool = False  # prefer *_json over the HTML column on read
    # Slack OAuth App (bot-token web flow, GIN-23a). Empty client id ⇒ FakeSlackOAuth
    # (keyless dev). Reuses TOKEN_ENCRYPTION_KEY for the bot token, like GitHub.
    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_redirect_uri: str = "http://localhost:3000/settings/integrations/slack/callback"
    slack_real_delivery: bool = False  # False ⇒ FakeSlackSender (keyless local dev)
    google_client_id: str = ""  # OAuth Web client ID; empty ⇒ /auth/google/ returns 503
    # Comma-separated Google OAuth client IDs of the iOS/Android apps. Mobile ID tokens
    # may carry one of these as `aud` instead of the web client ID.
    google_mobile_client_ids: str = ""
    # iOS bundle identifier; the `aud` of Sign in with Apple identity tokens.
    # Empty ⇒ /auth/mobile/apple/ returns 503.
    apple_bundle_id: str = ""
    # Mobile push: push_enabled starts the outbox worker; Expo delivery is opt-in
    # (False => FakePushSender, keyless local dev).
    push_enabled: bool = False
    push_real_delivery: bool = False
    expo_access_token: str = ""
    # Oldest mobile app version the API still supports; older apps must update.
    mobile_min_version: str = "1.0.0"
    # Allows exp:// redirects on private IPs for Expo Go testing. Turn off for the store
    # release (M5): a same-network attacker running Expo can receive a phished code.
    mobile_handoff_allow_expo_go: bool = True
    # Comma-separated emails granted platform-staff (Superadmin) on startup.
    staff_bootstrap_emails: str = ""
    # Billing / payments (Stripe). Empty secret key ⇒ FakePaymentProvider (keyless dev).
    # Workspace wallet + AI charging. False for self-hosted installs (AI usage is
    # recorded but never charged or gated); the hosted service sets True.
    billing_enabled: bool = False
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_api_version: str = "2026-05-27.dahlia"  # pin so SDK upgrades don't shift behavior
    platform_fee_bps: int = 2000  # 20%; seeds the live PlatformConfig row
    stripe_connect_return_url: str = "http://localhost:3000/marketplace/profile"
    stripe_connect_refresh_url: str = "http://localhost:3000/marketplace/profile"
    # Subscription prices are DB-configured (plan_prices, admin UI) — GIN-30 Slice 2.
    # There is intentionally no stripe_price_ids env: the DB is the source of truth.
    # Email (Azure Communication Services). Empty connection string ⇒ FakeEmailProvider.
    acs_connection_string: str = ""
    email_from: str = ""
    email_reply_to: str = ""
    app_base_url: str = "http://localhost:3000"
    # How long a workspace invitation stays redeemable (GIN-526). Configurable so
    # a tenant can shorten it; 7 days is the recommended default in the spec.
    invitation_ttl_days: int = 7
    # Public API origin for OAuth discovery + MCP resource metadata (empty ⇒ request host).
    public_base_url: str = ""
    # Frontend sign-in URL base for OAuth authorize gate (defaults to app_base_url).
    frontend_url: str = ""
    mcp_token_ttl_minutes: int = 60

    # Voice (GIN-491). Unset => FakeVoiceProvider, which is why voice is inert
    # rather than broken on an environment that has no Speech resource.
    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"
    # Per-workspace enablement lives in governance.py; this is the platform kill
    # switch for environments that should never offer voice at all.
    #: Comma-separated workspace slugs allowed to start a voice session. Empty
    #: means nobody — the pilot allowlist from GIN-523, enforced server-side so a
    #: client cannot opt itself in.
    voice_enabled_workspaces: str = ""

    # Daily work digest (GIN-103). Scheduler runs in-process (single replica),
    # ticking every 15 min and delivering at each user's own local hour (GIN-125 —
    # so there is no global digest_hour_utc any more; it lives on the user's
    # DigestPreference). Deliveries are idempotent per user/local-day either way.
    digests_enabled: bool = False
    # Recurring-work-item scheduler (GIN-240). Off by default; sweeps due
    # schedule-trigger automation rules on a fixed tick when on.
    recurrence_enabled: bool = False
    # Forecast recalc scheduler (GIN-335/339). ON by default — periodically recomputes
    # every project's forecast (append-only, deduped) so snapshot history accrues and
    # material-health alerts fire without a manual recalc. Set FORECAST_RECALC_ENABLED=false
    # to disable. Safe on a single replica (the lifespan task guards each project).
    forecast_recalc_enabled: bool = True
    # AI focus note in the digest (GIN-101). Off by default; costs one LLM call
    # per delivered user per day when on.
    digest_ai_enabled: bool = False
    # Whether the digest's AI note debits the workspace wallet (GIN-147).
    #
    # Off: the usage is still recorded, so the cost is visible in the admin LLM
    # dashboard -- it just isn't charged. Every other billed path is user-initiated
    # (chat, PRD, story generation); the digest is system-initiated, so charging for
    # it silently every morning would be a surprise on someone's balance.
    #
    # The provision exists because the AI note is a candidate Pro feature: when that
    # lands, flip this rather than rewiring the billing path.
    digest_ai_billed: bool = False

    solutions_enabled: bool = False
    solution_workspace_allowlist: str = ""  # comma-separated workspace slugs

    # Meeting notetaker (spec 2026-09-19). Empty vexa_base_url + meetings_fake_provider=False
    # ⇒ no provider: creating a meeting returns 503. Fake is for local dev only.
    vexa_base_url: str = ""
    vexa_api_key: str = ""
    meetings_fake_provider: bool = False
    meetings_bot_name: str = "GigsNano Notetaker"
    # ISO 639-1 code passed to the bot's transcription (e.g. "en", "ar"). Empty = auto-detect,
    # so meetings can be held in any language; notes/action items are always written in English.
    meetings_default_language: str = ""
    meetings_poll_enabled: bool = False
    meetings_poll_seconds: float = 3.0

    @model_validator(mode="after")
    def _reject_dev_secret_in_production(self) -> "Settings":
        # COOKIE_SECURE=true means HTTPS, i.e. a real deployment: the public dev
        # secret would let anyone forge session tokens.
        if self.cookie_secure and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET is the public dev default; set a random secret of 32+ bytes")
        return self


def deployment_warnings(s: Settings) -> list[str]:
    """Configuration that boots but is probably a mistake, logged once at startup."""
    warnings = []
    if s.stripe_secret_key.startswith("sk_live_") and not s.billing_enabled:
        warnings.append(
            "A live Stripe key is configured but BILLING_ENABLED is false: AI usage is not charged."
        )
    return warnings


settings = Settings()
