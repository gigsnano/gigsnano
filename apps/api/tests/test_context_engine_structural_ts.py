from pathlib import Path

from gigsnano_api.context_engine.graph.model import CodeGraph
from gigsnano_api.context_engine.parse import structural

TS = '''\
import { helper } from "./util";

export class Service {
  run(): number {
    return helper();
  }
}

export function topLevel(): number {
  return new Service().run();
}

export interface Options {
  verbose: boolean;
}
'''


def test_structural_ts_nodes(tmp_path: Path):
    (tmp_path / "svc.ts").write_text(TS)
    g = CodeGraph()
    structural.parse_file("r1", tmp_path, "svc.ts", g)
    paths = {(n.symbol_path, n.kind) for n in g.nodes.values()}
    assert ("Service", "class") in paths
    assert ("Service.run", "method") in paths
    assert ("topLevel", "function") in paths
    assert ("Options", "interface") in paths


def test_shallow_language_file_node_only(tmp_path: Path):
    (tmp_path / "main.go").write_text("package main\nfunc main() {}\n")
    g = CodeGraph()
    structural.parse_file("r1", tmp_path, "main.go", g)
    # Go is not deep: at minimum the File node exists; call-graph resolution not required.
    assert any(n.kind == "file" and n.symbol_path == "main.go" for n in g.nodes.values())
