import pytest

from gigsnano_api.email.tokens import (
    EmailTokenError,
    make_email_token,
    pwh_fingerprint,
    verify_email_token,
)


def test_roundtrip():
    tok = make_email_token("reset", "u1", ttl_seconds=3600)
    assert verify_email_token("reset", tok) == "u1"


def test_wrong_purpose_rejected():
    tok = make_email_token("verify", "u1", ttl_seconds=3600)
    with pytest.raises(EmailTokenError):
        verify_email_token("reset", tok)


def test_expired_rejected():
    tok = make_email_token("reset", "u1", ttl_seconds=-1)
    with pytest.raises(EmailTokenError):
        verify_email_token("reset", tok)


def test_fingerprint_mismatch_rejected():
    fp = pwh_fingerprint("hash_a")
    tok = make_email_token("reset", "u1", ttl_seconds=3600, fingerprint=fp)
    with pytest.raises(EmailTokenError):
        verify_email_token("reset", tok, fingerprint=pwh_fingerprint("hash_b"))
