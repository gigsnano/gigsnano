import type { ICodeMetrics, IIssuesPayload } from "@/types";

/**
 * Canned static-metrics summary for the mock-first `/code/metrics/` endpoint —
 * enough languages/buckets/hotspots/cycles to exercise every chart in the
 * Metrics tab (treemap, scatter, histogram, donut) with no backend.
 */
export const mockCodeMetrics: ICodeMetrics = {
  totals: { files: 214, loc: 18420 },
  languages: [
    { name: "TypeScript", loc: 12800 },
    { name: "TSX", loc: 4200 },
    { name: "CSS", loc: 900 },
    { name: "JSON", loc: 380 },
    { name: "Markdown", loc: 140 },
  ],
  // Mirrors a healthy scan: CSS/JSON/Markdown above are outside the fallback's
  // 11-extension list, so only scc could have produced this spread.
  languages_source: "scc",
  complexity: {
    buckets: [
      { range: "1-5", count: 612 },
      { range: "6-10", count: 148 },
      { range: "11-20", count: 41 },
      { range: "21-30", count: 9 },
      { range: "31+", count: 3 },
    ],
    worst: [
      { name: "resolveMock", file: "src/mocks/index.ts", ccn: 34 },
      { name: "buildCodeGraphData", file: "src/lib/code/build-code-graph.ts", ccn: 22 },
      { name: "issuesGrouping", file: "src/lib/issues-grouping.ts", ccn: 19 },
    ],
  },
  duplication: { percent: 3.2 },
  hotspots: [
    { file: "src/mocks/index.ts", complexity: 34, churn: 61, hotspot: 1.0 },
    { file: "src/components/board/story-chat.tsx", complexity: 26, churn: 44, hotspot: 0.68 },
    { file: "src/lib/issues-grouping.ts", complexity: 19, churn: 38, hotspot: 0.43 },
    { file: "src/components/issues/issues-view.tsx", complexity: 21, churn: 22, hotspot: 0.28 },
    { file: "src/services/story.service.ts", complexity: 14, churn: 30, hotspot: 0.25 },
    { file: "src/components/codebase/codebase-view.tsx", complexity: 9, churn: 12, hotspot: 0.06 },
  ],
  dependencies: {
    cycles: [
      { modules: ["src/store/ui/ai-pane.store.ts", "src/components/ai/ai-pane.tsx"] },
    ],
  },
  // Sized to match reality, not Sonar: a real semgrep run over gigsnano-api found 4
  // findings, not the ~1,200 SonarQube reports on the same code. High signal, low
  // volume — the fixture shouldn't imply a density the scanner never produces.
  issues: {
    counts: { error: 1, warning: 3, info: 0 },
    by_rule: [
      {
        rule: "typescript.react.security.audit.react-dangerouslysetinnerhtml",
        severity: "ERROR",
        count: 1,
      },
      {
        rule: "javascript.lang.security.audit.insecure-hash-algorithm-sha1",
        severity: "WARNING",
        count: 2,
      },
      { rule: "typescript.lang.best-practice.leftover-debugging", severity: "WARNING", count: 1 },
    ],
    top: [
      {
        rule: "typescript.react.security.audit.react-dangerouslysetinnerhtml",
        severity: "ERROR",
        file: "src/components/editor/rich-editor.tsx",
        line: 88,
        message: "Detected dangerouslySetInnerHTML with unsanitized input.",
        cwe: ["CWE-79: Improper Neutralization of Input During Web Page Generation"],
      },
      {
        rule: "javascript.lang.security.audit.insecure-hash-algorithm-sha1",
        severity: "WARNING",
        file: "src/lib/code/build-code-graph.ts",
        line: 42,
        message: "Detected SHA1 hash algorithm which is considered insecure.",
        cwe: ["CWE-327: Use of a Broken or Risky Cryptographic Algorithm"],
      },
    ],
  },
};

/**
 * Canned findings for the mock-first `/code/issues/` endpoint — the full list the
 * Issues tab renders (`mockCodeMetrics.issues` is only the capped summary).
 *
 * Four findings, not four hundred: a real semgrep run over gigsnano-api produced 4,
 * where SonarQube reported ~1,200 on the same code (mostly maintainability smells).
 * The fixture matches the scanner we actually ship, so nobody designs this screen
 * for a density it will never see.
 */
export const mockCodeIssues: IIssuesPayload = {
  scanned: true,
  truncated: false,
  issues: [
    {
      rule: "typescript.react.security.audit.react-dangerouslysetinnerhtml",
      severity: "ERROR",
      file: "src/components/editor/rich-editor.tsx",
      line: 88,
      message: "Detected dangerouslySetInnerHTML with unsanitized input.",
      cwe: ["CWE-79: Improper Neutralization of Input During Web Page Generation"],
    },
    {
      rule: "javascript.lang.security.audit.insecure-hash-algorithm-sha1",
      severity: "WARNING",
      file: "src/lib/code/build-code-graph.ts",
      line: 42,
      message: "Detected SHA1 hash algorithm which is considered insecure.",
      cwe: ["CWE-327: Use of a Broken or Risky Cryptographic Algorithm"],
    },
    {
      rule: "javascript.lang.security.audit.insecure-hash-algorithm-sha1",
      severity: "WARNING",
      file: "src/lib/code/build-code-graph.ts",
      line: 117,
      message: "Detected SHA1 hash algorithm which is considered insecure.",
      cwe: ["CWE-327: Use of a Broken or Risky Cryptographic Algorithm"],
    },
    {
      rule: "typescript.lang.best-practice.leftover-debugging",
      severity: "WARNING",
      file: "src/services/story.service.ts",
      line: 61,
      message: "Leftover debug statement detected.",
      cwe: [],
    },
  ],
};
