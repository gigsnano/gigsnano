"""GIN-395: sections are what a finding anchors to, so they must be exact."""

from gigsnano_api.lib.markdown_sections import MAX_SECTION_CHARS, split_sections


def test_headings_become_sections_with_a_breadcrumb_path():
    text = "# Spec\n\nIntro.\n\n## Phases\n\n### Phase 0\n\nFoundation work.\n"
    sections = split_sections(text)
    assert [s.path for s in sections] == ["Spec", "Spec > Phases", "Spec > Phases > Phase 0"]
    assert sections[-1].text.strip().endswith("Foundation work.")


def test_offsets_point_back_at_the_source_text():
    text = "# A\n\nalpha\n\n# B\n\nbravo\n"
    for section in split_sections(text):
        assert text[section.start : section.end] == section.text


def test_preamble_before_the_first_heading_is_kept():
    text = "Loose intro paragraph.\n\n# Real heading\n\nbody\n"
    sections = split_sections(text)
    assert sections[0].heading == ""
    assert "Loose intro" in sections[0].text


def test_a_document_with_no_headings_still_anchors():
    sections = split_sections("just prose, no headings at all")
    assert len(sections) == 1
    assert sections[0].anchor.startswith("chars ")


def test_sibling_heading_pops_the_deeper_ancestor():
    text = "# Top\n\n## One\n\na\n\n### Deep\n\nb\n\n## Two\n\nc\n"
    assert [s.path for s in split_sections(text)][-1] == "Top > Two"


def test_oversized_section_is_chunked_with_true_offsets():
    body = ("paragraph text\n\n" * 900)  # comfortably over the cap
    text = f"# Huge\n\n{body}"
    sections = split_sections(text)
    assert len(sections) > 1
    assert all(len(s.text) <= MAX_SECTION_CHARS for s in sections)
    assert all(text[s.start : s.end] == s.text for s in sections)
    assert {s.path for s in sections} == {"Huge"}


def test_empty_input_yields_no_sections():
    assert split_sections("   \n\n ") == []
