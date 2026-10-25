# ADR 0001 — Structured content: TipTap JSON is canonical, HTML/Markdown/SVG are derived

- **Status:** Accepted
- **Date:** 2026-07-20
- **Work item:** GIN-298 (under epic GIN-297)
- **Supersedes:** the implicit "HTML string is the content" model established by GIN-117 / GIN-134
- **Changes no production behavior.** This document plus `structured-content-schema.json` is the whole deliverable.

---

## 1. Decision

1. **Canonical persistence is versioned ProseMirror/TipTap JSON**, stored in a new `*_json jsonb` column beside every existing rich-text column.
2. **HTML, Markdown, plain text and Mermaid SVG are derived outputs.** None is ever the source of truth. Existing HTML columns become a legacy/fallback read source and a rollback surface, never a write target once a field is cut over.
3. **No endpoint content-sniffs.** Every write path takes an explicit `content_format` of `json | markdown | html`. `markdown_or_html_to_html`'s anchored-regex guess (`bmad/markdown_html.py:60-65`) is deleted once callers are migrated.
4. **Every semantic node carries an immutable domain id plus a display fallback.** A reference whose target is deleted renders as an *unresolved* node — it never degrades to plain text.
5. **Unknown nodes and marks are preserved verbatim** on read/write so an older reader cannot destroy a newer writer's content.

### Why not keep HTML canonical

- HTML has no stable identity for semantic objects. `lib/mentions.py:19-43` already parses `<mention-component>` back out of stored HTML with an `HTMLParser` and a `@Name`-over-stripped-text fallback (`:46-73`) — a parser recovering structure the writer already had.
- HTML cannot be CRDT-merged. `y-prosemirror` syncs a ProseMirror document; an HTML canonical value structurally blocks GIN-24.
- Markdown export from HTML requires a second lossy parse. There is no HTML→Markdown converter in either repo today, and adding one to a format that is itself a derived artifact compounds the loss.
- Format guessing is an inherent property of a string-typed content column. GIN-117 and GIN-134 were two patches to the same guess; a third is inevitable while the guess exists.

---

## 2. Measured baseline (2026-07-20)

Everything in this section is observed in the repos, not assumed.

### 2.1 Editor — `apps/web/src/components/editor/`

`RichEditor` is HTML in / HTML out: `value: string`, `onChange: (html: string)` (`rich-editor.tsx:28-29`), written via `editor.getHTML()` (`:166`), read via `commands.setContent(external)` (`:135-136`, `:181-182`). **`getJSON()` / `setContent(json)` appear nowhere in the repo.**

Installed: `@tiptap/*` **3.27.3** (`extension-code-block` 3.27.4), `prosemirror-model` 1.25.10, `prosemirror-view` 1.42.0, `prosemirror-tables` 1.8.5 (transitive via `@tiptap/pm`), `mermaid` 11.16.0, `shiki` 4.3.1, `streamdown` 2.5.0. **`yjs` / `y-prosemirror`: not installed. `dompurify`: transitive under `mermaid` only, never imported by app code. `turndown` / `markdown-it`: not installed.**

Registered extensions (`rich-editor.tsx:91-124`): `StarterKit` (configured), `Placeholder`, `TaskList`, `TaskItem{nested}`, `TextAlign`, `MermaidCodeBlock`, `createImagePaste()`, `UserMentionExtension`, `SlashCommand`. StarterKit contributes `Document, Text, Paragraph, Bold, Italic, Strike, Underline, Code, Heading, Blockquote, BulletList, OrderedList, ListItem, ListKeymap, HorizontalRule, HardBreak, Link, Dropcursor, Gapcursor, TrailingNode, UndoRedo`; `codeBlock` is disabled and replaced by `MermaidCodeBlock` (`CodeBlock.extend` + React node view, `extensions/mermaid-code-block.tsx:83-87`).

Three variants gate the node set (`rich-editor.tsx:41`, `85-89`): `full` (descriptions), `comment`, `lite` (paragraph + mention only).

**Two corrections to the epic's premise:**

- **Tables are not in the editor.** `@tiptap/extension-table` is not installed and no toolbar/bubble/slash command inserts one. Tables exist only in the *document* read path, via the hand-rolled `renderSimpleMarkdown` pipe-table branch (`src/lib/docs/markdown.ts:28`). GIN-297 lists tables under "enterprise behavior to preserve"; there is no editor behavior to preserve — adding tables is **new scope**, tracked as a node in the registry marked `planned`.
- **Attachments are not a node.** The comment toolbar's attach action inserts a plain `<a>` link (`editor-toolbar.tsx:59`); there is no attachment node with a file id. Also new scope.

Custom nodes that *do* exist: `mention` (serialized as `<mention-component id entity_identifier entity_name>`, `extensions/mention/mention-extension.ts:41-78`), the mermaid-aware code block, and an `Image` extension with a paste/drop plugin (`extensions/image-paste.ts:51-78`). **No work-item reference node.**

### 2.2 Storage — `apps/api/src/gigsnano_api/models/`

| Column | Type | De-facto format |
|---|---|---|
| `stories.description` | `Text` (`stories.py:81`) | HTML |
| `story_comments.body` | `Text` (`stories.py:232`) | HTML |
| `projects.overview` | `Text` (`projects.py:88`) | HTML |
| `pages.content` | `Text` (`pages.py:19`) | HTML-ish, edited in a plain `<textarea>` |
| `stickies.body` | `Text` (`stickies.py:18`) | HTML |
| `artifact_comments.body` | `Text` (`artifacts.py:78`) | HTML |
| `artifacts.content_md` | `Text` (`artifacts.py:53`) | **Markdown** |
| `releases.changelog_md` | `Text` (`roadmap.py:55`) | **Markdown** |
| `story_activities.old_value` / `new_value` | `Text` (`stories.py:276-277`) | HTML snapshots |
| `triage_items.enriched_description` | `Text` (`intake.py:81`) | raw LLM output |

Alembic single head: **`ec4f7a9b2d10`**. No migration has ever added a format discriminator to any content column; grep for `content_format` across `apps/api/src/` returns zero hits, and every Pydantic content field is a bare `str`.

### 2.3 Known defects this model resolves

Each is a symptom of the same root cause — a string-typed content column with a guessed format.

| # | Observed | Evidence |
|---|---|---|
| D1 | The sniffer's tag allow-list omits `<mention-component>`, the one custom tag the codebase itself parses. HTML opening with a mention is routed to the Markdown converter and escaped. | `markdown_html.py:53-57` vs `lib/mentions.py:19-43` |
| D2 | The TS MCP server converts **nothing**. Same tool names as Python, opposite behavior — GIN-134 is still live on that path. | `packages/gigsnano-mcp/src/tools.ts:180-234`, `:114-122` |
| D3 | No MCP tool description states the accepted format; the contract exists only in a Python-internal docstring. `get_work_item` returns HTML and `get_document` returns Markdown, both unlabelled. | `mcp_server/tools.py:14-24`, `:589`, `:732` |
| D4 | `markdown_to_html` supports headings, lists, paragraphs, bold/italic/inline-code only. Tables, fenced code, links, images, blockquotes and task lists silently degrade. | `markdown_html.py:68-122` |
| D5 | `sync/materializer.py:117` interpolates `epic_story.description` (HTML) directly into `docs/epics/*.md`. | as cited |
| D6 | `bmad/epic_tree.py:63,79,97`, `bmad/break_down_epic.py:73,92` and `features/intake/service.py:84` write raw LLM Markdown into `stories.description`, a column every other writer treats as HTML. | as cited |
| D7 | Search is `ILIKE` over raw HTML — matches tag names, misses words split by a tag boundary. | `features/search/service.py:40` |
| D8 | **No sanitizer exists** (no `bleach`/`nh3`/`dompurify` in app code). The stated defence is "TipTap drops unknown tags" (`markdown_html.py:62-63`), but `history-diff.tsx:62-63` renders stored description HTML through raw `dangerouslySetInnerHTML`, bypassing TipTap entirely. | as cited |
| D9 | Three divergent `re.sub(r"<[^>]+>", …)` strippers with different entity/whitespace behavior. | `work_item_io/columns.py:108`, `gigs_ai/prompt.py:102`, `lib/mentions.py:12` |

D8 is a live XSS exposure independent of this epic and is broken out as its own item (see §9).

### 2.4 Collaboration (GIN-24)

GIN-24 is `in_review` but **nothing is built**: no `yjs`, `y-prosemirror`, `y-websocket` or `@hocuspocus/*` in the lockfile, and no CRDT code in `src/`. What ships under that label is HTTP-polled presence (`src/lib/docs/page-presence.ts:4-23`) with a soft "X is editing" advisory; page editing is last-write-wins through a plain `<textarea>` (`page-detail.tsx:185`).

**Compatibility requirement is therefore forward-only:** nothing exists to be compatible *with*. The obligation is that the canonical value be a ProseMirror document `y-prosemirror` can bind to — which JSON satisfies and an HTML string does not. No GIN-24 code is written or blocked by GIN-297.

---

## 3. The document envelope

```jsonc
{
  "schema": "gigsnano.doc",
  "version": 1,                  // integer, see §7
  "doc": { "type": "doc", "content": [ /* ProseMirror nodes */ ] },
  "provenance": {
    "source": "editor",          // editor | markdown | html-backfill | agent | import
    "migrated_from": "html",     // omitted when authored natively
    "migrated_at": "2026-07-20T00:00:00Z",
    "migrator": "gin-308@1"      // omitted when authored natively
  }
}
```

- The envelope is the whole `jsonb` column value. `doc` is a plain ProseMirror doc — passing `envelope.doc` to `setContent` requires no unwrapping logic beyond the property access.
- `provenance` is advisory metadata for the GIN-308 backfill audit. It is never read by rendering.
- `schema` exists so a future second document type (a dashboard block tree, say) is distinguishable without inspecting content.

---

## 4. Node and mark registry

The normative registry is **`docs/adr/structured-content-schema.json`**, machine-readable and version-controlled beside this ADR. It is the single source for: the TipTap extension set, the JSON validator allow-list, the Markdown serializer/parser tables, and the HTML renderer.

Each entry declares `kind`, `attrs` (with which are identity vs. fallback), `html`, `markdown`, and `status` (`live` = ships today, `planned` = new scope in this epic).

Summary — full detail in the JSON:

**Nodes:** `doc, paragraph, heading, text, hardBreak, codeBlock, blockquote, bulletList, orderedList, listItem, taskList, taskItem, horizontalRule, image, mention, workItemRef*, attachment*, table/tableRow/tableCell/tableHeader*, unknownBlock*`
**Marks:** `bold, italic, strike, underline, code, link, textAlign`†, `unknownMark*`

`*` = `planned`. † `textAlign` is a node attribute in TipTap, not a mark; recorded as an attr on `paragraph`/`heading`.

### 4.1 Identity invariant

Every semantic node stores an immutable domain id **and** a display fallback captured at insert time:

| Node | Identity attr | Fallback attrs |
|---|---|---|
| `mention` | `entityId` (uuid) | `entityType`, `label` |
| `workItemRef` | `workItemId` (uuid) | `code` (`GIN-297`), `title` |
| `attachment` | `fileId` (uuid) | `fileName`, `mimeType`, `size` |
| `image` | `fileId` when internal | `src`, `alt` |

Rendering resolves by id. **If resolution fails the node renders from its fallback attrs in an `unresolved` visual state, and the JSON is written back unchanged.** Losing a target must never mutate the document. This is the invariant GIN-301 tests.

### 4.2 Mermaid

A `codeBlock` with `language: "mermaid"`. **The document stores source text only.** SVG is produced client-side at render (`mermaid.render`, `securityLevel: "strict"`) and is never persisted, never returned by an API, never placed in a JSON column. The backend has no mermaid code today and gains none; SVG upload is already blocked server-side (`features/images/router.py:36-38`).

### 4.3 Unknown content

A reader encountering an unregistered node type wraps it as `unknownBlock { originalType, raw }` and preserves `raw` byte-for-byte on write. Same for marks. This makes an older client non-destructive against a newer document and is what lets §7's compatibility rules hold.

---

## 5. GigsNano Markdown profile

CommonMark + GFM tables, strikethrough and task lists. Fenced code with an info string. Fenced `mermaid` blocks. **No raw embedded HTML** — an HTML block in Markdown input is escaped to a literal text node, never parsed.

Semantic references use plain CommonMark link syntax under a `gigsnano:` URI scheme, so any third-party Markdown renderer degrades to a readable link rather than to noise:

| Object | Markdown | Degrades to |
|---|---|---|
| Mention | `[@Jessy](gigsnano:user/9f18ddde-…)` | `@Jessy` as a link |
| Team mention | `[@Platform](gigsnano:team/…)` | `@Platform` as a link |
| Work-item ref | `[GIN-297](gigsnano:work-item/34db40fe-…)` | `GIN-297` as a link |
| Attachment | `[spec.pdf](gigsnano:file/…)` | filename as a link |
| Internal image | `![alt](gigsnano:file/…)` | standard image |

Round-trip guarantees, asserted by GIN-302's fixtures:

- **JSON → Markdown → JSON is lossless** for every `live` node/mark in the registry.
- **Markdown → JSON → Markdown is stable** (idempotent from the second pass; the first pass normalizes `*em*`→`_em_`-class variance).
- Unsupported constructs (raw HTML, footnotes, definition lists, directives) become literal text and are listed in the profile doc. They do not error and do not silently vanish.

Fixtures live at **`apps/api/tests/fixtures/content/`**. Created by GIN-302.

> **Implementation note (GIN-302, 2026-07-20).** Built as `gigsnano_api.content`. Two design points here proved wrong under test and were corrected in the registry:
>
> - Emphasis serializes as `*`, **not** `_`. CommonMark forbids `_` from opening or closing inside a word, so any mark beginning mid-word was silently dropped. Strike serializes innermost, against the letters, for the same flanking reason.
> - One case is genuinely inexpressible: a run carrying two or more marks immediately followed by a word character (`**~~old~~**new`). It is now on the documented-lossy list with a test pinning it — text survives, marks don't.
>
> `validate_doc` also had to become a *normaliser* (merging adjacent text runs and same-type lists, sorting marks into registry order), because equality on canonical JSON is what GIN-305's divergence detection compares.

---

## 6. Compatibility matrix

`content_format` values: `json` (envelope) · `markdown` (§5 profile) · `html` (legacy inbound only, never a new canonical write).

| Path | Today | Canonical treatment | Migration | Owner |
|---|---|---|---|---|
| `stories.description` | HTML `Text` | `description_json` canonical; `description` kept as derived HTML for legacy readers | GIN-300 dual-write, GIN-308 backfill | GIN-300 |
| `story_comments.body` | HTML `Text` | `body_json` canonical, `body` derived | same | GIN-300 |
| `projects.overview` | HTML `Text` | `overview_json` canonical, `overview` derived | same | GIN-300 |
| `artifacts.content_md` | Markdown | **stays Markdown-canonical** — it is an agent artifact mirrored to disk. Parsed to JSON on demand for rendering only. | none | GIN-302 |
| `pages.content` | HTML-ish, `<textarea>` | out of scope; flagged for a follow-up once the editor is JSON-native | none | — |
| `stickies.body`, `artifact_comments.body` | HTML | phase 2 of GIN-300, same pattern | GIN-308 | GIN-300 |
| `story_activities.old/new_value` | HTML snapshots | **remains HTML** — an immutable audit record of what was displayed. Snapshots taken after cutover store rendered HTML. | none | GIN-306 (render safety, see D8) |
| `releases.changelog_md` | Markdown | stays Markdown | none | — |
| Search (`search/service.py:40`) | ILIKE over HTML | ILIKE over a derived `*_text` plain-text projection | GIN-300 adds the projection | GIN-300 |
| CSV/XLSX export (`work_item_io/columns.py:100`) | regex tag-strip | derived plain text from JSON | GIN-304 | GIN-304 |
| Digest / notification email | escapes interpolated fields; bodies never included | unchanged | none | — |
| BMAD disk mirror (`sync/materializer.py:117`) | interpolates HTML into `.md` (**D5**) | serialize JSON → Markdown | GIN-302 | GIN-302 |
| `bmad/epic_tree.py`, `break_down_epic.py`, `intake/service.py` (**D6**) | raw LLM Markdown into an HTML column | parse Markdown → JSON with `content_format="markdown"` | GIN-304 | GIN-304 |
| MCP Python writes | `_rich_html` sniff | explicit `content_format`, default `markdown` | GIN-304 | GIN-304 |
| MCP TS writes (**D2**) | no conversion at all | same contract as Python, or the package is deprecated | GIN-304 | GIN-304 |
| MCP reads (**D3**) | undocumented, mixed | return `content` + `content_format`; default `markdown` for agents | GIN-304 | GIN-304 |
| Next.js proxy | opaque byte passthrough (`lib/api-proxy.ts:60-66`) | unchanged — correctly format-agnostic | none | — |

**Default outbound format for MCP/agent reads is Markdown.** Agents produce and consume Markdown; handing them HTML is what D3 costs today. Lossless clients opt into `json`.

---

## 7. Schema versioning

- `version` is a single integer. It increments only when a change cannot be absorbed by the unknown-node rule.
- **Additive** (new node, new mark, new optional attr): no version bump. Old readers wrap the new node as `unknownBlock` and preserve it. This is the whole reason §4.3 exists.
- **Breaking** (node removed, attr semantics changed, required attr added): bump `version`. A reader encountering `version > MAX_SUPPORTED` refuses to *edit* and falls back to the derived HTML column read-only; it never writes. Refusing to write is what prevents a rollback window from truncating newer documents.
- Backward: every reader must handle every `version <= MAX_SUPPORTED` it declares, via an upgrade function chain `v_n → v_n+1` applied on read. Upgrades are pure and never persisted implicitly — a document is rewritten at its new version only when the user saves.
- The registry JSON carries `schemaVersion` matching the envelope's `version`. Changing one without the other fails GIN-306's schema test.

---

## 8. Boundaries: sanitization and trust

- **Inbound JSON** is validated against the registry allow-list before persistence: unknown node/mark types are coerced to `unknownBlock`/`unknownMark`, unknown attrs are dropped, `link.href` and `image.src` are scheme-checked (`http`, `https`, `mailto`, `gigsnano` only — no `javascript:`, no `data:` except the existing paste path's constrained image case).
- **Inbound Markdown** is parsed by our parser only; the profile admits no raw HTML, so there is no HTML parse at the boundary at all.
- **Inbound HTML** is accepted only on the legacy/backfill path and is sanitized against the same allow-list before conversion. It is not an accepted format for new writes.
- **Outbound HTML** is generated by our renderer from validated JSON. Because we emit it, it needs no re-sanitization — *except* on paths that render HTML we did not just generate, i.e. legacy columns and `story_activities` snapshots. Those keep a sanitizer (**D8**).

---

## 9. Rollout, flags and rollback

Flags (frontend `NEXT_PUBLIC_*`, backend config, independently switchable):

| Flag | Gates |
|---|---|
| `CONTENT_JSON_WRITE` | editor emits JSON; backend dual-writes `*_json` + derived HTML |
| `CONTENT_JSON_READ` | readers prefer `*_json` over the legacy HTML column |
| `CONTENT_FORMAT_CONTRACT` | API/MCP accept and return explicit `content_format` |
| `CONTENT_MARKDOWN_SOURCE_MODE` | GIN-307's source-mode toggle |

Sequencing: `WRITE` on (dual-write, nobody reads JSON) → backfill → `READ` on for a workspace cohort → contract on → widen.

**Rollback boundary: the derived HTML column is maintained for the entire rollout and is never dropped in this epic.** Turning `CONTENT_JSON_READ` off restores exact prior behavior with zero data movement. Dropping legacy columns is explicitly out of scope for GIN-297 and needs a separate decision after a full retention window.

Telemetry GIN-305 must emit: dual-write divergence rate (JSON→HTML vs. what the editor would have sent), unknown-node encounter count by type, unresolved-reference count by kind, Markdown round-trip failures, backfill parse failures by cause, p95 render/parse latency by document size.

### Dependency order for GIN-297's children

```
GIN-298 (this)  ──►  GIN-299 (agent skills + routing manifest)
                └──►  GIN-300 (json persistence, dual-write)   ──►  GIN-308 (backfill)  ──►  GIN-305 (rollout)
                       ├──►  GIN-301 (semantic nodes)           ──►  GIN-307 (source mode)
                       ├──►  GIN-302 (markdown profile)  ───────┘
                       ├──►  GIN-303 (mermaid)
                       └──►  GIN-304 (API/MCP contracts)
                                                    all ──►  GIN-306 (regression/security/perf)
GIN-309 (router bug) — independent, blocks only agent-routed execution of the above
```

GIN-302 depends on GIN-301 for the semantic node attrs it must serialize. GIN-308 cannot start before GIN-302 (the backfill parses legacy HTML through the same node registry).

---

## 10. Consequences

**Accepted costs**

- Two representations per field for the life of the rollout, with a divergence-detection cost (mitigated: the derived column is generated, never hand-edited, and divergence is a monitored metric).
- `jsonb` payloads are larger than the HTML strings they replace — roughly 2-3× for prose-heavy documents. Acceptable at current volume; GIN-306 sets a size budget and a p95 latency gate.
- Adding tables and an attachment node is genuinely new feature work that the epic framed as preservation. Scoped as `planned` in the registry so it is visible rather than discovered mid-implementation.

**Unblocked**

- GIN-24 becomes implementable without re-doing the content model.
- D1, D2, D3, D4, D5, D6, D7 all close as a consequence of the explicit contract rather than as individual patches.
- Markdown becomes a first-class agent interchange format instead of a guessed one.

**Explicitly not decided here**

- Dropping the legacy HTML columns (needs its own decision post-rollout).
- `pages.content` / the plain-`<textarea>` page editor.
- Whether the TS MCP package (`packages/gigsnano-mcp`) is brought to contract parity or deprecated — GIN-304 decides.
- **D8 (the `history-diff.tsx` raw-HTML sink) is a live XSS exposure unrelated to the canonical-format question and should be filed and fixed independently, not held behind this epic.**
