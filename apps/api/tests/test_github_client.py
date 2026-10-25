import pytest

from gigsnano_api.sync.github_client import (
    FakeGitHubClient,
    GitHubAppClient,
    GitHubConfigError,
    RepoInfo,
    git_blob_sha,
)


def test_git_blob_sha_matches_git():
    # `printf 'hello\n' | git hash-object --stdin` → ce013625030ba8dba906f756967f9e9ca394464a
    assert git_blob_sha("hello\n") == "ce013625030ba8dba906f756967f9e9ca394464a"


async def test_fake_client_lists_and_commits():
    repo = RepoInfo(full_name="acme/docs", url="https://github.com/acme/docs",
                    default_branch="main")
    fake = FakeGitHubClient(repos=[repo])
    assert await fake.resolve_installation() == 1
    assert (await fake.list_repos(1))[0].full_name == "acme/docs"

    sha = await fake.commit_files(1, "acme/docs", "main",
                                  {"docs/prd.md": "# PRD"}, "sync: docs")
    assert len(sha) == 40
    assert fake.commits[0]["files"] == {"docs/prd.md": "# PRD"}
    assert fake.commits[0]["message"] == "sync: docs"


async def test_fake_client_no_installation():
    fake = FakeGitHubClient(repos=[], installation_id=None)
    with pytest.raises(GitHubConfigError):
        await fake.resolve_installation()


def test_app_client_jwt_shape():
    # RSA test key generated on the fly — asserts the JWT is RS256 with iss=app_id.
    import jwt as pyjwt
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    client = GitHubAppClient(app_id="12345", private_key_pem=pem,
                             api_base="https://api.github.test")
    token = client._app_jwt()
    claims = pyjwt.decode(token, key.public_key(), algorithms=["RS256"],
                          options={"verify_exp": False})
    assert claims["iss"] == "12345"
