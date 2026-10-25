"""Render an MCP tool payload to text for substring assertions.

Tools return native objects rather than JSON strings (GIN-270 — returning a
string made FastMCP wrap it as `{"result": "«json»"}`, so every client parsed
twice). Assertions that ask "does the response mention X" still want the
serialized form, and saying so explicitly is clearer than asserting against
whatever `in` means for a dict.
"""

import json
from typing import Any


def dumps(payload: Any) -> str:
    return json.dumps(payload, indent=2, default=str)
