"""GIN-309: the router must honour a work item's explicit 'Required agent skills'
section instead of only inferring skills from the classified type."""

from gigsnano_api.features.task_router.required_skills import extract_required_skills

# Shape mirrors the GIN-309 work-item body.
TICKET_HTML = (
    "<h2>Scope</h2><ul><li>Trace persona logic</li></ul>"
    "<h2>Required agent skills</h2><ul>"
    "<li><code>agent-routing</code></li>"
    "<li><code>classification-evaluation</code></li>"
    "<li><code>workspace-isolation</code></li>"
    "<li><code>testing-tdd</code></li>"
    "</ul>"
    "<h2>Acceptance criteria</h2><ul><li>Tests pass</li></ul>"
)


def test_extracts_the_declared_skills_in_order():
    assert extract_required_skills(TICKET_HTML) == [
        "skill:agent-routing",
        "skill:classification-evaluation",
        "skill:workspace-isolation",
        "skill:testing-tdd",
    ]


def test_no_section_yields_empty():
    assert extract_required_skills("<h2>Scope</h2><p>Just do it.</p>") == []
    assert extract_required_skills("") == []


def test_stops_at_the_next_heading():
    # Skills from a *later* section must not leak in.
    html = (
        "<h2>Required agent skills</h2><ul><li><code>agent-routing</code></li></ul>"
        "<h3>Test scenarios</h3><ul><li><code>should-not-appear</code></li></ul>"
    )
    assert extract_required_skills(html) == ["skill:agent-routing"]


def test_normalizes_prefix_case_and_separators():
    html = (
        "<h2>Required Agent Skills</h2><ul>"
        "<li><code>skill:Agent_Routing</code></li>"  # existing prefix + underscore + case
        "<li><code>Frontend State Management</code></li>"  # spaces
        "<li><code>agent-routing</code></li>"  # duplicate of the first → deduped
        "</ul>"
    )
    assert extract_required_skills(html) == [
        "skill:agent-routing",
        "skill:frontend-state-management",
    ]


def test_falls_back_to_list_items_without_code_tags():
    html = "<h2>Required agent skills</h2><ul><li>repo-discovery</li><li>playwright</li></ul>"
    assert extract_required_skills(html) == ["skill:repo-discovery", "skill:playwright"]
