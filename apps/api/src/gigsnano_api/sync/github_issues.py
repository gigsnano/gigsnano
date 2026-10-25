"""GitHub Issues -> GigsNano stories: fetch + pure mapping (GIN-23b). Reuses the
workspace's existing `GitHubConnection` token — no new auth. Split into a thin
httpx fetch and a pure `map_issue` so the mapping is unit-testable off a fixture
payload with no network (mirrors `sync/github_oauth.py`'s api_base pattern)."""

from __future__ import annotations

import httpx

GITHUB_API_BASE = "https://api.github.com"


async def fetch_issues(
    token: str,
    owner: str,
    repo: str,
    *,
    api_base: str = GITHUB_API_BASE,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict]:
    """All issues (open+closed), PRs excluded (GitHub's issues endpoint includes
    them). Paginated, capped at 1000 issues."""
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    issues: list[dict] = []
    async with httpx.AsyncClient(
        base_url=api_base, headers=headers, transport=transport
    ) as http:
        page = 1
        while page <= 10:
            res = await http.get(
                f"/repos/{owner}/{repo}/issues",
                params={"state": "all", "per_page": 100, "page": page},
            )
            res.raise_for_status()
            batch = res.json()
            issues.extend(i for i in batch if "pull_request" not in i)
            if len(batch) < 100:
                break
            page += 1
    return issues


def map_issue(issue: dict) -> dict:
    """Pure mapping: one GitHub issue -> the fields the importer needs. No I/O."""
    labels = [
        label["name"]
        for label in issue.get("labels") or []
        if isinstance(label, dict) and label.get("name")
    ]
    assignee = issue.get("assignee") or {}
    return {
        "number": issue["number"],
        "title": (issue.get("title") or "")[:300],
        "body_markdown": issue.get("body") or "",
        "is_closed": issue.get("state") == "closed",
        "labels": labels,
        "assignee_login": assignee.get("login"),
        "html_url": issue.get("html_url") or "",
    }
