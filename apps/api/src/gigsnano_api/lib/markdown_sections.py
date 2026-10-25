"""Split extracted document text into anchorable sections (GIN-395).

A finding is only useful if a human can jump to where it came from, so analysis
works on sections rather than whole documents: each carries its heading path and
character range, and that is what a traceability link cites later (GIN-398).

Pure: text in, sections out. Deterministic, so the same document always yields
the same anchors — a finding recorded today still resolves tomorrow.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: ATX headings only (`## Title`). Setext underlines are rare in generated docs
#: and MarkItDown emits ATX, so supporting them would be speculative.
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*$", re.MULTILINE)

#: A section longer than this is chunked, so one enormous heading-less document
#: cannot blow the analysis prompt.
MAX_SECTION_CHARS = 6000


@dataclass(frozen=True)
class Section:
    heading: str  # the section's own heading ("" for a preamble)
    path: str  # breadcrumb of ancestor headings, e.g. "Phases > Phase 0"
    text: str
    start: int  # character offset into the source document
    end: int

    @property
    def anchor(self) -> str:
        """What a finding cites. Falls back to the offset when a document has no
        headings at all, so an anchor is never empty."""
        return self.path or self.heading or f"chars {self.start}-{self.end}"


def _chunk(section: Section) -> list[Section]:
    """Split an oversized section on paragraph boundaries, keeping offsets true."""
    if len(section.text) <= MAX_SECTION_CHARS:
        return [section]
    out: list[Section] = []
    cursor = 0
    while cursor < len(section.text):
        window = section.text[cursor : cursor + MAX_SECTION_CHARS]
        split = window.rfind("\n\n")
        take = split + 2 if split > MAX_SECTION_CHARS // 2 else len(window)
        piece = section.text[cursor : cursor + take]
        out.append(
            Section(
                heading=section.heading,
                path=section.path,
                text=piece,
                start=section.start + cursor,
                end=section.start + cursor + len(piece),
            )
        )
        cursor += take
    return out


def split_sections(text: str) -> list[Section]:
    """Split markdown into heading-scoped sections, preserving the heading path."""
    if not text.strip():
        return []

    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        return _chunk(Section(heading="", path="", text=text, start=0, end=len(text)))

    sections: list[Section] = []
    if matches[0].start() > 0 and text[: matches[0].start()].strip():
        sections.append(
            Section(
                heading="",
                path="",
                text=text[: matches[0].start()],
                start=0,
                end=matches[0].start(),
            )
        )

    ancestors: list[tuple[int, str]] = []  # (level, heading)
    for index, match in enumerate(matches):
        level = len(match.group(1))
        heading = match.group(2).strip()
        while ancestors and ancestors[-1][0] >= level:
            ancestors.pop()
        path = " > ".join([h for _, h in ancestors] + [heading])
        ancestors.append((level, heading))

        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end]
        if not body.strip():
            continue
        sections.extend(
            _chunk(Section(heading=heading, path=path, text=body, start=start, end=end))
        )
    return sections
