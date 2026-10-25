from gigsnano_api.features.foundation import rules
from gigsnano_api.features.foundation.types import ChangedLine


def _lines(*pairs: tuple[str, str]) -> list[ChangedLine]:
    return [ChangedLine(file=f, line=i + 1, text=t) for i, (f, t) in enumerate(pairs)]


def test_flags_hex_color():
    lines = _lines(("Button.tsx", "  const c = '#ff0000';"))
    out = rules.find_hardcoded_colors(lines)
    assert len(out) == 1
    assert out[0].rule == rules.RULE_HARDCODED_COLOR
    assert out[0].file == "Button.tsx"
    assert out[0].line == 1
    assert out[0].blocking is True


def test_flags_rgb_and_tailwind_color():
    lines = _lines(
        ("a.tsx", "background: rgba(0,0,0,.5)"),
        ("b.tsx", '<div className="bg-blue-500" />'),
    )
    out = rules.find_hardcoded_colors(lines)
    assert {v.file for v in out} == {"a.tsx", "b.tsx"}


def test_ignores_token_classes():
    lines = _lines(("c.tsx", '<div className="bg-primary text-muted-foreground" />'))
    assert rules.find_hardcoded_colors(lines) == []


def test_blocking_flag_is_passed_through():
    lines = _lines(("d.tsx", "color: #fff"))
    out = rules.find_hardcoded_colors(lines, blocking=False)
    assert out[0].blocking is False


def test_flags_external_import_not_in_allowlist():
    lines = _lines(("a.tsx", "import moment from 'moment'"))
    out = rules.find_unapproved_libraries(lines, frozenset({"react", "next"}))
    assert len(out) == 1
    assert out[0].rule == rules.RULE_UNAPPROVED_LIB
    assert 'moment' in out[0].detail


def test_allows_approved_and_internal_imports():
    lines = _lines(
        ("a.tsx", "import { useState } from 'react'"),
        ("b.tsx", "import { cn } from '@/lib/utils'"),
        ("c.tsx", "import x from './local'"),
    )
    out = rules.find_unapproved_libraries(lines, frozenset({"react"}))
    assert out == []


def test_scoped_package_id_and_subpath():
    lines = _lines(
        ("a.tsx", "import { z } from '@tanstack/react-query'"),
        ("b.tsx", "import c from 'react-dom/client'"),
    )
    out = rules.find_unapproved_libraries(lines, frozenset({"react-dom"}))
    assert len(out) == 1
    assert '@tanstack/react-query' in out[0].detail


def test_require_call_is_detected():
    lines = _lines(("a.js", "const _ = require('lodash')"))
    out = rules.find_unapproved_libraries(lines, frozenset())
    assert len(out) == 1
    assert 'lodash' in out[0].detail


def test_gate_failed_is_violation():
    out = rules.check_quality_gates({"react-doctor": False}, ("react-doctor",))
    assert len(out) == 1
    assert out[0].rule == rules.RULE_QUALITY_GATE
    assert out[0].file == ""
    assert out[0].line == 0
    assert "failed" in out[0].detail


def test_gate_missing_is_violation():
    out = rules.check_quality_gates({}, ("react-doctor",))
    assert len(out) == 1
    assert "not run" in out[0].detail


def test_gate_passed_is_clean():
    out = rules.check_quality_gates({"react-doctor": True}, ("react-doctor",))
    assert out == []
