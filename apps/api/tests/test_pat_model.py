from gigsnano_api.models.tokens import generate_token, hash_token


def test_generate_and_hash_roundtrip():
    plaintext, digest = generate_token()
    assert plaintext.startswith("gnp_")
    assert digest == hash_token(plaintext)
    assert hash_token(plaintext) != plaintext  # stored value is the hash, never plaintext
