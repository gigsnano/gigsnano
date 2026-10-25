"""Loads the vendored BMAD assets (bmad_assets/) into WorkflowSpecs.

Fails loudly at startup — never mid-chat (spec §5.2).
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

ASSETS_DIR = Path(__file__).resolve().parents[3] / "bmad_assets"

NON_LLM_STEPS = frozenset({"track-selection", "scope-selection", "cleanup-artifacts"})


class AssetError(Exception):
    """Malformed or missing BMAD asset."""


class NonLlmStepError(Exception):
    """The step completes via story PATCH, not an agent chat."""


@dataclass(frozen=True)
class WorkflowSpec:
    id: str
    persona_name: str
    persona: str
    instructions: str
    doc_type: str
    title: str
    required_context: tuple[str, ...]


def _read(path: Path) -> str:
    if not path.is_file():
        raise AssetError(f"Missing asset file: {path}")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _manifest() -> dict:
    return yaml.safe_load(_read(ASSETS_DIR / "manifest.yaml"))


def bmad_version() -> str:
    return str(_manifest()["bmad_version"])


@lru_cache(maxsize=1)
def get_registry() -> dict[str, WorkflowSpec]:
    manifest = _manifest()
    personas = {
        name: _read(ASSETS_DIR / rel) for name, rel in manifest["personas"].items()
    }
    registry: dict[str, WorkflowSpec] = {}
    for wf_id, cfg in manifest["workflows"].items():
        persona_name = cfg["persona"]
        if persona_name not in personas:
            raise AssetError(f"{wf_id}: unknown persona {persona_name!r}")
        registry[wf_id] = WorkflowSpec(
            id=wf_id,
            persona_name=persona_name,
            persona=personas[persona_name],
            instructions=_read(ASSETS_DIR / cfg["instructions"]),
            doc_type=cfg["doc_type"],
            title=cfg["title"],
            required_context=tuple(cfg.get("required_context", [])),
        )
    return registry


def workflow_for_story(bmad_workflow: str | None) -> str:
    """Which workflow a story's chat runs. Product stories get create-story."""
    if bmad_workflow is None:
        return "bmad-create-story"
    if bmad_workflow in NON_LLM_STEPS:
        raise NonLlmStepError(bmad_workflow)
    return bmad_workflow
