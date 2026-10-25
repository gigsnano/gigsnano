"""Built-in solution definitions (GIN-443).

Mirrors `apps/web/src/mocks/data/solutions.ts` — same keys, versions,
starting points, navigation, and availability. Definitions are code-owned and
validated at startup; they are not database rows in this slice.
"""

from gigsnano_api.features.solutions.schemas import (
    NavigationEntryOut,
    SolutionDefinitionOut,
    StartingPointOut,
)

SOFTWARE_DELIVERY_KEY = "software_delivery"
SOFTWARE_DELIVERY_VERSION = 1

#: Bumped whenever any definition below changes, so caches invalidate.
REGISTRY_REVISION = "2026-07-25.1"

_software_delivery = SolutionDefinitionOut(
    key=SOFTWARE_DELIVERY_KEY,
    version=SOFTWARE_DELIVERY_VERSION,
    name="Software Delivery",
    outcome="Build and operate production-ready software",
    description=(
        "Take an idea, a repository or a pile of documents through to verified "
        "delivery, with agents doing the planning work alongside you."
    ),
    container_noun="project",
    capabilities=[
        "journeys",
        "repositories",
        "domain_objects",
        "dashboards",
        "integrations",
        "agents",
    ],
    starting_points=[
        StartingPointOut(
            key="idea",
            label="Start from an idea",
            hint="Greenfield — the agents draft the brief, PRD and architecture with you",
            recommended=True,
            requires_capability=None,
        ),
        StartingPointOut(
            key="repository",
            label="Connect an existing repository",
            hint="Brownfield — we read the codebase and document what is already there",
            recommended=False,
            requires_capability="repositories",
        ),
        StartingPointOut(
            key="documents",
            label="Import specifications or designs",
            hint="Bring your own PRD, designs or delivery docs and we map them in",
            recommended=False,
            requires_capability=None,
        ),
        StartingPointOut(
            key="in_flight",
            label="Continue an implementation",
            hint="Work already underway — pick up from the current state",
            recommended=False,
            requires_capability="repositories",
        ),
        StartingPointOut(
            key="blueprint",
            label="Use a blueprint",
            hint="Start from a reviewed setup someone already proved out",
            recommended=False,
            requires_capability=None,
        ),
        StartingPointOut(
            key="blank",
            label="Blank project",
            hint="No generated setup — you get less automation, not fewer options",
            recommended=False,
            requires_capability=None,
        ),
    ],
    navigation=[
        NavigationEntryOut(
            key="overview", label="Overview", path="", requires_capability=None
        ),
        NavigationEntryOut(
            key="journey",
            label="Journey",
            path="journey",
            requires_capability="journeys",
        ),
        NavigationEntryOut(
            key="work-items",
            label="Work items",
            path="issues",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="cycles", label="Cycles", path="cycles", requires_capability=None
        ),
        NavigationEntryOut(
            key="modules", label="Modules", path="modules", requires_capability=None
        ),
        NavigationEntryOut(
            key="codebase",
            label="Codebase",
            path="codebase",
            requires_capability="repositories",
        ),
        NavigationEntryOut(
            key="views", label="Views", path="views", requires_capability=None
        ),
    ],
    availability="available",
    availability_reason=None,
)

_revenue_assurance = SolutionDefinitionOut(
    key="revenue_assurance",
    version=1,
    name="Revenue Assurance",
    outcome="Detect and recover missing or blocked invoice revenue",
    description=(
        "Turn contract obligations into billing expectations, then find the "
        "invoices that were never raised, rejected or short-paid — with the "
        "evidence attached."
    ),
    container_noun="assurance workspace",
    capabilities=[
        "domain_objects",
        "dashboards",
        "integrations",
        "agents",
    ],
    starting_points=[
        StartingPointOut(
            key="diagnostic",
            label="Run a historical diagnostic",
            hint="Point us at last year's contracts and invoices to size the leakage",
            recommended=True,
            requires_capability=None,
        ),
        StartingPointOut(
            key="import",
            label="Import contracts and invoice extracts",
            hint="Bring the source-of-truth files and we extract the obligations",
            recommended=False,
            requires_capability=None,
        ),
        StartingPointOut(
            key="sources",
            label="Configure document and mailbox sources",
            hint="Approve specific shared mailboxes and folders — never every inbox",
            recommended=False,
            requires_capability="integrations",
        ),
        StartingPointOut(
            key="blueprint",
            label="Start from an approved blueprint",
            hint="A reviewed assurance setup with the four standard controls",
            recommended=False,
            requires_capability=None,
        ),
    ],
    navigation=[
        NavigationEntryOut(
            key="home",
            label="Assurance Home",
            path="",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="contracts",
            label="Contracts",
            path="contracts",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="expectations",
            label="Billing Expectations",
            path="expectations",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="evidence",
            label="Evidence",
            path="evidence",
            requires_capability="integrations",
        ),
        NavigationEntryOut(
            key="exceptions",
            label="Exceptions",
            path="exceptions",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="recoveries",
            label="Recoveries",
            path="recoveries",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="controls",
            label="Controls",
            path="controls",
            requires_capability=None,
        ),
        NavigationEntryOut(
            key="audit", label="Audit", path="audit", requires_capability=None
        ),
    ],
    # Off until the Wave 6 pilot blueprint (GIN-472) exists. The chooser shows
    # it so the platform's direction is visible, but it cannot be started.
    availability="disabled",
    availability_reason=(
        "Revenue Assurance is in limited pilot. Ask a workspace admin to request access."
    ),
)

BUILTIN_DEFINITIONS: list[SolutionDefinitionOut] = [
    _software_delivery,
    _revenue_assurance,
]
