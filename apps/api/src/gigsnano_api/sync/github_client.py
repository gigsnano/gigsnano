"""GitHubClient seam (spec §6). Real GitHub App client in production;
FakeGitHubClient in tests and keyless dev — same pattern as LLMProvider."""

import hashlib
import time
from dataclasses import dataclass, field
from typing import Protocol
from uuid import uuid4

import httpx
import jwt
from fastapi import Request


class GitHubConfigError(Exception):
    """Missing/ambiguous installation or unreachable repo."""


def git_blob_sha(content: str) -> str:
    """Git blob SHA-1 — lets sync detect unchanged files without any API call."""
    data = content.encode("utf-8")
    # Git's own blob digest — the algorithm is fixed by git, not a security choice.
    return hashlib.sha1(  # noqa: S324
        b"blob %d\0" % len(data) + data, usedforsecurity=False
    ).hexdigest()


@dataclass(frozen=True)
class RepoInfo:
    full_name: str
    url: str
    default_branch: str


class GitHubClient(Protocol):
    async def resolve_installation(self) -> int: ...

    async def installation_token(self, installation_id: int) -> str: ...

    async def list_repos(self, installation_id: int) -> list[RepoInfo]: ...

    async def commit_files(
        self,
        installation_id: int,
        repo_full_name: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str: ...


@dataclass
class FakeGitHubClient:
    repos: list[RepoInfo] | None = None
    installation_id: int | None = 1
    commits: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.repos is None:
            self.repos = [
                RepoInfo("acme/docs", "https://github.com/acme/docs", "main")
            ]

    async def resolve_installation(self) -> int:
        if self.installation_id is None:
            raise GitHubConfigError("No GitHub App installation found")
        return self.installation_id

    async def installation_token(self, installation_id: int) -> str:
        return "fake-installation-token"

    async def list_repos(self, installation_id: int) -> list[RepoInfo]:
        return list(self.repos or [])

    async def commit_files(
        self,
        installation_id: int,
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


class GitHubAppClient:
    def __init__(self, app_id: str, private_key_pem: str, api_base: str) -> None:
        self.app_id = app_id
        self.private_key_pem = private_key_pem
        self.api_base = api_base.rstrip("/")
        self._token_cache: dict[int, tuple[str, float]] = {}

    def _app_jwt(self) -> str:
        now = int(time.time())
        return jwt.encode(
            {"iat": now - 60, "exp": now + 540, "iss": self.app_id},
            self.private_key_pem,
            algorithm="RS256",
        )

    async def _installation_token(self, installation_id: int) -> str:
        cached = self._token_cache.get(installation_id)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
        async with httpx.AsyncClient(base_url=self.api_base) as http:
            res = await http.post(
                f"/app/installations/{installation_id}/access_tokens",
                headers={"Authorization": f"Bearer {self._app_jwt()}",
                         "Accept": "application/vnd.github+json"},
            )
            res.raise_for_status()
        token = res.json()["token"]
        self._token_cache[installation_id] = (token, time.time() + 3300)
        return token

    async def _api(self, installation_id: int) -> httpx.AsyncClient:
        token = await self._installation_token(installation_id)
        return httpx.AsyncClient(
            base_url=self.api_base,
            headers={"Authorization": f"Bearer {token}",
                     "Accept": "application/vnd.github+json"},
        )

    async def resolve_installation(self) -> int:
        async with httpx.AsyncClient(base_url=self.api_base) as http:
            res = await http.get(
                "/app/installations",
                headers={"Authorization": f"Bearer {self._app_jwt()}",
                         "Accept": "application/vnd.github+json"},
            )
            res.raise_for_status()
        installations = res.json()
        if len(installations) != 1:
            raise GitHubConfigError(
                f"Expected exactly one installation, found {len(installations)}; "
                "pass installation_id explicitly"
            )
        return installations[0]["id"]

    async def installation_token(self, installation_id: int) -> str:
        return await self._installation_token(installation_id)

    async def list_repos(self, installation_id: int) -> list[RepoInfo]:
        async with await self._api(installation_id) as http:
            res = await http.get("/installation/repositories", params={"per_page": 100})
            res.raise_for_status()
        return [
            RepoInfo(r["full_name"], r["html_url"], r["default_branch"])
            for r in res.json()["repositories"]
        ]

    async def commit_files(
        self,
        installation_id: int,
        repo_full_name: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        async with await self._api(installation_id) as http:
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


def build_default_github_client() -> GitHubClient:
    from gigsnano_api.core.config import settings

    if settings.github_app_id and settings.github_app_private_key:
        return GitHubAppClient(
            app_id=settings.github_app_id,
            private_key_pem=settings.github_app_private_key.replace("\\n", "\n"),
            api_base=settings.github_api_base,
        )
    return FakeGitHubClient()


def get_github_client(request: Request) -> GitHubClient:
    return request.app.state.github_client
