"""Helpers for offset-paginated API responses ({ items, total, limit, offset })."""


def page_items(body: dict | list) -> list:
    if isinstance(body, dict) and "items" in body:
        return body["items"]
    return body
