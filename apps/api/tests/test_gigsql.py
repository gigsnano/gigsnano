"""GIN-138: GigsQL parser, AST, and canonical normalizer."""

import pytest

from gigsnano_api.features.views.gigsql import (
    GigsQLBetween,
    GigsQLIn,
    GigsQLIsNull,
    GigsQLLogical,
    GigsQLPredicate,
    normalize_gigsql,
    parse_gigsql,
)


def test_parse_priority_and_status_in():
    node = parse_gigsql("priority = high AND status in (todo, in_progress)")
    assert isinstance(node, GigsQLLogical)
    assert node.kind == "AND"
    assert len(node.children) == 2

    left, right = node.children
    assert isinstance(left, GigsQLPredicate)
    assert left.field == "priority"
    assert left.operator == "="
    assert left.value == "high"

    assert isinstance(right, GigsQLIn)
    assert right.field == "status"
    assert right.negated is False
    assert right.values == ("todo", "in_progress")


def test_parse_assignee_or_is_null():
    node = parse_gigsql("assignee = me OR assignee is null")
    assert isinstance(node, GigsQLLogical)
    assert node.kind == "OR"
    assert len(node.children) == 2

    left, right = node.children
    assert isinstance(left, GigsQLPredicate)
    assert left.field == "assignee"
    assert left.operator == "="
    assert left.value == "me"

    assert isinstance(right, GigsQLIsNull)
    assert right.field == "assignee"


def test_parse_grouped_title_and_due_date():
    node = parse_gigsql("(title ~ login) AND dueDate >= 2026-07-01")
    assert isinstance(node, GigsQLLogical)
    assert node.kind == "AND"

    left, right = node.children
    assert isinstance(left, GigsQLPredicate)
    assert left.field == "title"
    assert left.operator == "~"
    assert left.value == "login"

    assert isinstance(right, GigsQLPredicate)
    assert right.field == "dueDate"
    assert right.operator == ">="
    assert right.value == "2026-07-01"


def test_normalize_colon_shorthand_to_canonical():
    assert (
        normalize_gigsql("status:todo priority:high")
        == "status = todo AND priority = high"
    )


def test_normalize_repeated_same_field_to_in():
    assert (
        normalize_gigsql("status:todo status:in_progress")
        == "status in (todo, in_progress)"
    )
    assert (
        normalize_gigsql("status:todo status:in_progress priority:high assignee:me")
        == "status in (todo, in_progress) AND priority = high AND assignee = me"
    )
    assert (
        normalize_gigsql("cycle:c1 cycle:c2 module:m1 type:story")
        == "cycle in (c1, c2) AND module = m1 AND type = story"
    )


def test_normalize_rejects_code_analysis_for_work_item_views():
    with pytest.raises(ValueError, match="severity"):
        normalize_gigsql("severity = high")
    with pytest.raises(ValueError, match="severity"):
        normalize_gigsql("severity:high")


def test_normalize_colon_date_range():
    assert (
        normalize_gigsql("due:2026-07-01..2026-07-31")
        == "dueDate between 2026-07-01 and 2026-07-31"
    )


def test_normalize_colon_title_to_contains():
    assert normalize_gigsql("title:login") == "title ~ login"


def test_invalid_operator_for_field_raises():
    with pytest.raises(ValueError, match="title"):
        parse_gigsql("title in (login)")


def test_invalid_type_raises():
    with pytest.raises(ValueError, match='Unknown type "chore"'):
        parse_gigsql("type = chore")
    with pytest.raises(ValueError, match='Unknown type "chore"'):
        parse_gigsql("type:chore")


def test_code_analysis_field_parses_with_domain_metadata():
    node = parse_gigsql("severity = high")
    assert isinstance(node, GigsQLPredicate)
    assert node.field == "severity"
    assert node.operator == "="
    assert node.value == "high"
    assert node.domain == "code_analysis"


def test_normalize_canonical_round_trip():
    query = "priority = high AND status in (todo, in_progress)"
    assert normalize_gigsql(query) == query


def test_normalize_empty():
    assert normalize_gigsql("") == ""
    assert normalize_gigsql(None) == ""
    assert normalize_gigsql("   ") == ""
