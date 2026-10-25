export interface IErdColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  nullable?: boolean;
}

export interface IErdTable {
  name: string;
  columns: IErdColumn[];
  file?: string;
}

export interface IErdRelation {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  cardinality?: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
}

export interface IErdSchema {
  id: string;
  tables: IErdTable[];
  relations: IErdRelation[];
  /** Commit the schema was extracted against (staleness stamp). */
  based_on_sha?: string;
}
