"""tree-sitter structural pass: symbol nodes + CONTAINS + raw IMPORTS, all languages."""

from __future__ import annotations

from pathlib import Path

from tree_sitter_language_pack import get_parser

from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id
from gigsnano_api.context_engine.parse.languages import detect

# tree-sitter node types that introduce a nameable symbol, per language family.
_PY_DEFS = {"class_definition": "class", "function_definition": "function"}
_TS_DEFS = {
    "class_declaration": "class",
    "function_declaration": "function",
    "method_definition": "method",
    "interface_declaration": "interface",
}


def _text(node, src: bytes) -> str:
    return src[node.start_byte:node.end_byte].decode("utf-8", "replace")


def _name_of(node, src: bytes) -> str | None:
    field = node.child_by_field_name("name")
    if field is not None:
        return _text(field, src)
    for c in node.children:
        if c.type in ("identifier", "type_identifier", "property_identifier"):
            return _text(c, src)
    return None


def _def_map(language: str) -> dict[str, str]:
    if language == "python":
        return _PY_DEFS
    return _TS_DEFS  # typescript / javascript


def parse_file(repo_id: str, repo_dir: Path, rel_path: str, graph: CodeGraph) -> None:
    language = detect(rel_path)
    if language is None:
        return
    src = (repo_dir / rel_path).read_bytes()
    file_node = Node(node_id(repo_id, rel_path, rel_path), Path(rel_path).name, rel_path,
                     rel_path, "file", language, 1, max(1, src.count(b"\n") + 1))
    graph.add_node(file_node)

    try:
        parser = get_parser(language)  # e.g. "python" | "typescript" | "javascript"
    except LookupError:
        return  # unsupported grammar -> file node only
    tree = parser.parse(src)
    defs = _def_map(language)

    def walk(node, parent_symbol: str, parent_id: str, class_scope: bool) -> None:
        for child in node.children:
            kind = defs.get(child.type)
            if kind:
                name = _name_of(child, src) or "<anon>"
                # a function defined directly inside a class is a method
                if kind == "function" and class_scope:
                    kind = "method"
                symbol_path = f"{parent_symbol}.{name}" if parent_symbol != rel_path else name
                nid = node_id(repo_id, rel_path, symbol_path)
                graph.add_node(Node(
                    nid, name, symbol_path, rel_path, kind, language,
                    child.start_point[0] + 1, child.end_point[0] + 1,
                    signature=_text(child, src).splitlines()[0][:200],
                ))
                graph.add_edge(Edge(parent_id, nid, "CONTAINS", resolved=True))
                walk(child, symbol_path, nid, class_scope=(kind == "class"))
            else:
                if child.type in ("import_statement", "import_from_statement",
                                  "import_declaration"):
                    graph.add_edge(Edge(file_node.node_id, file_node.node_id,
                                        "IMPORTS", resolved=False))
                walk(child, parent_symbol, parent_id, class_scope)

    walk(tree.root_node, rel_path, file_node.node_id, class_scope=False)
