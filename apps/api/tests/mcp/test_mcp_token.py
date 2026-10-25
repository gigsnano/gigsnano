import jwt
import pytest

from gigsnano_api.core.security import create_mcp_token, decode_mcp_token


def test_roundtrip():
    token = create_mcp_token("u1", "c1")
    claims = decode_mcp_token(token)
    assert claims["sub"] == "u1"
    assert claims["aud"] == "mcp"
    assert claims["client_id"] == "c1"


def test_rejects_non_mcp_aud():
    import gigsnano_api.core.security as security

    other = jwt.encode(
        {"sub": "u1", "aud": "app"},
        security.settings.jwt_secret,
        algorithm=security.settings.jwt_algorithm,
    )
    with pytest.raises(jwt.InvalidTokenError):
        decode_mcp_token(other)
