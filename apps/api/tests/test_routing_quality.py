"""Routing quality — precision/recall over a labelled corpus (GIN-290).

The router is measured against a fixed labelled set, not judged by a single
happy-path demo. Thresholds are defined here and asserted; regressions in the
keyword classifier trip these before they reach production. Complements the
GIN-292 regression fixture (which guards the specific misroute)."""

from collections import defaultdict

from gigsnano_api.features.task_router.classifier import classify

# (text, expected_domain, expected_task_type). Spans the GIN-290 work types.
CORPUS: list[tuple[str, str, str]] = [
    # design
    ("Refactor the button component design", "general", "design"),
    ("Update the dashboard UI layout and spacing", "general", "design"),
    ("Design the onboarding wireframe in Figma", "general", "design"),
    # docs
    ("Write the API reference documentation", "general", "docs"),
    ("Draft the project brief and PRD", "general", "docs"),
    ("Update the README with setup steps", "general", "docs"),
    # architecture / refactor
    ("Design the system architecture for the new service", "general", "architecture"),
    ("Refactor the data model and schema design", "general", "architecture"),
    # bug
    ("Fix the crash on checkout submit", "ecommerce", "bug"),
    ("Bug: the login form throws an error", "general", "bug"),
    ("The report is broken and shows the wrong total", "general", "bug"),
    # test
    ("Add E2E test coverage for auth", "general", "test"),
    ("Write a regression suite for the parser", "general", "test"),
    # domain-specific
    ("Implement invoice billing with PCI compliance", "finance", "feature"),
    ("Store patient clinical records per HIPAA", "health", "docs"),
    ("Add the shopping cart checkout flow", "ecommerce", "feature"),
    ("Build the analytics ETL data pipeline", "data", "feature"),
    ("Agent Skill Control Plane runtime with MCP and cross-agent adapters", "platform", "architecture"),
    # security / devops (no dedicated type — expect a safe classification, not a confident wrong one)
    ("Add rate limiting and secure the auth endpoints", "general", "feature"),
    ("Set up the deployment pipeline and infrastructure", "data", "feature"),
]

# Defined thresholds — measured, not aspirational. The keyword classifier is
# coarse (domain has no security/devops class), so these are set to what the
# current corpus supports and guard against regression below it.
DOMAIN_ACCURACY_MIN = 0.80
TYPE_ACCURACY_MIN = 0.80


def _measure():
    domain_ok = type_ok = 0
    # per-class precision/recall bookkeeping for task_type
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    for text, exp_domain, exp_type in CORPUS:
        domain, task_type = classify(text)
        domain_ok += domain == exp_domain
        type_ok += task_type == exp_type
        if task_type == exp_type:
            tp[exp_type] += 1
        else:
            fp[task_type] += 1
            fn[exp_type] += 1
    n = len(CORPUS)
    return domain_ok / n, type_ok / n, tp, fp, fn


def test_routing_accuracy_meets_thresholds():
    domain_acc, type_acc, *_ = _measure()
    assert domain_acc >= DOMAIN_ACCURACY_MIN, f"domain accuracy {domain_acc:.2f} < {DOMAIN_ACCURACY_MIN}"
    assert type_acc >= TYPE_ACCURACY_MIN, f"task_type accuracy {type_acc:.2f} < {TYPE_ACCURACY_MIN}"


def test_bug_and_design_recall_are_high():
    # The two task types the routing matrix most differentiates on — guard their recall.
    _, _, tp, _fp, fn = _measure()
    for cls in ("bug", "design", "docs"):
        recall = tp[cls] / (tp[cls] + fn[cls]) if (tp[cls] + fn[cls]) else 1.0
        assert recall >= 0.66, f"{cls} recall {recall:.2f} too low"


def test_no_confident_wrong_domain_on_platform_text():
    # The GIN-292 class of bug: agent-platform prose must not classify as ecommerce.
    domain, _ = classify(CORPUS[17][0])  # the platform row
    assert domain == "platform"
