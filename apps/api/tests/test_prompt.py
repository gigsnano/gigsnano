from gigsnano_api.bmad.extraction import EXTRACTION_MODELS, extraction_schema
from gigsnano_api.bmad.loader import get_registry
from gigsnano_api.bmad.prompt import build_messages, build_system
from gigsnano_api.models import Artifact, ChatMessage, EChatRole


def make_artifact(doc_type: str, title: str) -> Artifact:
    return Artifact(project_id="p1", doc_type=doc_type, title=title,
                    content_md=f"# {title}\nBody.")


def test_build_system_blocks_and_caching():
    spec = get_registry()["bmad-prd"]
    blocks = build_system(spec, [make_artifact("brief", "Product Brief")])
    assert len(blocks) == 2
    assert spec.persona.strip()[:40] in blocks[0]["text"]
    assert "## Workflow: PRD" in blocks[0]["text"]
    assert blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert '<artifact type="brief" title="Product Brief">' in blocks[1]["text"]
    assert blocks[1]["cache_control"] == {"type": "ephemeral"}


def test_build_system_without_context_is_single_block():
    spec = get_registry()["bmad-brainstorming"]
    assert len(build_system(spec, [])) == 1


def test_build_messages_starts_with_user():
    msgs = build_messages([
        ChatMessage(thread_id="t", role=EChatRole.ASSISTANT, content="Hello!"),
        ChatMessage(thread_id="t", role=EChatRole.USER, content="Hi"),
    ])
    assert msgs[0]["role"] == "user"  # leading assistant message gets dropped
    assert msgs == [{"role": "user", "content": "Hi"}]


def test_extraction_registry_covers_all_doc_types():
    registry = get_registry()
    for spec in registry.values():
        assert spec.doc_type in EXTRACTION_MODELS, spec.doc_type


def test_epics_schema_has_stories():
    schema = extraction_schema("epics")
    assert "epics" in schema["properties"]


def test_readiness_verdict_enum():
    model = EXTRACTION_MODELS["readiness"]
    out = model.model_validate(
        {"verdict": "pass", "concerns": [], "markdown": "# Report"}
    )
    assert out.verdict == "pass"
