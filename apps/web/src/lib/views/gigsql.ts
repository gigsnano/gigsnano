/**
 * GigsQL parser, AST, and canonical normalizer (GIN-138).
 *
 * Plane/Jira-style filter language for Views and story queries. Reads GIN-166
 * colon shorthand and emits canonical syntax on normalization.
 *
 * Kept in step with `gigsnano_api/features/views/gigsql.py` on the backend.
 */

import { EStoryPriority, EStoryStatus, EStoryType } from "@/types";
import { gigsqlColonAliases, gigsqlFieldSets } from "@/lib/issues/field-registry";

export type TGigsqlDomain = "work_item" | "code_analysis";

export interface IGigsQLLogical {
  kind: "logical";
  operator: "AND" | "OR";
  children: TGigsQLNode[];
}

export interface IGigsQLPredicate {
  kind: "predicate";
  field: string;
  operator: string;
  value: string;
  domain: TGigsqlDomain;
}

export interface IGigsQLIsNull {
  kind: "is_null";
  field: string;
  domain: TGigsqlDomain;
}

export interface IGigsQLIn {
  kind: "in";
  field: string;
  values: string[];
  negated: boolean;
  domain: TGigsqlDomain;
}

export interface IGigsQLBetween {
  kind: "between";
  field: string;
  start: string;
  end: string;
  domain: TGigsqlDomain;
}

export type TGigsQLNode =
  | IGigsQLLogical
  | IGigsQLPredicate
  | IGigsQLIsNull
  | IGigsQLIn
  | IGigsQLBetween;

export type TGigsqlParse =
  | { kind: "empty" }
  | { kind: "ok"; node: TGigsQLNode }
  | { kind: "error"; reason: string };

export type TGigsqlNormalize =
  | { kind: "empty" }
  | { kind: "ok"; query: string }
  | { kind: "error"; reason: string };

const WORK_ITEM_DOMAIN: TGigsqlDomain = "work_item";
const CODE_ANALYSIS_DOMAIN: TGigsqlDomain = "code_analysis";

// Work-item field validators derive from the canonical registry (GIN-313) so
// GigsQL, Visual filters, saved views, and columns can't name different fields.
const REGISTRY_GIGSQL = gigsqlFieldSets();
const WORK_ITEM_FIELDS = REGISTRY_GIGSQL.all;

const CODE_ANALYSIS_FIELDS = new Set(["severity", "rule", "file", "author"]);
const ALL_FIELDS = new Set([...WORK_ITEM_FIELDS, ...CODE_ANALYSIS_FIELDS]);

const COLON_FIELD_ALIASES: Record<string, string> = gigsqlColonAliases();

const SELECT_FIELDS = REGISTRY_GIGSQL.select;
const TEXT_FIELDS = REGISTRY_GIGSQL.text;
const DATE_FIELDS = REGISTRY_GIGSQL.date;

const SELECT_OPS = new Set(["=", "!=", "in", "not in", "is null"]);
const TEXT_OPS = new Set(["=", "!=", "~"]);
const DATE_OPS = new Set(["=", "!=", "<", "<=", ">", ">=", "between", "is null"]);
const CODE_ANALYSIS_OPS = new Set(["=", "!=", "in", "not in", "is null"]);

const STATUSES = new Set<string>(Object.values(EStoryStatus));
const PRIORITIES = new Set<string>(Object.values(EStoryPriority));
const TYPES = new Set<string>(Object.values(EStoryType));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CANONICAL_MARKERS =
  /\b(AND|OR|IN|NOT|IS|NULL|BETWEEN)\b|[=~]|!=|>=|<=|[()]/i;

interface IToken {
  kind: string;
  value: string;
}

/** Parse a GigsQL expression. Never throws. */
export function parseGigsql(query: string | undefined | null): TGigsqlParse {
  const q = (query ?? "").trim();
  if (!q) return { kind: "empty" };

  try {
    const node = isColonShorthand(q) ? parseColonShorthand(q) : new Parser(tokenize(q)).parseExpr();
    return { kind: "ok", node };
  } catch (err) {
    return { kind: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Normalize GigsQL to canonical syntax. Never throws. */
export function normalizeGigsql(query: string | undefined | null): TGigsqlNormalize {
  const q = (query ?? "").trim();
  if (!q) return { kind: "empty" };

  const parsed = parseGigsql(q);
  if (parsed.kind === "empty") return { kind: "empty" };
  if (parsed.kind === "error") return { kind: "error", reason: parsed.reason };

  try {
    rejectCodeAnalysisDomain(parsed.node);
    return { kind: "ok", query: serialize(parsed.node) };
  } catch (err) {
    return { kind: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

export function rejectCodeAnalysisDomain(node: TGigsQLNode): void {
  if (node.kind === "logical") {
    for (const child of node.children) rejectCodeAnalysisDomain(child);
    return;
  }
  if (node.domain === CODE_ANALYSIS_DOMAIN) {
    throw new Error(
      `Field "${node.field}" is reserved for code-analysis filters and cannot be used in work-item filters.`,
    );
  }
}

function fieldDomain(field: string): TGigsqlDomain {
  if (CODE_ANALYSIS_FIELDS.has(field)) return CODE_ANALYSIS_DOMAIN;
  if (WORK_ITEM_FIELDS.has(field)) return WORK_ITEM_DOMAIN;
  throw new Error(
    `Unknown filter field "${field}". Supported work-item fields: ${[...WORK_ITEM_FIELDS].sort().join(", ")}.`,
  );
}

function canonicalField(name: string): string {
  const lowered = name.trim().toLowerCase();
  if (lowered in COLON_FIELD_ALIASES) return COLON_FIELD_ALIASES[lowered];
  for (const field of ALL_FIELDS) {
    if (field.toLowerCase() === lowered) return field;
  }
  throw new Error(
    `Unknown filter field "${name}". Supported work-item fields: ${[...WORK_ITEM_FIELDS].sort().join(", ")}.`,
  );
}

function allowedOps(field: string): Set<string> {
  if (CODE_ANALYSIS_FIELDS.has(field)) return CODE_ANALYSIS_OPS;
  if (SELECT_FIELDS.has(field)) return SELECT_OPS;
  if (TEXT_FIELDS.has(field)) return TEXT_OPS;
  if (DATE_FIELDS.has(field)) return DATE_OPS;
  throw new Error(`Unknown filter field "${field}".`);
}

function validateValue(field: string, value: string): void {
  if (field === "status" && !STATUSES.has(value)) {
    throw new Error(`Unknown status "${value}". Supported: ${[...STATUSES].sort().join(", ")}.`);
  }
  if (field === "priority" && !PRIORITIES.has(value)) {
    throw new Error(
      `Unknown priority "${value}". Supported: ${[...PRIORITIES].sort().join(", ")}.`,
    );
  }
  if (field === "type" && !TYPES.has(value)) {
    throw new Error(`Unknown type "${value}". Supported: ${[...TYPES].sort().join(", ")}.`);
  }
  if (DATE_FIELDS.has(field) && !DATE_RE.test(value)) {
    throw new Error(`"${field}" must be YYYY-MM-DD, got "${value}".`);
  }
}

function validateOperator(field: string, operator: string): void {
  const allowed = allowedOps(field);
  if (!allowed.has(operator)) {
    throw new Error(
      `Operator "${operator}" is not supported for field "${field}". Supported: ${[...allowed].sort().join(", ")}.`,
    );
  }
}

function isColonShorthand(query: string): boolean {
  if (CANONICAL_MARKERS.test(query)) return false;
  const tokens = query.split(/\s+/);
  if (!tokens.length) return false;
  for (const raw of tokens) {
    const at = raw.indexOf(":");
    if (at <= 0 || at === raw.length - 1) return false;
  }
  return true;
}

function selectFieldNode(field: string, values: string[], domain: TGigsqlDomain): TGigsQLNode {
  for (const value of values) validateValue(field, value);
  if (values.length === 1) {
    validateOperator(field, "=");
    return { kind: "predicate", field, operator: "=", value: values[0], domain };
  }
  validateOperator(field, "in");
  return { kind: "in", field, values, negated: false, domain };
}

function parseColonShorthand(query: string): TGigsQLNode {
  const selectValues = new Map<string, string[]>();
  let titleValue: string | null = null;
  const dateBetween = new Map<string, IGigsQLBetween>();
  const dateEquals = new Map<string, string>();
  const fieldOrder: string[] = [];

  const noteField = (field: string) => {
    if (!fieldOrder.includes(field)) fieldOrder.push(field);
  };

  for (const raw of query.split(/\s+/)) {
    const at = raw.indexOf(":");
    if (at <= 0 || at === raw.length - 1) {
      throw new Error(`Expected "field:value", got "${raw}".`);
    }
    const field = canonicalField(raw.slice(0, at));
    const value = raw.slice(at + 1).trim();
    const domain = fieldDomain(field);

    if (DATE_FIELDS.has(field) && value.includes("..")) {
      const [start, end] = value.split("..");
      const startTrim = (start ?? "").trim();
      const endTrim = (end ?? "").trim();
      if (!DATE_RE.test(startTrim) || !DATE_RE.test(endTrim)) {
        throw new Error(`"${field}" range must be YYYY-MM-DD..YYYY-MM-DD.`);
      }
      validateOperator(field, "between");
      dateBetween.set(field, { kind: "between", field, start: startTrim, end: endTrim, domain });
      noteField(field);
      continue;
    }

    if (field === "title") {
      titleValue = value;
      noteField(field);
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      validateValue(field, value);
      dateEquals.set(field, value);
      noteField(field);
      continue;
    }

    if (SELECT_FIELDS.has(field)) {
      const existing = selectValues.get(field) ?? [];
      existing.push(value);
      selectValues.set(field, existing);
      noteField(field);
      continue;
    }

    throw new Error(`Unknown filter field "${field}".`);
  }

  const predicates: TGigsQLNode[] = [];
  for (const field of fieldOrder) {
    if (selectValues.has(field)) {
      const domain = fieldDomain(field);
      predicates.push(selectFieldNode(field, selectValues.get(field)!, domain));
    } else if (field === "title" && titleValue !== null) {
      validateOperator("title", "~");
      predicates.push({
        kind: "predicate",
        field: "title",
        operator: "~",
        value: titleValue,
        domain: WORK_ITEM_DOMAIN,
      });
    } else if (dateBetween.has(field)) {
      predicates.push(dateBetween.get(field)!);
    } else if (dateEquals.has(field)) {
      const domain = fieldDomain(field);
      validateOperator(field, "=");
      predicates.push({
        kind: "predicate",
        field,
        operator: "=",
        value: dateEquals.get(field)!,
        domain,
      });
    }
  }

  if (predicates.length === 1) return predicates[0];
  return { kind: "logical", operator: "AND", children: predicates };
}

function serialize(node: TGigsQLNode): string {
  if (node.kind === "logical") {
    const parts = node.children.map((child) => serialize(child));
    if (parts.length === 1) return parts[0];
    const joiner = ` ${node.operator} `;
    return parts
      .map((part) => (needsParens(part, node.operator) ? `(${part})` : part))
      .join(joiner);
  }

  if (node.kind === "predicate") {
    return `${node.field} ${node.operator} ${node.value}`;
  }

  if (node.kind === "is_null") {
    return `${node.field} is null`;
  }

  if (node.kind === "in") {
    const keyword = node.negated ? "not in" : "in";
    return `${node.field} ${keyword} (${node.values.join(", ")})`;
  }

  if (node.kind === "between") {
    return `${node.field} between ${node.start} and ${node.end}`;
  }

  throw new TypeError(`Unsupported AST node: ${String(node)}`);
}

function needsParens(part: string, parentKind: "AND" | "OR"): boolean {
  if (parentKind === "AND") return part.includes(" OR ");
  return part.includes(" AND ");
}

function tokenize(query: string): IToken[] {
  const tokens: IToken[] = [];
  let i = 0;
  const n = query.length;

  while (i < n) {
    const ch = query[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "LPAREN", value: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "RPAREN", value: ")" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "COMMA", value: "," });
      i += 1;
      continue;
    }

    const two = query.slice(i, i + 2);
    if (two === "!=" || two === "<=" || two === ">=") {
      tokens.push({ kind: "OP", value: two });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === "~" || ch === "<" || ch === ">") {
      tokens.push({ kind: "OP", value: ch });
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && query[j] !== quote) j += 1;
      if (j >= n) throw new Error("Unterminated string literal.");
      tokens.push({ kind: "STRING", value: query.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    if (/\d/.test(ch)) {
      let j = i;
      while (j < n && (/\d/.test(query[j]) || query[j] === "-")) j += 1;
      const literal = query.slice(i, j);
      if (!DATE_RE.test(literal)) {
        throw new Error(`Expected YYYY-MM-DD date, got "${literal}".`);
      }
      tokens.push({ kind: "DATE", value: literal });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < n && /[\w-]/.test(query[j])) j += 1;
      const word = query.slice(i, j);
      const upper = word.toUpperCase();
      if (["AND", "OR", "IN", "NOT", "IS", "NULL", "BETWEEN"].includes(upper)) {
        tokens.push({ kind: upper, value: upper === "NULL" ? "null" : upper.toLowerCase() });
      } else {
        tokens.push({ kind: "IDENT", value: word });
      }
      i = j;
      continue;
    }

    throw new Error(`Unexpected character "${ch}" in GigsQL expression.`);
  }

  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: IToken[]) {}

  parseExpr(): TGigsQLNode {
    const node = this.parseOr();
    if (this.peek() !== null) {
      throw new Error("Unexpected tokens after expression.");
    }
    return node;
  }

  private parseOr(): TGigsQLNode {
    const nodes = [this.parseAnd()];
    while (this.match("OR")) nodes.push(this.parseAnd());
    if (nodes.length === 1) return nodes[0];
    return { kind: "logical", operator: "OR", children: nodes };
  }

  private parseAnd(): TGigsQLNode {
    const nodes = [this.parsePrimary()];
    while (this.match("AND")) nodes.push(this.parsePrimary());
    if (nodes.length === 1) return nodes[0];
    return { kind: "logical", operator: "AND", children: nodes };
  }

  private parsePrimary(): TGigsQLNode {
    if (this.match("LPAREN")) {
      const node = this.parseOr();
      if (!this.match("RPAREN")) {
        throw new Error('Expected ")" after grouped expression.');
      }
      return node;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): TGigsQLNode {
    const fieldTok = this.expect("IDENT");
    const field = canonicalField(fieldTok.value);
    const domain = fieldDomain(field);

    if (this.match("IS")) {
      if (!this.match("NULL")) {
        throw new Error('"is" must be followed by "null".');
      }
      validateOperator(field, "is null");
      return { kind: "is_null", field, domain };
    }

    if (this.match("NOT")) {
      if (!this.match("IN")) {
        throw new Error('"not" must be followed by "in".');
      }
      const values = this.parseValueList();
      validateOperator(field, "not in");
      for (const value of values) validateValue(field, value);
      return { kind: "in", field, values, negated: true, domain };
    }

    if (this.match("IN")) {
      const values = this.parseValueList();
      validateOperator(field, "in");
      for (const value of values) validateValue(field, value);
      return { kind: "in", field, values, negated: false, domain };
    }

    if (this.match("BETWEEN")) {
      const start = this.parseScalar();
      if (!this.match("AND")) {
        throw new Error('"between" must be followed by two dates joined with "and".');
      }
      const end = this.parseScalar();
      validateOperator(field, "between");
      validateValue(field, start);
      validateValue(field, end);
      return { kind: "between", field, start, end, domain };
    }

    const opTok = this.expect("OP");
    const operator = opTok.value;
    const value = this.parseScalar();
    validateOperator(field, operator);
    validateValue(field, value);
    return { kind: "predicate", field, operator, value, domain };
  }

  private parseValueList(): string[] {
    if (!this.match("LPAREN")) {
      throw new Error('Expected "(" after "in".');
    }
    if (this.match("RPAREN")) {
      throw new Error("Expected at least one value in list.");
    }
    const values = [this.parseScalar()];
    while (this.match("COMMA")) values.push(this.parseScalar());
    if (!this.match("RPAREN")) {
      throw new Error('Expected ")" to close value list.');
    }
    return values;
  }

  private parseScalar(): string {
    const tok = this.peek();
    if (tok === null) throw new Error("Expected a value.");
    if (tok.kind === "IDENT" || tok.kind === "STRING" || tok.kind === "DATE") {
      this.advance();
      return tok.value;
    }
    throw new Error(`Expected a value, got ${JSON.stringify(tok.value)}.`);
  }

  private peek(): IToken | null {
    if (this.pos >= this.tokens.length) return null;
    return this.tokens[this.pos];
  }

  private advance(): IToken {
    const tok = this.peek();
    if (tok === null) throw new Error("Unexpected end of expression.");
    this.pos += 1;
    return tok;
  }

  private match(kind: string): boolean {
    const tok = this.peek();
    if (tok === null || tok.kind !== kind) return false;
    this.pos += 1;
    return true;
  }

  private expect(kind: string): IToken {
    const tok = this.peek();
    if (tok === null || tok.kind !== kind) {
      throw new Error(`Expected ${kind.toLowerCase()}, got end of expression.`);
    }
    this.pos += 1;
    return tok;
  }
}
