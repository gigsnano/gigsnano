import { describe, expect, it } from "vitest";
import { connectedTables } from "./fk-tree";
import type { IErdSchema } from "@/types";

const schema: IErdSchema = {
  id: "s",
  tables: [{ name: "a", columns: [] }, { name: "b", columns: [] }, { name: "c", columns: [] }, { name: "z", columns: [] }],
  relations: [
    { from_table: "a", from_column: "x", to_table: "b", to_column: "id" },
    { from_table: "b", from_column: "y", to_table: "c", to_column: "id" },
  ],
};

describe("connectedTables", () => {
  it("returns the full transitive FK tree from a table", () => {
    expect(connectedTables(schema, "a")).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns just the table when it has no relations", () => {
    expect(connectedTables(schema, "z")).toEqual(new Set(["z"]));
  });

  it("works from a leaf of the chain too (undirected)", () => {
    expect(connectedTables(schema, "c")).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns just the root when it does not exist in the schema", () => {
    expect(connectedTables(schema, "ghost")).toEqual(new Set(["ghost"]));
  });
});
