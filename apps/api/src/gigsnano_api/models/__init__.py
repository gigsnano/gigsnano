"""Aggregated model surface.

Importing this package imports every model module, registering all tables on
`Base.metadata`. `from gigsnano_api.models import Story` works exactly as the old
`from gigsnano_api.models import Story` did.
"""
# Registers the global Story soft-delete filter (GIN-97). Imported last so Story
# is defined; importing models at all wires the do_orm_execute listener, and you
# cannot query Story without importing models — so the filter is always active.
from gigsnano_api.models import soft_delete  # noqa: E402,F401
from gigsnano_api.models.agent_runs import *  # noqa: F401,F403
from gigsnano_api.models.agents import *  # noqa: F401,F403
from gigsnano_api.models.artifacts import *  # noqa: F401,F403
from gigsnano_api.models.automations import *  # noqa: F401,F403
from gigsnano_api.models.autonomy import *  # noqa: F401,F403
from gigsnano_api.models.base import Base, TimestampedBase, _values  # noqa: F401
from gigsnano_api.models.billing import *  # noqa: F401,F403
from gigsnano_api.models.blockers import *  # noqa: F401,F403
from gigsnano_api.models.code_artifacts import *  # noqa: F401,F403
from gigsnano_api.models.control_runs import *  # noqa: F401,F403
from gigsnano_api.models.cycles import *  # noqa: F401,F403
from gigsnano_api.models.dashboards import *  # noqa: F401,F403
from gigsnano_api.models.digests import *  # noqa: F401,F403
from gigsnano_api.models.execution_profiles import *  # noqa: F401,F403
from gigsnano_api.models.exports import *  # noqa: F401,F403
from gigsnano_api.models.forecast_snapshots import *  # noqa: F401,F403
from gigsnano_api.models.foundation import *  # noqa: F401,F403
from gigsnano_api.models.gigs import *  # noqa: F401,F403
from gigsnano_api.models.governance import *  # noqa: F401,F403
from gigsnano_api.models.idempotency import *  # noqa: F401,F403
from gigsnano_api.models.images import *  # noqa: F401,F403
from gigsnano_api.models.importers import *  # noqa: F401,F403
from gigsnano_api.models.intake import *  # noqa: F401,F403
from gigsnano_api.models.llm import *  # noqa: F401,F403
from gigsnano_api.models.marketplace import *  # noqa: F401,F403
from gigsnano_api.models.meetings import *  # noqa: F401,F403
from gigsnano_api.models.metering import *  # noqa: F401,F403
from gigsnano_api.models.mobile_handoff import *  # noqa: F401,F403
from gigsnano_api.models.mobile_tokens import *  # noqa: F401,F403
from gigsnano_api.models.modules import *  # noqa: F401,F403
from gigsnano_api.models.notifications import *  # noqa: F401,F403
from gigsnano_api.models.oauth import *  # noqa: F401,F403
from gigsnano_api.models.packages import *  # noqa: F401,F403
from gigsnano_api.models.pages import *  # noqa: F401,F403
from gigsnano_api.models.pm_health import *  # noqa: F401,F403
from gigsnano_api.models.projects import *  # noqa: F401,F403
from gigsnano_api.models.push import *  # noqa: F401,F403
from gigsnano_api.models.recovery import *  # noqa: F401,F403
from gigsnano_api.models.roadmap import *  # noqa: F401,F403
from gigsnano_api.models.skill_events import *  # noqa: F401,F403
from gigsnano_api.models.skills import *  # noqa: F401,F403
from gigsnano_api.models.slack import *  # noqa: F401,F403
from gigsnano_api.models.solutions import *  # noqa: F401,F403
from gigsnano_api.models.staff import *  # noqa: F401,F403
from gigsnano_api.models.stickies import *  # noqa: F401,F403
from gigsnano_api.models.stories import *  # noqa: F401,F403
from gigsnano_api.models.sync import *  # noqa: F401,F403
from gigsnano_api.models.system import *  # noqa: F401,F403
from gigsnano_api.models.talent import *  # noqa: F401,F403
from gigsnano_api.models.teamspaces import *  # noqa: F401,F403
from gigsnano_api.models.templates import *  # noqa: F401,F403
from gigsnano_api.models.tokens import *  # noqa: F401,F403
from gigsnano_api.models.views import *  # noqa: F401,F403
from gigsnano_api.models.webhooks import *  # noqa: F401,F403
from gigsnano_api.models.workflows import *  # noqa: F401,F403
from gigsnano_api.models.workspace import *  # noqa: F401,F403

# NOTE: intentionally no `__all__` — `from gigsnano_api.models import *` (used by the
# domain/models.py compat shim) must re-export every star-imported model name.
