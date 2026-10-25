"""GigsQL parser, AST, and canonical normalizer (GIN-138).

Plane/Jira-style filter language for Views and story queries. Reads GIN-166
colon shorthand and emits canonical syntax on normalization.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from gigsnano_api.models import EStoryPriority, EStoryStatus, EStoryType

GigsQLNode = "GigsQLLogical | GigsQLPredicate | GigsQLIsNull | GigsQLIn | GigsQLBetween"

WORK_ITEM_DOMAIN = "work_item"
CODE_ANALYSIS_DOMAIN = "code_analysis"

# Canonical field names exposed in grammar.
WORK_ITEM_FIELDS = frozenset(
    {
        "status",
        "priority",
        "type",
        "assignee",
        "label",
        "cycle",
        "module",
        "title",
        "startDate",
        "dueDate",
        "createdAt",
        "updatedAt",
    }
)
CODE_ANALYSIS_FIELDS = frozenset({"severity", "rule", "file", "author"})
ALL_FIELDS = WORK_ITEM_FIELDS | CODE_ANALYSIS_FIELDS

# GIN-166 colon shorthand aliases -> canonical names.
COLON_FIELD_ALIASES = {
    "due": "dueDate",
    "created": "createdAt",
}

SELECT_FIELDS = frozenset(
    {"status", "priority", "type", "assignee", "label", "cycle", "module"}
)
TEXT_FIELDS = frozenset({"title"})
DATE_FIELDS = frozenset({"startDate", "dueDate", "createdAt", "updatedAt"})

SELECT_OPS = frozenset({"=", "!=", "in", "not in", "is null"})
TEXT_OPS = frozenset({"=", "!=", "~"})
DATE_OPS = frozenset({"=", "!=", "<", "<=", ">", ">=", "between", "is null"})
CODE_ANALYSIS_OPS = frozenset({"=", "!=", "in", "not in", "is null"})

_STATUSES = {s.value for s in EStoryStatus}
_PRIORITIES = {p.value for p in EStoryPriority}
_TYPES = {t.value for t in EStoryType}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_CANONICAL_MARKERS = re.compile(
    r"\b(AND|OR|IN|NOT|IS|NULL|BETWEEN)\b|[=~]|!=|>=|<=|[()]",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class GigsQLLogical:
    kind: Literal["AND", "OR"]
    children: tuple[GigsQLNode, ...]


@dataclass(frozen=True, slots=True)
class GigsQLPredicate:
    field: str
    operator: str
    value: str
    domain: str = WORK_ITEM_DOMAIN


@dataclass(frozen=True, slots=True)
class GigsQLIsNull:
    field: str
    domain: str = WORK_ITEM_DOMAIN


@dataclass(frozen=True, slots=True)
class GigsQLIn:
    field: str
    values: tuple[str, ...]
    negated: bool = False
    domain: str = WORK_ITEM_DOMAIN


@dataclass(frozen=True, slots=True)
class GigsQLBetween:
    field: str
    start: str
    end: str
    domain: str = WORK_ITEM_DOMAIN


def parse_gigsql(query: str) -> GigsQLNode:
    q = query.strip()
    if not q:
        raise ValueError("Expected a GigsQL expression.")
    if _is_colon_shorthand(q):
        return _parse_colon_shorthand(q)
    return _Parser(_tokenize(q)).parse_expr()


def normalize_gigsql(query: str | None) -> str:
    q = (query or "").strip()
    if not q:
        return ""
    node = parse_gigsql(q)
    reject_code_analysis_domain(node)
    return _serialize(node)


def _field_domain(field: str) -> str:
    if field in CODE_ANALYSIS_FIELDS:
        return CODE_ANALYSIS_DOMAIN
    if field in WORK_ITEM_FIELDS:
        return WORK_ITEM_DOMAIN
    raise ValueError(
        f'Unknown filter field "{field}". Supported work-item fields: '
        f'{", ".join(sorted(WORK_ITEM_FIELDS))}.'
    )


def _canonical_field(name: str) -> str:
    lowered = name.strip().lower()
    if lowered in COLON_FIELD_ALIASES:
        return COLON_FIELD_ALIASES[lowered]
    # Preserve camelCase canonical names; normalize simple lowercase fields.
    for field in ALL_FIELDS:
        if field.lower() == lowered:
            return field
    raise ValueError(
        f'Unknown filter field "{name}". Supported work-item fields: '
        f'{", ".join(sorted(WORK_ITEM_FIELDS))}.'
    )


def _allowed_ops(field: str) -> frozenset[str]:
    if field in CODE_ANALYSIS_FIELDS:
        return CODE_ANALYSIS_OPS
    if field in SELECT_FIELDS:
        return SELECT_OPS
    if field in TEXT_FIELDS:
        return TEXT_OPS
    if field in DATE_FIELDS:
        return DATE_OPS
    raise ValueError(f'Unknown filter field "{field}".')


def _validate_value(field: str, value: str) -> None:
    if field == "status" and value not in _STATUSES:
        raise ValueError(
            f'Unknown status "{value}". Supported: {", ".join(sorted(_STATUSES))}.'
        )
    if field == "priority" and value not in _PRIORITIES:
        raise ValueError(
            f'Unknown priority "{value}". Supported: {", ".join(sorted(_PRIORITIES))}.'
        )
    if field == "type" and value not in _TYPES:
        raise ValueError(
            f'Unknown type "{value}". Supported: {", ".join(sorted(_TYPES))}.'
        )
    if field in DATE_FIELDS and not _DATE.match(value):
        raise ValueError(f'"{field}" must be YYYY-MM-DD, got "{value}".')


def _validate_operator(field: str, operator: str) -> None:
    allowed = _allowed_ops(field)
    if operator not in allowed:
        raise ValueError(
            f'Operator "{operator}" is not supported for field "{field}". '
            f"Supported: {', '.join(sorted(allowed))}."
        )


def _is_colon_shorthand(query: str) -> bool:
    if _CANONICAL_MARKERS.search(query):
        return False
    tokens = query.split()
    if not tokens:
        return False
    for raw in tokens:
        field, sep, value = raw.partition(":")
        if not sep or not field.strip() or not value.strip():
            return False
    return True


def _select_field_node(field: str, values: list[str], domain: str) -> GigsQLNode:
    for value in values:
        _validate_value(field, value)
    if len(values) == 1:
        _validate_operator(field, "=")
        return GigsQLPredicate(field, "=", values[0], domain)
    _validate_operator(field, "in")
    return GigsQLIn(field, tuple(values), domain=domain)


def _parse_colon_shorthand(query: str) -> GigsQLNode:
    # GIN-166: repeated same-field colon terms are OR (multi-select); different fields AND.
    select_values: dict[str, list[str]] = {}
    title_value: str | None = None
    date_between: dict[str, GigsQLBetween] = {}
    date_equals: dict[str, str] = {}
    field_order: list[str] = []

    def note_field(field: str) -> None:
        if field not in field_order:
            field_order.append(field)

    for raw in query.split():
        field_raw, sep, value_raw = raw.partition(":")
        if not sep or not field_raw.strip() or not value_raw.strip():
            raise ValueError(f'Expected "field:value", got "{raw}".')
        field = _canonical_field(field_raw)
        value = value_raw.strip()
        domain = _field_domain(field)

        if field in DATE_FIELDS and ".." in value:
            start, _, end = value.partition("..")
            start, end = start.strip(), end.strip()
            if not _DATE.match(start) or not _DATE.match(end):
                raise ValueError(
                    f'"{field}" range must be YYYY-MM-DD..YYYY-MM-DD.'
                )
            _validate_operator(field, "between")
            date_between[field] = GigsQLBetween(field, start, end, domain)
            note_field(field)
            continue

        if field == "title":
            title_value = value
            note_field(field)
            continue

        if field in DATE_FIELDS:
            _validate_value(field, value)
            date_equals[field] = value
            note_field(field)
            continue

        if field in SELECT_FIELDS:
            select_values.setdefault(field, []).append(value)
            note_field(field)
            continue

        raise ValueError(f'Unknown filter field "{field}".')

    predicates: list[GigsQLNode] = []
    for field in field_order:
        if field in select_values:
            domain = _field_domain(field)
            predicates.append(_select_field_node(field, select_values[field], domain))
        elif field == "title" and title_value is not None:
            _validate_operator("title", "~")
            predicates.append(
                GigsQLPredicate("title", "~", title_value, WORK_ITEM_DOMAIN)
            )
        elif field in date_between:
            predicates.append(date_between[field])
        elif field in date_equals:
            domain = _field_domain(field)
            _validate_operator(field, "=")
            predicates.append(
                GigsQLPredicate(field, "=", date_equals[field], domain)
            )

    if len(predicates) == 1:
        return predicates[0]
    return GigsQLLogical("AND", tuple(predicates))


def reject_code_analysis_domain(node: GigsQLNode) -> None:
    """Reject code-analysis AST nodes on work-item filter surfaces."""
    if isinstance(node, GigsQLLogical):
        for child in node.children:
            reject_code_analysis_domain(child)
        return
    domain = getattr(node, "domain", WORK_ITEM_DOMAIN)
    if domain == CODE_ANALYSIS_DOMAIN:
        raise ValueError(
            f'Field "{node.field}" is reserved for code-analysis filters and '
            "cannot be used in work-item filters."
        )


def _serialize(node: GigsQLNode) -> str:
    if isinstance(node, GigsQLLogical):
        parts = [_serialize(child) for child in node.children]
        if len(parts) == 1:
            return parts[0]
        joiner = f" {node.kind} "
        rendered = joiner.join(
            f"({part})" if _needs_parens(part, node.kind) else part for part in parts
        )
        return rendered

    if isinstance(node, GigsQLPredicate):
        return f"{node.field} {node.operator} {node.value}"

    if isinstance(node, GigsQLIsNull):
        return f"{node.field} is null"

    if isinstance(node, GigsQLIn):
        values = ", ".join(node.values)
        keyword = "not in" if node.negated else "in"
        return f"{node.field} {keyword} ({values})"

    if isinstance(node, GigsQLBetween):
        return f"{node.field} between {node.start} and {node.end}"

    raise TypeError(f"Unsupported AST node: {type(node)!r}")


def _needs_parens(part: str, parent_kind: Literal["AND", "OR"]) -> bool:
    if parent_kind == "AND":
        return " OR " in part
    return " AND " in part


# --- Tokenizer ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Token:
    kind: str
    value: str


def _tokenize(query: str) -> list[_Token]:
    tokens: list[_Token] = []
    i = 0
    n = len(query)

    while i < n:
        ch = query[i]
        if ch.isspace():
            i += 1
            continue

        if ch == "(":
            tokens.append(_Token("LPAREN", "("))
            i += 1
            continue
        if ch == ")":
            tokens.append(_Token("RPAREN", ")"))
            i += 1
            continue
        if ch == ",":
            tokens.append(_Token("COMMA", ","))
            i += 1
            continue

        two = query[i : i + 2]
        if two in {"!=", "<=", ">="}:
            tokens.append(_Token("OP", two))
            i += 2
            continue
        if ch in {"=", "~", "<", ">"}:
            tokens.append(_Token("OP", ch))
            i += 1
            continue

        if ch in {'"', "'"}:
            quote = ch
            j = i + 1
            while j < n and query[j] != quote:
                j += 1
            if j >= n:
                raise ValueError("Unterminated string literal.")
            tokens.append(_Token("STRING", query[i + 1 : j]))
            i = j + 1
            continue

        if ch.isdigit():
            j = i
            while j < n and (query[j].isdigit() or query[j] == "-"):
                j += 1
            literal = query[i:j]
            if not _DATE.match(literal):
                raise ValueError(f'Expected YYYY-MM-DD date, got "{literal}".')
            tokens.append(_Token("DATE", literal))
            i = j
            continue

        if ch.isalpha() or ch == "_":
            j = i
            while j < n and (query[j].isalnum() or query[j] in {"_", "-"}):
                j += 1
            word = query[i:j]
            upper = word.upper()
            if upper in {"AND", "OR", "IN", "NOT", "IS", "NULL", "BETWEEN"}:
                tokens.append(_Token(upper, upper.lower() if upper != "NULL" else "null"))
            else:
                tokens.append(_Token("IDENT", word))
            i = j
            continue

        raise ValueError(f'Unexpected character "{ch}" in GigsQL expression.')

    return tokens


# --- Recursive-descent parser --------------------------------------------------


class _Parser:
    def __init__(self, tokens: list[_Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    def parse_expr(self) -> GigsQLNode:
        node = self._parse_or()
        if self._peek() is not None:
            raise ValueError("Unexpected tokens after expression.")
        return node

    def _parse_or(self) -> GigsQLNode:
        nodes = [self._parse_and()]
        while self._match("OR"):
            nodes.append(self._parse_and())
        if len(nodes) == 1:
            return nodes[0]
        return GigsQLLogical("OR", tuple(nodes))

    def _parse_and(self) -> GigsQLNode:
        nodes = [self._parse_primary()]
        while self._match("AND"):
            nodes.append(self._parse_primary())
        if len(nodes) == 1:
            return nodes[0]
        return GigsQLLogical("AND", tuple(nodes))

    def _parse_primary(self) -> GigsQLNode:
        if self._match("LPAREN"):
            node = self._parse_or()
            if not self._match("RPAREN"):
                raise ValueError('Expected ")" after grouped expression.')
            return node
        return self._parse_predicate()

    def _parse_predicate(self) -> GigsQLNode:
        field_tok = self._expect("IDENT")
        field = _canonical_field(field_tok.value)
        domain = _field_domain(field)

        if self._match("IS"):
            if not self._match("NULL"):
                raise ValueError('"is" must be followed by "null".')
            _validate_operator(field, "is null")
            return GigsQLIsNull(field, domain)

        if self._match("NOT"):
            if not self._match("IN"):
                raise ValueError('"not" must be followed by "in".')
            values = self._parse_value_list()
            _validate_operator(field, "not in")
            for value in values:
                _validate_value(field, value)
            return GigsQLIn(field, values, negated=True, domain=domain)

        if self._match("IN"):
            values = self._parse_value_list()
            _validate_operator(field, "in")
            for value in values:
                _validate_value(field, value)
            return GigsQLIn(field, values, domain=domain)

        if self._match("BETWEEN"):
            start = self._parse_scalar()
            if not self._match("AND"):
                raise ValueError('"between" must be followed by two dates joined with "and".')
            end = self._parse_scalar()
            _validate_operator(field, "between")
            _validate_value(field, start)
            _validate_value(field, end)
            return GigsQLBetween(field, start, end, domain)

        op_tok = self._expect("OP")
        operator = op_tok.value
        value = self._parse_scalar()
        _validate_operator(field, operator)
        _validate_value(field, value)
        return GigsQLPredicate(field, operator, value, domain)

    def _parse_value_list(self) -> tuple[str, ...]:
        if not self._match("LPAREN"):
            raise ValueError('Expected "(" after "in".')
        if self._match("RPAREN"):
            raise ValueError("Expected at least one value in list.")
        values = [self._parse_scalar()]
        while self._match("COMMA"):
            values.append(self._parse_scalar())
        if not self._match("RPAREN"):
            raise ValueError('Expected ")" to close value list.')
        return tuple(values)

    def _parse_scalar(self) -> str:
        tok = self._peek()
        if tok is None:
            raise ValueError("Expected a value.")
        if tok.kind in {"IDENT", "STRING", "DATE"}:
            self._advance()
            return tok.value
        raise ValueError(f"Expected a value, got {tok.value!r}.")

    def _peek(self) -> _Token | None:
        if self._pos >= len(self._tokens):
            return None
        return self._tokens[self._pos]

    def _advance(self) -> _Token:
        tok = self._peek()
        if tok is None:
            raise ValueError("Unexpected end of expression.")
        self._pos += 1
        return tok

    def _match(self, kind: str) -> bool:
        tok = self._peek()
        if tok is None:
            return False
        if tok.kind == kind:
            self._pos += 1
            return True
        return False

    def _expect(self, kind: str) -> _Token:
        tok = self._peek()
        if tok is None or tok.kind != kind:
            raise ValueError(f"Expected {kind.lower()}, got end of expression.")
        self._pos += 1
        return tok
