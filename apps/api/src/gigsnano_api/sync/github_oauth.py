"""GitHub OAuth App (user-authorization web flow) — the live brownfield auth.

Real path activates when GITHUB_OAUTH_CLIENTID/SECRET are set; FakeGitHubOAuth
serves keyless dev/tests. User access tokens are Fernet-encrypted at rest with
TOKEN_ENCRYPTION_KEY. Repos are listed and repos cloned with the user's token.
"""

from typing import Protocol
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import Request

from gigsnano_api.core.config import settings
from gigsnano_api.sync.github_client import RepoInfo
from gigsnano_api.sync.token_crypto import decrypt_token, encrypt_token  # noqa: F401 — re-export

_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"  # nosec B105 - endpoint URL


class GitHubOAuthError(Exception):
    """Code exchange failed or GitHub returned an error."""


class GitHubOAuth(Protocol):
    def authorize_url(self, state: str) -> str: ...

    async def exchange_code(self, code: str) -> str: ...

    async def list_repos(self, token: str) -> list[RepoInfo]: ...

    async def commit_files(
        self,
        token: str,
        repo_full_name: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str: ...


class FakeGitHubOAuth:
    """Keyless dev/tests: canned repos + a sentinel token, no network."""

    def __init__(self) -> None:
        self.commits: list[dict] = []

    async def exchange_code(self, code: str) -> str:
        return "fake-oauth-token"

    def authorize_url(self, state: str) -> str:
        return f"{_AUTHORIZE_URL}?state={state}&fake=1"

    async def list_repos(self, token: str) -> list[RepoInfo]:
        return [
            RepoInfo("acme/docs", "https://github.com/acme/docs", "main"),
            RepoInfo("acme/mobile-app", "https://github.com/acme/mobile-app", "main"),
        ]

    async def commit_files(
        self,
        token: str,
        repo_full_name: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        sha = uuid4().hex + uuid4().hex[:8]  # 40 hex chars, deterministic length
        self.commits.append(
            {"repo": repo_full_name, "branch": branch, "files": dict(files),
             "message": message, "sha": sha}
        )
        return sha


class RealGitHubOAuth:
    def __init__(
        self, client_id: str, client_secret: str, redirect_uri: str, scopes: str, api_base: str
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.scopes = scopes
        self.api_base = api_base.rstrip("/")

    def authorize_url(self, state: str) -> str:
        query = urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
                "scope": self.scopes,
                "state": state,
            }
        )
        return f"{_AUTHORIZE_URL}?{query}"

    async def exchange_code(self, code: str) -> str:
        async with httpx.AsyncClient() as http:
            res = await http.post(
                _TOKEN_URL,
                headers={"Accept": "application/json"},
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
            )
            res.raise_for_status()
        body = res.json()
        token = body.get("access_token")
        if not token:
            raise GitHubOAuthError(body.get("error_description") or "No access_token returned")
        return token

    async def list_repos(self, token: str) -> list[RepoInfo]:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        repos: list[RepoInfo] = []
        async with httpx.AsyncClient(base_url=self.api_base, headers=headers) as http:
            page = 1
            while page <= 10:  # cap at 1000 repos
                res = await http.get(
                    "/user/repos",
                    params={"per_page": 100, "page": page, "sort": "updated"},
                )
                res.raise_for_status()
                batch = res.json()
                repos.extend(
                    RepoInfo(r["full_name"], r["html_url"], r["default_branch"]) for r in batch
                )
                if len(batch) < 100:
                    break
                page += 1
        return repos

    async def commit_files(
        self,
        token: str,
        repo_full_name: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient(base_url=self.api_base, headers=headers) as http:
            base = f"/repos/{repo_full_name}"
            ref = await http.get(f"{base}/git/ref/heads/{branch}")
            ref.raise_for_status()
            head_sha = ref.json()["object"]["sha"]
            head_commit = await http.get(f"{base}/git/commits/{head_sha}")
            head_commit.raise_for_status()
            base_tree = head_commit.json()["tree"]["sha"]

            tree_entries = []
            for path, content in files.items():
                blob = await http.post(
                    f"{base}/git/blobs", json={"content": content, "encoding": "utf-8"}
                )
                blob.raise_for_status()
                tree_entries.append(
                    {"path": path, "mode": "100644", "type": "blob",
                     "sha": blob.json()["sha"]}
                )
            tree = await http.post(
                f"{base}/git/trees", json={"base_tree": base_tree, "tree": tree_entries}
            )
            tree.raise_for_status()
            commit = await http.post(
                f"{base}/git/commits",
                json={"message": message, "tree": tree.json()["sha"],
                      "parents": [head_sha]},
            )
            commit.raise_for_status()
            commit_sha = commit.json()["sha"]
            update = await http.patch(
                f"{base}/git/refs/heads/{branch}", json={"sha": commit_sha}
            )
            update.raise_for_status()
        return commit_sha


def build_oauth() -> GitHubOAuth:
    if settings.github_oauth_clientid and settings.github_oauth_clientsecret:
        return RealGitHubOAuth(
            client_id=settings.github_oauth_clientid,
            client_secret=settings.github_oauth_clientsecret,
            redirect_uri=settings.github_redirect_uri,
            scopes=settings.github_oauth_scopes,
            api_base=settings.github_api_base,
        )
    return FakeGitHubOAuth()


def get_github_oauth(request: Request) -> GitHubOAuth:
    return request.app.state.github_oauth
