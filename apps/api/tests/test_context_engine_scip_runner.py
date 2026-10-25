from pathlib import Path
from types import SimpleNamespace

import pytest

from gigsnano_api.context_engine.parse.precise import runner


def test_scip_command_python_has_no_install():
    cmd = runner.scip_command("python", Path("/repo"), Path("/repo/.scip/index.scip"))
    joined = " ".join(cmd)
    assert "scip-python" in joined
    assert "install" not in joined  # SAFETY: never install tenant deps


def test_scip_command_typescript_infers_tsconfig_no_install():
    cmd = runner.scip_command("typescript", Path("/repo"), Path("/repo/.scip/index.scip"))
    joined = " ".join(cmd)
    assert "scip-typescript" in joined
    assert "--infer-tsconfig" in joined
    assert "install" not in joined


def test_scip_command_rejects_shallow_language():
    with pytest.raises(ValueError):
        runner.scip_command("go", Path("/repo"), Path("/repo/i.scip"))


def test_run_scip_degrades_on_corrupt_index(tmp_path, monkeypatch):
    """GIN-371: a corrupt/truncated .scip (protobuf wire-format error) must degrade
    to structural-only (return None), not raise and sink the whole index run."""
    out_file = tmp_path / ".scip" / "python.scip"
    out_file.parent.mkdir(parents=True)
    out_file.write_bytes(b"\xff\xff not a valid scip index \x00\x01\x02")

    monkeypatch.setattr(runner.shutil, "which", lambda x: x)
    # The SCIP tool "succeeds" (returncode 0) but leaves the corrupt file on disk.
    monkeypatch.setattr(
        runner.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout=b"", stderr=b""),
    )

    assert runner.run_scip("python", tmp_path, out_file, timeout_s=5) is None
