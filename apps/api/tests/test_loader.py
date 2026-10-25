import pytest

from gigsnano_api.bmad.loader import (
    NON_LLM_STEPS,
    NonLlmStepError,
    get_registry,
    workflow_for_story,
)


def test_registry_loads_all_workflows():
    registry = get_registry()
    assert set(registry) == {
        "bmad-brainstorming", "bmad-research", "bmad-product-brief", "bmad-prd",
        "bmad-ux", "bmad-create-architecture", "bmad-create-epics-and-stories",
        "bmad-check-implementation-readiness", "bmad-sprint-planning",
        "bmad-document-project", "bmad-generate-project-context", "bmad-create-story",
        "bmad-break-down-epic",
    }


def test_spec_shape():
    prd = get_registry()["bmad-prd"]
    assert prd.persona_name == "john"
    assert prd.doc_type == "prd"
    assert "PRD" in prd.instructions
    assert "brief" in prd.required_context
    assert len(prd.persona) > 50


def test_every_blueprint_llm_step_has_a_workflow():
    from gigsnano_api.bmad.blueprint import (
        BROWNFIELD_SPRINT_ZERO_STEPS,
        FRESH_SPRINT_ZERO_STEPS,
    )

    registry = get_registry()
    for step in (*FRESH_SPRINT_ZERO_STEPS, *BROWNFIELD_SPRINT_ZERO_STEPS):
        if step.workflow not in NON_LLM_STEPS:
            assert step.workflow in registry, step.workflow


def test_workflow_for_story():
    assert workflow_for_story("bmad-prd") == "bmad-prd"
    assert workflow_for_story(None) == "bmad-create-story"
    with pytest.raises(NonLlmStepError):
        workflow_for_story("track-selection")
