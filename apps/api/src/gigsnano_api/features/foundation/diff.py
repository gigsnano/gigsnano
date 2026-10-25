import re

from gigsnano_api.features.foundation.types import ChangedLine

_HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def parse_unified_diff(diff_text: str) -> list[ChangedLine]:
    out: list[ChangedLine] = []
    current_file = ""
    new_lineno = 0
    for raw in diff_text.splitlines():
        if raw.startswith("+++ "):
            path = raw[4:].strip()
            current_file = path[2:] if path.startswith(("a/", "b/")) else path
            continue
        hunk = _HUNK.match(raw)
        if hunk:
            new_lineno = int(hunk.group(1))
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            out.append(ChangedLine(file=current_file, line=new_lineno, text=raw[1:]))
            new_lineno += 1
        elif raw.startswith("-") and not raw.startswith("---"):
            continue  # removed line: new-side line number does not advance
        elif raw.startswith(" "):
            new_lineno += 1
        # metadata lines (diff --git, index, ---) are ignored
    return out
