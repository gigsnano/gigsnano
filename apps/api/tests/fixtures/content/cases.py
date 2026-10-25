"""The GIN-302 fixture matrix.

Each case is Markdown that must survive `markdown -> JSON -> markdown` unchanged
after the first normalising pass. `NORMALISING` holds inputs whose first pass is
*expected* to rewrite them (setext headings, `*em*`, `+` bullets); their stated
output must then be a fixed point.

Adding a node or mark to the registry without adding a case here is the gap this
file exists to close.
"""

# --- structure ---------------------------------------------------------------

HEADINGS = """\
# Heading one

## Heading two

### Heading three
"""

#: `*` for emphasis, not `_` — `_` cannot open or close inside a word in
#: CommonMark, so a mark starting mid-word would be silently lost.
MARKS = """\
Plain, **bold**, *italic*, ~~struck~~, `code`, and ***both***.
"""

INTRAWORD_EMPHASIS = """\
intra*word*emphasis and un**bold**ed.
"""

LINKS = """\
An [external link](https://example.com) and a [mailto](mailto:a@example.com).
"""

NESTED_LISTS = """\
- top level
- second
  - nested one
  - nested two
- third
"""

ORDERED_LIST = """\
1. first
2. second
3. third
"""

TASK_LISTS = """\
- [ ] unchecked item
- [x] checked item
- [ ] another
"""

BLOCKQUOTE = """\
> quoted line

> a second, separate quote
"""

TABLE = """\
| Column A | Column B |
| --- | --- |
| a1 | b1 |
| a2 | b2 |
"""

HORIZONTAL_RULE = """\
before

---

after
"""

# --- the cases that motivated the epic ---------------------------------------

#: GIN-134 root cause 2: Markdown that merely *mentions* a tag was sniffed as HTML
#: and passed through unconverted, rendering as literal `##` and `**`. There is no
#: sniff any more, but the shape stays pinned.
CODE_CONTAINING_HTML = """\
Use `<p>` for a paragraph and `<div>` for a block.

```html
<div class="wrapper">
  <p>hello</p>
</div>
```
"""

#: GIN-117: agent-sent content rendering as visible markup. With an explicit
#: format there is no branch to take wrong; raw HTML in Markdown is literal text.
HTML_IS_LITERAL_TEXT = """\
This is not markup: \\<script\\>alert(1)\\</script\\>
"""

#: GIN-41 / GIN-78: mermaid is source, never SVG.
MERMAID = """\
```mermaid
graph TD
  A[Start] --> B[End]
```
"""

FENCED_CODE = """\
```python
def hello() -> str:
    return "world"
```
"""

# --- semantic references -----------------------------------------------------

MENTION = """\
Assigning this to [@Jessy](gigsnano:user/9f18ddde-24ec-4aa2-ab79-a3e25d1ba88c).
"""

TEAM_MENTION = """\
Routing to [@Platform](gigsnano:team/11111111-2222-3333-4444-555555555555).
"""

WORK_ITEM_REF = """\
Blocked by [GIN-297](gigsnano:work-item/34db40fe-7bd2-42ba-9ddd-8f11aaf3caec).
"""

CROSS_PROJECT_REFS = """\
See [GIN-297](gigsnano:work-item/34db40fe-7bd2-42ba-9ddd-8f11aaf3caec) and \
[GIA-15](gigsnano:work-item/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee).
"""

ATTACHMENT = """\
[spec.pdf](gigsnano:file/aaaabbbb-cccc-dddd-eeee-ffff00001111)
"""

INTERNAL_IMAGE = """\
![architecture diagram](gigsnano:file/99998888-7777-6666-5555-444433332222)
"""

# --- edge cases --------------------------------------------------------------

UNICODE = """\
Unicode: café, naïve, 日本語, emoji 🎉, and RTL עברית.
"""

ESCAPES = """\
Literal asterisks \\*not bold\\* and an underscore in snake\\_case.
"""

BACKTICKS_IN_CODE = """\
Nested ticks: ``a ` b``.
"""

LONG_DOCUMENT = (
    "# Long document\n\n"
    + "\n\n".join(f"Paragraph number {i} with some prose in it." for i in range(200))
    + "\n"
)

#: Every case that must be a fixed point on the first pass.
ROUND_TRIP = {
    "headings": HEADINGS,
    "marks": MARKS,
    "intraword_emphasis": INTRAWORD_EMPHASIS,
    "links": LINKS,
    "nested_lists": NESTED_LISTS,
    "ordered_list": ORDERED_LIST,
    "task_lists": TASK_LISTS,
    "blockquote": BLOCKQUOTE,
    "table": TABLE,
    "horizontal_rule": HORIZONTAL_RULE,
    "code_containing_html": CODE_CONTAINING_HTML,
    "html_is_literal_text": HTML_IS_LITERAL_TEXT,
    "mermaid": MERMAID,
    "fenced_code": FENCED_CODE,
    "mention": MENTION,
    "team_mention": TEAM_MENTION,
    "work_item_ref": WORK_ITEM_REF,
    "cross_project_refs": CROSS_PROJECT_REFS,
    "attachment": ATTACHMENT,
    "internal_image": INTERNAL_IMAGE,
    "unicode": UNICODE,
    "escapes": ESCAPES,
    "backticks_in_code": BACKTICKS_IN_CODE,
    "long_document": LONG_DOCUMENT,
}

#: Inputs the first pass is allowed to rewrite, mapped to the normal form.
#: Each must then be a fixed point — normalisation converges, it doesn't drift.
NORMALISING = {
    "setext_heading": ("Title\n=====\n", "# Title\n"),
    "underscore_emphasis": ("_italic_ text\n", "*italic* text\n"),
    "plus_bullets": ("+ one\n+ two\n", "- one\n- two\n"),
    "star_bullets": ("* one\n* two\n", "- one\n- two\n"),
    "underscore_heading_spacing": ("#  Extra   spaces\n", "# Extra   spaces\n"),
    # A soft wrap is whitespace, not a line break: the paragraph rejoins.
    "soft_wrap": ("one\ntwo\n", "one two\n"),
    "soft_wrapped_blockquote": (
        "> quoted line\n> still quoted\n",
        "> quoted line still quoted\n",
    ),
    # CommonMark strips one space either side of a padded code span, so the
    # padding is presentational and doesn't survive.
    "padded_code_span": ("Ticks: `` a ` b ``.\n", "Ticks: ``a ` b``.\n"),
}
