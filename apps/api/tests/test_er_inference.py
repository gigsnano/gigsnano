"""GIN-86: infer an ER schema from a repo's ORM model classes when it ships no
committed .dbml/Prisma — SQLAlchemy + Django, read-only over the clone."""

from pathlib import Path

from gigsnano_api.workspace.er_extract import generate_er_schema, infer_dbml_from_models

SQLALCHEMY_MODELS = '''
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import ForeignKey, String


class User(TimestampedBase):
    # No explicit id — the PK is inherited from TimestampedBase. The scan can't
    # see the base, so it must synthesize an `id` PK, else the posts.author_id FK
    # dangles and pydbml rejects the whole schema (regression guard).
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320))


class Post(TimestampedBase):
    __tablename__ = "posts"
    id: Mapped[str] = mapped_column(primary_key=True)
    # Multi-line mapped_column — the FK must still be detected.
    author_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
'''

DJANGO_MODELS = '''
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)


class Article(models.Model):
    title = models.CharField(max_length=200)
    category = models.ForeignKey("Category", on_delete=models.CASCADE)
'''


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    (repo / "app").mkdir(parents=True)
    (repo / "app" / "models.py").write_text(SQLALCHEMY_MODELS, encoding="utf-8")
    (repo / "blog").mkdir()
    (repo / "blog" / "models.py").write_text(DJANGO_MODELS, encoding="utf-8")
    return repo


def test_infers_tables_and_columns(tmp_path):
    dbml = infer_dbml_from_models(_repo(tmp_path))
    assert "Table users {" in dbml
    assert "Table posts {" in dbml
    assert "Table category {" in dbml
    assert "Table article {" in dbml
    assert "email" in dbml


def test_generate_produces_schema_with_relations(tmp_path):
    repo = _repo(tmp_path)
    out = tmp_path / "index"
    schema = generate_er_schema(repo, out)

    names = {t["name"] for t in schema["tables"]}
    assert {"users", "posts", "category", "article"} <= names

    # `users` gets a synthesized `id` PK since none was declared (base-inherited).
    users = next(t for t in schema["tables"] if t["name"] == "users")
    assert any(c["name"] == "id" and c["pk"] for c in users["columns"])

    # FK edges resolved both for SQLAlchemy (ForeignKey) and Django (ForeignKey) —
    # including the FK into a table whose PK was synthesized.
    edges = {(r["from_table"], r["to_table"]) for r in schema["relations"]}
    assert ("posts", "users") in edges
    assert ("article", "category") in edges

    # Persisted to the index dir, not the repo (read-only over the clone).
    assert (out / "er.json").is_file()
    assert not list(repo.rglob("er.json"))


def test_stale_index_dbml_does_not_shadow_inference(tmp_path):
    """The er.dbml we write lives in .graphify-index INSIDE the repo. Detection must
    skip it, else generate reads its own stale output instead of re-inferring."""
    repo = _repo(tmp_path)
    idx = repo / ".graphify-index"  # inside the repo, as in production
    idx.mkdir()
    (idx / "er.dbml").write_text("Table junk {\n  x text\n}", encoding="utf-8")

    schema = generate_er_schema(repo, idx)
    names = {t["name"] for t in schema["tables"]}
    assert "junk" not in names
    assert {"users", "posts", "article"} <= names


def test_no_models_yields_empty(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    (empty / "readme.md").write_text("# hi", encoding="utf-8")
    assert infer_dbml_from_models(empty) == ""
    schema = generate_er_schema(empty, tmp_path / "idx")
    assert schema == {"tables": [], "relations": []}
