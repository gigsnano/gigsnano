"""Language detection + which languages get precise (SCIP) resolution."""

from __future__ import annotations

_EXT_LANG = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "c_sharp",
}
_DEEP = {"python", "typescript", "javascript"}


def detect(file_path: str) -> str | None:
    dot = file_path.rfind(".")
    return _EXT_LANG.get(file_path[dot:].lower()) if dot != -1 else None


def is_deep(language: str) -> bool:
    return language in _DEEP
