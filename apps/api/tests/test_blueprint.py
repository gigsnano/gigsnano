from gigsnano_api.bmad.blueprint import (
    BROWNFIELD_SPRINT_ZERO_STEPS,
    FRESH_SPRINT_ZERO_STEPS,
    steps_for,
)
from gigsnano_api.models import EProjectFlow


def test_fresh_steps_match_frontend_blueprint():
    workflows = [s.workflow for s in FRESH_SPRINT_ZERO_STEPS]
    assert workflows == [
        "track-selection", "bmad-brainstorming", "bmad-research", "bmad-product-brief",
        "bmad-prd", "bmad-ux", "bmad-create-architecture",
        "bmad-create-epics-and-stories", "bmad-check-implementation-readiness",
        "bmad-sprint-planning",
    ]
    required = {s.workflow for s in FRESH_SPRINT_ZERO_STEPS if s.required}
    assert required == {
        "track-selection", "bmad-prd", "bmad-create-architecture",
        "bmad-create-epics-and-stories", "bmad-check-implementation-readiness",
        "bmad-sprint-planning",
    }


def test_brownfield_steps_match_frontend_blueprint():
    workflows = [s.workflow for s in BROWNFIELD_SPRINT_ZERO_STEPS]
    assert workflows == [
        "cleanup-artifacts", "bmad-document-project", "bmad-generate-project-context",
        "scope-selection", "bmad-prd", "bmad-ux", "bmad-create-architecture",
        "bmad-create-epics-and-stories", "bmad-check-implementation-readiness",
        "bmad-sprint-planning",
    ]


def test_steps_for_filters_ux_when_no_ui():
    fresh_no_ui = steps_for(EProjectFlow.FRESH, has_ui=False)
    assert all(s.workflow != "bmad-ux" for s in fresh_no_ui)
    assert len(fresh_no_ui) == 9
    assert len(steps_for(EProjectFlow.EXISTING, has_ui=True)) == 10
