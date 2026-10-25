"""The internal repo-context tool belt: code navigation + documents. Never exposed externally."""

from gigsnano_api.agent.tools.base import ToolRegistry
from gigsnano_api.agent.tools.code import build_code_tools_registry
from gigsnano_api.agent.tools.documents import build_document_tools_registry


def build_repo_context_registry() -> ToolRegistry:
    return ToolRegistry.merged(build_code_tools_registry(), build_document_tools_registry())
