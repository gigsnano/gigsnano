import { describe, expect, it } from "vitest";
import { parseErdBlocks, stripErdBlocks } from "./erd-block";

const VALID = [
  "Here's the data model:",
  "",
  "```gigs:erd",
  JSON.stringify({
    id: "schema-1",
    dbml: "Table users { id int [pk] }",
    schema: {
      id: "schema-1",
      tables: [
        { name: "users", columns: [{ name: "id", type: "int", pk: true }] },
        { name: "posts", columns: [{ name: "id", type: "int", pk: true }] },
      ],
      relations: [
        { from_table: "posts", from_column: "author_id", to_table: "users", to_column: "id" },
      ],
    },
  }),
  "```",
].join("\n");

describe("parseErdBlocks", () => {
  it("extracts one valid block with tables and relations", () => {
    const blocks = parseErdBlocks(VALID);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("schema-1");
    expect(blocks[0].dbml).toBe("Table users { id int [pk] }");
    expect(blocks[0].schema?.tables).toHaveLength(2);
    expect(blocks[0].schema?.relations).toEqual([
      { from_table: "posts", from_column: "author_id", to_table: "users", to_column: "id" },
    ]);
  });

  it("assigns a stable fallback id when none is given", () => {
    const text =
      '```gigs:erd\n{"schema":{"tables":[{"name":"a","columns":[]}],"relations":[]}}\n```';
    expect(parseErdBlocks(text)[0].id).toBe("erd-0");
  });

  it("skips a block whose schema has no tables array", () => {
    const text = '```gigs:erd\n{"schema":{"relations":[]}}\n```';
    expect(parseErdBlocks(text)).toEqual([]);
  });

  it("skips a block with an empty tables array", () => {
    const text = '```gigs:erd\n{"schema":{"tables":[],"relations":[]}}\n```';
    expect(parseErdBlocks(text)).toEqual([]);
  });

  it("returns [] for invalid JSON inside the block", () => {
    expect(parseErdBlocks("```gigs:erd\n{not json}\n```")).toEqual([]);
  });

  it("returns [] when there is no block", () => {
    expect(parseErdBlocks("Just prose, no erd.")).toEqual([]);
  });

  it("drops relations that reference an unknown table", () => {
    const text =
      '```gigs:erd\n{"schema":{"tables":[{"name":"a","columns":[]}],"relations":[{"from_table":"a","from_column":"x","to_table":"ghost","to_column":"id"}]}}\n```';
    expect(parseErdBlocks(text)[0].schema?.relations).toEqual([]);
  });

  it("keeps a dbml-only block (no schema)", () => {
    const text = '```gigs:erd\n{"dbml":"Table t { id int [pk] }"}\n```';
    const blocks = parseErdBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dbml).toBe("Table t { id int [pk] }");
    expect(blocks[0].schema).toBeUndefined();
  });
});

describe("stripErdBlocks", () => {
  it("removes the block and leaves surrounding prose", () => {
    const stripped = stripErdBlocks(VALID);
    expect(stripped).toBe("Here's the data model:");
    expect(stripped).not.toContain("gigs:erd");
  });

  it("is a no-op when there is no block", () => {
    expect(stripErdBlocks("Plain text")).toBe("Plain text");
  });
});
