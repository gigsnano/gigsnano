import pytest

from gigsnano_api.features.skills.bundle import (
    build_tgz,
    content_digest,
    parse_skill_md,
    read_tgz,
    validate,
)

SKILL_MD = "---\nname: verification-gate\ndescription: Run the right checks.\n---\n\n# Body\n"
FILES = {"SKILL.md": SKILL_MD, "scripts/run.sh": "echo hi\n"}


def test_digest_is_stable_and_content_addressed():
    d1 = content_digest(FILES)
    d2 = content_digest(dict(reversed(list(FILES.items()))))  # order must not matter
    assert d1 == d2
    assert d1.startswith("sha256:") and len(d1) == 71


def test_digest_changes_when_content_changes():
    changed = {**FILES, "scripts/run.sh": "echo bye\n"}
    assert content_digest(changed) != content_digest(FILES)


def test_tgz_roundtrips_and_contains_skill_md():
    data = build_tgz(FILES)
    assert isinstance(data, bytes) and data
    assert read_tgz(data) == FILES


def test_build_tgz_is_deterministic():
    assert build_tgz(FILES) == build_tgz(FILES)


def test_parse_skill_md_reads_frontmatter():
    m = parse_skill_md(SKILL_MD)
    assert m["name"] == "verification-gate"
    assert m["description"] == "Run the right checks."


def test_validate_rejects_missing_skill_md():
    with pytest.raises(ValueError, match="SKILL.md"):
        validate({"scripts/run.sh": "x"}, "verification-gate", "1.0.0")


def test_validate_rejects_bad_semver():
    with pytest.raises(ValueError, match="semver"):
        validate(FILES, "verification-gate", "1.0")


def test_validate_rejects_name_mismatch():
    with pytest.raises(ValueError, match="name"):
        validate(FILES, "something-else", "1.0.0")


def test_validate_accepts_good_bundle():
    validate(FILES, "verification-gate", "1.0.0")  # no raise
