"""Invoke Sourcegraph SCIP indexers (parse-only, never `npm install`)."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from gigsnano_api.context_engine.parse import languages
from gigsnano_api.context_engine.parse.precise import scip_pb2

logger = logging.getLogger(__name__)


def scip_command(language: str, repo_dir: Path, out_file: Path) -> list[str]:
    """argv for the SCIP indexer. npm bin names; provisioned in the runner image.
    NEVER includes an install step — resolution is static."""
    if not languages.is_deep(language):
        raise ValueError(f"SCIP not supported for language {language!r}")
    if language == "python":
        return ["scip-python", "index", "--project-name", repo_dir.name,
                 "--output", str(out_file), str(repo_dir)]
    args = ["scip-typescript", "index", "--output", str(out_file)]
    if not (repo_dir / "tsconfig.json").exists():
        # No project config → let scip infer a basic one. When a tsconfig DOES exist we
        # must use it: --infer-tsconfig ignores the real config's `paths` (e.g. "@/*"),
        # so aliased cross-file imports don't resolve and almost no CALLS edges are found.
        args.insert(2, "--infer-tsconfig")
    return args


def run_scip(language: str, repo_dir: Path, out_file: Path, timeout_s: int) -> scip_pb2.Index | None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    argv = scip_command(language, repo_dir, out_file)
    # ponytail: resolve the binary via PATH so Windows finds the .cmd shim (WinError 2 otherwise);
    # a no-op on Linux/prod. Missing binary -> None arg -> FileNotFoundError -> degrade, as before.
    argv[0] = shutil.which(argv[0]) or argv[0]
    try:
        completed = subprocess.run(
            argv,
            cwd=str(repo_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=timeout_s,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as err:
        logger.warning("SCIP %s failed to run: %s", language, err)
        return None
    if completed.returncode != 0 or not out_file.is_file():
        logger.warning("SCIP %s returned %s; degrading to structural-only",
                        language, completed.returncode)
        return None
    index = scip_pb2.Index()
    try:
        index.ParseFromString(out_file.read_bytes())
    except Exception as err:  # noqa: BLE001 — a corrupt/truncated SCIP index (protobuf
        # DecodeError: "Wire format was corrupt") must degrade to structural-only, not
        # crash the whole index run (GIN-371). Same graceful path as a failed tool run,
        # so the index still reaches READY with precise data for the other languages.
        logger.warning("SCIP %s produced an unparseable index (%s); degrading to structural-only",
                        language, err)
        return None
    return index
