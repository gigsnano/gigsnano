"""GIN-395: the free classifier, and the honesty of its confidence."""

from gigsnano_api.lib.document_classify import DOC_TYPES, classify_document


def test_filename_alone_carries_a_clear_document():
    result = classify_document(file_name="design-system.md", text="Tokens and components.")
    assert result.doc_type == "design_system"
    assert result.confidence >= 0.7
    assert result.signals


def test_headings_classify_when_the_filename_is_useless():
    text = "# Implementation plan\n\n## Phase 0\n\nFoundation.\n\n## Phase 1\n"
    result = classify_document(file_name="doc-2.md", text=text)
    assert result.doc_type == "implementation_plan"


def test_architecture_document_is_recognised():
    text = "# System design\n\nThe tech stack is React Native + FastAPI.\n"
    assert classify_document(file_name="arch.md", text=text).doc_type == "architecture"


def test_unrecognised_document_is_unknown_not_a_guess():
    result = classify_document(file_name="notes.md", text="Met on Tuesday. Coffee was fine.")
    assert result.doc_type == "unknown"
    assert result.confidence == 0.0
    assert result.signals == []


def test_ambiguous_document_reports_low_confidence():
    # Names two types equally — the caller should escalate this one, not trust it.
    text = "# Test plan and deployment\n\ntest plan, test strategy, deployment, runbook\n"
    result = classify_document(file_name="mixed.md", text=text)
    assert result.confidence < 0.7


def test_every_returned_type_is_in_the_vocabulary():
    samples = [
        ("prd.md", "# PRD\n\nUser stories and acceptance criteria."),
        ("api.md", "# API spec\n\nopenapi endpoints"),
        ("erd.md", "# Data model\n\nentity relationship schema"),
        ("notes.md", "nothing in particular"),
    ]
    for file_name, text in samples:
        assert classify_document(file_name=file_name, text=text).doc_type in DOC_TYPES


def test_classification_is_deterministic():
    args = {"file_name": "spec.md", "text": "# Requirements\n\nacceptance criteria"}
    assert classify_document(**args) == classify_document(**args)
