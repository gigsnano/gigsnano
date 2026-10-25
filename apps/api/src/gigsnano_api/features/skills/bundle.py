"""Pure, dependency-free skill-bundle helpers (GIN-284).

The digest is content-addressed over per-file hashes (NOT over the .tgz bytes),
so it is independent of gzip framing/mtime — identical content always yields the
same digest, which is what makes publish idempotent and GIN-287 reproducible."""

import gzip
import hashlib
import io
import json
import re
import tarfile

_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def content_digest(files: dict[str, str]) -> str:
    """`sha256:` over the canonical JSON of {path: sha256(content)}, sorted."""
    per_file = {path: _sha256_hex(content) for path, content in files.items()}
    canonical = json.dumps(per_file, sort_keys=True, separators=(",", ":"))
    return "sha256:" + _sha256_hex(canonical)


def build_tgz(files: dict[str, str]) -> bytes:
    """Deterministic .tgz: sorted entries, fixed tar mtime, gzip header mtime
    pinned to 0 (tarfile 'w:gz' would otherwise stamp wall-clock into the gzip
    header, making bytes non-reproducible). Two-step: build an uncompressed tar,
    then gzip it with mtime=0."""
    tar_raw = io.BytesIO()
    with tarfile.open(fileobj=tar_raw, mode="w") as tf:
        for path in sorted(files):
            payload = files[path].encode("utf-8")
            info = tarfile.TarInfo(name=path)
            info.size = len(payload)
            info.mtime = 0
            tf.addfile(info, io.BytesIO(payload))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(tar_raw.getvalue())
    return out.getvalue()


def read_tgz(data: bytes) -> dict[str, str]:
    out: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        for member in tf.getmembers():
            f = tf.extractfile(member)
            out[member.name] = f.read().decode("utf-8") if f else ""
    return out


def parse_skill_md(text: str) -> dict:
    """Extract `name` and `description` from the YAML-ish frontmatter block. A
    minimal line parser — the rich manifest comes from the publish payload."""
    result: dict = {"name": None, "description": None}
    if not text.startswith("---"):
        return result
    end = text.find("\n---", 3)
    block = text[3:end] if end != -1 else ""
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        if key in result:
            result[key] = value.strip()
    return result


def validate(files: dict[str, str], name: str, version: str) -> None:
    if "SKILL.md" not in files:
        raise ValueError("bundle must contain SKILL.md")
    if not _SEMVER.match(version):
        raise ValueError(f"version must be semver (X.Y.Z), got {version!r}")
    meta = parse_skill_md(files["SKILL.md"])
    if meta["name"] and meta["name"] != name:
        raise ValueError(f"SKILL.md name {meta['name']!r} != package name {name!r}")
