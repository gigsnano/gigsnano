"""DBML-canonical ER extraction: parse DBML -> IErdSchema dict, and detect/build
er.dbml + er.json for a cloned repo (committed .dbml only for MVP; Prisma/SQL
converters are stubbed extension seams)."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Directories that never hold first-party models — skip for speed and noise.
_SKIP_DIRS = {
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".graphify-index",
    "migrations", "alembic", "dist", "build", ".next", ".mypy_cache",
}
# Bound the scan so a huge monorepo can't stall the request.
_MAX_MODEL_FILES = 400


def parse_dbml(dbml: str) -> dict:
    """Parse DBML text into an IErdSchema dict. Returns empty schema on any parse error."""
    try:
        from pydbml import PyDBML
    except Exception:  # noqa: BLE001
        return {"tables": [], "relations": []}
    try:
        # PyDBML.__new__ returns a Database instance at runtime (factory pattern),
        # which pyright can't see through -- type as Any rather than fight it.
        parsed: Any = PyDBML(dbml)
        # The whole extraction is guarded: parse_dbml is a hard "never raise on
        # any input" contract (it backs a user-facing endpoint), so an exotic
        # column/ref attribute shape degrades to an empty schema, not a 500.
        tables = []
        for t in parsed.tables:
            cols = []
            for c in t.columns:
                cols.append(
                    {
                        "name": c.name,
                        "type": str(c.type),
                        "pk": bool(c.pk),
                        "fk": any(c in ref.col1 for ref in parsed.refs),
                        "nullable": not bool(c.not_null),
                    }
                )
            tables.append({"name": t.name, "columns": cols})
    except Exception:  # noqa: BLE001 - malformed/exotic DBML must not raise
        return {"tables": [], "relations": []}
    relations = []
    for ref in parsed.refs:
        try:
            relations.append(
                {
                    "from_table": ref.table1.name,
                    "from_column": ref.col1[0].name,
                    "to_table": ref.table2.name,
                    "to_column": ref.col2[0].name,
                    "cardinality": _cardinality(ref.type),
                }
            )
        except Exception as err:  # noqa: BLE001 - one bad ref must not lose the rest
            logger.debug("skipping unreadable DBML reference: %s", err)
            continue
    return {"tables": tables, "relations": relations}


def _cardinality(dbml_type: str) -> str:
    return {"<": "one-to-many", ">": "many-to-one", "-": "one-to-one", "<>": "many-to-many"}.get(
        str(dbml_type), "many-to-one"
    )


def build_er_schema(repo_dir: Path, out_dir: Path) -> None:
    """Detect a DBML source in repo_dir and write er.dbml (raw) + er.json (parsed)
    into out_dir. No detection -> empty schema. Runs inside the index job's
    to_thread, so it must NEVER raise (a detection/parse hiccup must not mark an
    otherwise-healthy index FAILED) -- detection is fully guarded and degrades to
    the empty schema."""
    try:
        dbml = _detect_dbml(repo_dir)
    except Exception:  # noqa: BLE001 - never fail the index over ER extraction
        logger.exception("ER detection failed for %s; writing empty schema", repo_dir)
        dbml = ""
    schema = parse_dbml(dbml) if dbml else {"tables": [], "relations": []}
    (out_dir / "er.dbml").write_text(dbml, encoding="utf-8")
    (out_dir / "er.json").write_text(json.dumps(schema), encoding="utf-8")


def _detect_dbml(repo_dir: Path) -> str:
    root = repo_dir.resolve()
    # 1) committed .dbml -- skip symlinks and verify the real path stays inside
    #    the clone. Brownfield repos are untrusted (git clone of a user's repo),
    #    so a committed `x.dbml -> /etc/passwd` symlink must not be read/served.
    #    CRITICAL: skip our OWN index dir (.graphify-index/er.dbml) and other
    #    noise -- reading the er.dbml we write would shadow re-generation with a
    #    stale copy (self-poisoning loop).
    for p in sorted(repo_dir.rglob("*.dbml")):
        if any(part in _SKIP_DIRS for part in p.parts):
            continue
        if p.is_symlink() or not p.is_file():
            continue
        try:
            p.resolve().relative_to(root)
        except ValueError:
            continue
        return p.read_text(encoding="utf-8", errors="replace")
    # 2) Prisma schema.prisma -> DBML (node converter; best-effort, skipped if absent)
    prisma = next(
        (
            p
            for p in repo_dir.rglob("schema.prisma")
            if p.is_file() and not any(part in _SKIP_DIRS for part in p.parts)
        ),
        None,
    )
    if prisma is not None:
        converted = _convert_prisma_to_dbml(prisma)
        if converted:
            return converted
    # 3) SQL migrations -> DBML: not implemented for MVP (see _convert_sql_to_dbml).
    return ""


def _convert_prisma_to_dbml(prisma: Path) -> str:
    """Best-effort Prisma->DBML via prisma-dbml-generator; returns '' if node/tool absent.

    Extension seam: shell out (subprocess.run inside asyncio.to_thread, per repo
    convention) only if the repo already has node_modules with the generator;
    otherwise return "". Kept static/MVP -- wire when a repo needs it.
    """
    return ""


def _convert_sql_to_dbml(repo_dir: Path) -> str:
    """Best-effort *.sql migrations -> DBML via sql2dbml; returns '' (not wired for MVP).

    Extension seam alongside _convert_prisma_to_dbml -- wire when a repo needs it.
    """
    return ""


# --------------------------------------------------------------------------- #
# On-demand ORM-model inference (GIN-86): when a repo ships no committed schema,
# analyze its DB-model classes and synthesize DBML, then reuse parse_dbml. Read-
# only over the clone — nothing is written back into the repo. Covers the two
# dominant Python stacks (SQLAlchemy, Django); fully guarded (never raises).
# --------------------------------------------------------------------------- #

_CLASS_HEADER = re.compile(r"^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:", re.M)
_TABLENAME = re.compile(r"__tablename__\s*=\s*[\"']([^\"']+)[\"']")
_SA_COL = re.compile(
    r"^\s*(\w+)\s*(?::\s*Mapped\[([^\]]*)\])?\s*=\s*(?:mapped_column|Column)\((.*)$"
)
_DJ_FIELD = re.compile(r"^\s*(\w+)\s*=\s*models\.(\w+)\((.*)$")
_FK_TARGET = re.compile(r"""ForeignKey\(\s*["']([\w.]+)["']""")
_DJ_REL_FIELDS = {"ForeignKey", "OneToOneField", "ManyToManyField"}
_IDENT = re.compile(r"[^A-Za-z0-9_]")


def _dbml_type(raw: str | None) -> str:
    """Coarse DBML type token from an ORM annotation/field — precision isn't the
    point of the ER view; a clean single token is."""
    if not raw:
        return "text"
    t = raw.strip().split("[")[0].split("(")[0].strip().lower()
    return {
        "str": "varchar", "string": "varchar", "text": "text", "int": "int",
        "integer": "int", "bigint": "bigint", "biginteger": "bigint", "float": "float",
        "numeric": "numeric", "decimal": "decimal", "bool": "boolean", "boolean": "boolean",
        "datetime": "timestamp", "date": "date", "uuid": "uuid", "json": "json",
        "charfield": "varchar", "textfield": "text", "integerfield": "int",
        "booleanfield": "boolean", "datetimefield": "timestamp", "datefield": "date",
        "foreignkey": "int", "onetoonefield": "int", "uuidfield": "uuid",
    }.get(t, "text" if not t.isidentifier() else t)


def _join_continuations(body: str) -> list[str]:
    """Merge parenthesized continuations into one logical line, so a multi-line
    `mapped_column(\n  ForeignKey(...),\n)` is matched whole (else its FK is lost).
    Paren counting ignores string literals — a good-enough approximation."""
    out: list[str] = []
    buf = ""
    depth = 0
    for raw in body.splitlines():
        buf = raw if depth <= 0 else f"{buf} {raw.strip()}"
        depth += raw.count("(") - raw.count(")")
        if depth <= 0:
            out.append(buf)
            buf = ""
            depth = 0
    if buf:
        out.append(buf)
    return out


def _split_classes(source: str) -> list[tuple[str, str, str]]:
    """(class_name, bases, body) for every top-level-ish class in a source file."""
    matches = list(_CLASS_HEADER.finditer(source))
    out: list[tuple[str, str, str]] = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(source)
        out.append((m.group(1), m.group(2) or "", source[m.end() : end]))
    return out


def _sqlalchemy_table(body: str) -> tuple[str, list[dict]] | None:
    tn = _TABLENAME.search(body)
    if not tn:
        return None
    cols: list[dict] = []
    for line in _join_continuations(body):
        m = _SA_COL.match(line)
        if not m:
            continue
        name, mapped_type, args = m.group(1), m.group(2), m.group(3)
        fk = _FK_TARGET.search(args)
        cols.append({
            "name": name,
            "type": _dbml_type(mapped_type or args.split(",")[0]),
            "pk": "primary_key=True" in args,
            "ref": fk.group(1) if fk else None,
        })
    if not cols:
        return None
    # Declarative models almost always inherit an `id` PK from a Base that this
    # file-local scan can't see. Synthesize it when none is declared, so FK refs
    # to `<table>.id` resolve (dangling refs make pydbml reject the whole schema).
    if not any(c["pk"] for c in cols) and not any(c["name"] == "id" for c in cols):
        cols.insert(0, {"name": "id", "type": "int", "pk": True, "ref": None})
    return (tn.group(1), cols)


def _django_table(class_name: str, bases: str, body: str) -> tuple[str, list[dict]] | None:
    if "Model" not in bases:
        return None
    cols: list[dict] = []
    for line in _join_continuations(body):
        m = _DJ_FIELD.match(line)
        if not m:
            continue
        name, field_type, args = m.group(1), m.group(2), m.group(3)
        ref = None
        if field_type in _DJ_REL_FIELDS:
            target = re.match(r"""\s*["']?(\w[\w.]*)["']?""", args)
            if target:
                ref = f"{target.group(1).split('.')[-1].lower()}.id"
        cols.append({
            "name": name,
            "type": _dbml_type(field_type),
            "pk": "primary_key=True" in args,
            "ref": ref,
        })
    if not cols:
        return None
    # Django's implicit auto PK when the model declares none.
    if not any(c["pk"] for c in cols):
        cols.insert(0, {"name": "id", "type": "int", "pk": True, "ref": None})
    return (class_name.lower(), cols)


def _iter_python_files(repo_dir: Path):
    count = 0
    for p in sorted(repo_dir.rglob("*.py")):
        if any(part in _SKIP_DIRS for part in p.parts):
            continue
        if not p.is_file() or p.is_symlink():
            continue
        yield p
        count += 1
        if count >= _MAX_MODEL_FILES:
            return


def _emit_dbml(tables: dict[str, list[dict]]) -> str:
    """Render collected tables to DBML. Only emit a ref when BOTH the target table
    and its referenced column exist — a dangling ref makes pydbml reject the whole
    schema, so drop those edges rather than lose every table."""
    columns_by_table = {
        t: {_IDENT.sub("_", c["name"]) for c in cols} for t, cols in tables.items()
    }
    blocks: list[str] = []
    for table, cols in tables.items():
        lines = [f"Table {table} {{"]
        for c in cols:
            name = _IDENT.sub("_", c["name"])
            if not name:
                continue
            settings = []
            if c["pk"]:
                settings.append("pk")
            ref = c.get("ref")
            if ref and "." in ref:
                target_table, _, target_col = ref.partition(".")
                if target_col in columns_by_table.get(target_table, set()):
                    settings.append(f"ref: > {target_table}.{target_col}")
            suffix = f" [{', '.join(settings)}]" if settings else ""
            lines.append(f"  {name} {c['type']}{suffix}")
        lines.append("}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def infer_dbml_from_models(repo_dir: Path) -> str:
    """Scan a repo's SQLAlchemy/Django model classes and synthesize DBML. Read-only;
    returns '' when no models are found. Guarded — never raises."""
    tables: dict[str, list[dict]] = {}
    for path in _iter_python_files(repo_dir):
        # Per-file guard: one exotic model file must not sink the whole scan.
        try:
            source = path.read_text(encoding="utf-8", errors="replace")
            if "__tablename__" not in source and "models.Model" not in source:
                continue
            for class_name, bases, body in _split_classes(source):
                found = _sqlalchemy_table(body) or _django_table(class_name, bases, body)
                if found and found[0] not in tables:
                    tables[found[0]] = found[1]
        except Exception:  # noqa: BLE001 - inference is best-effort per file
            logger.exception("ORM model inference failed for %s", path)
            continue
    return _emit_dbml(tables) if tables else ""


def detect_or_infer_dbml(repo_dir: Path) -> str:
    """Committed schema first (cheap, exact); fall back to ORM-model inference."""
    dbml = _detect_dbml(repo_dir)
    return dbml or infer_dbml_from_models(repo_dir)


def generate_er_schema(repo_dir: Path, out_dir: Path) -> dict:
    """On-demand ER generation (GIN-86): detect a committed schema or infer one from
    the code's DB models, persist er.dbml + er.json into the INDEX dir (never the
    repo), and return the parsed schema. Guarded — degrades to an empty schema."""
    try:
        dbml = detect_or_infer_dbml(repo_dir)
    except Exception:  # noqa: BLE001
        logger.exception("ER generation failed for %s", repo_dir)
        dbml = ""
    schema = parse_dbml(dbml) if dbml else {"tables": [], "relations": []}
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "er.dbml").write_text(dbml, encoding="utf-8")
    (out_dir / "er.json").write_text(json.dumps(schema), encoding="utf-8")
    return schema
