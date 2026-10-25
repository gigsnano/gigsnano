import json

from gigsnano_api.workspace.er_extract import build_er_schema, parse_dbml

DBML = """
Table users {
  id int [pk]
  email varchar
}
Table posts {
  id int [pk]
  author_id int [ref: > users.id]
}
"""


def test_parse_dbml_extracts_tables_and_relations():
    schema = parse_dbml(DBML)
    names = {t["name"] for t in schema["tables"]}
    assert names == {"users", "posts"}
    users = next(t for t in schema["tables"] if t["name"] == "users")
    assert any(c["name"] == "id" and c["pk"] for c in users["columns"])
    rel = schema["relations"][0]
    assert rel["from_table"] == "posts" and rel["to_table"] == "users"


def test_parse_dbml_empty_on_garbage():
    assert parse_dbml("not dbml at all {{{")["tables"] == []


def test_build_er_schema_from_committed_dbml(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "schema.dbml").write_text("Table t {\n  id int [pk]\n}\n")
    out = tmp_path / "out"
    out.mkdir()
    build_er_schema(repo, out)
    schema = json.loads((out / "er.json").read_text())
    assert schema["tables"][0]["name"] == "t"


def test_build_er_schema_empty_when_no_model(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "readme.md").write_text("hi")
    out = tmp_path / "out"
    out.mkdir()
    build_er_schema(repo, out)
    assert json.loads((out / "er.json").read_text())["tables"] == []
