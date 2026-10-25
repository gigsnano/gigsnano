import {
  EFindingStatus,
  EParseState,
  type IPackageDocument,
  type IPackageFinding,
} from "@/types";

/** Text formats we send as-is; everything else goes up as a base64 data URL so
 *  the server's extractor (PDF/DOCX/ZIP) sees real bytes. */
const TEXT_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json", ".yml", ".yaml"];

export function isTextFile(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/") || mimeType === "application/json") return true;
  const lower = fileName.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** A document the user must look at before the package is usable. */
export function needsAttention(doc: IPackageDocument): boolean {
  return doc.parse_state !== EParseState.Ok;
}

/** Plain-language reason a document is not usable, for the file queue row.
 *  The server's `parse_error` is precise but not always phrased for a reader. */
export function parseStateLabel(doc: IPackageDocument): string {
  switch (doc.parse_state) {
    case EParseState.Ok:
      return "Ready";
    case EParseState.Duplicate:
      return "Duplicate of another file";
    case EParseState.Empty:
      return "No readable text";
    case EParseState.TooLarge:
      return "Too large (10 MB limit)";
    case EParseState.Encrypted:
      return "Password protected";
    case EParseState.Unsupported:
      return "Could not read this format";
    default:
      return "Unknown";
  }
}

/** The status actually in force — a user override wins over the AI's proposal,
 *  which is the whole point of storing them separately. */
export function effectiveStatus(finding: IPackageFinding): EFindingStatus {
  return finding.override?.status ?? finding.status;
}

export function effectiveTitle(finding: IPackageFinding): string {
  return finding.override?.title ?? finding.title;
}

/** Conflicts block the import, so they are counted separately from the rest. */
export function blockingCount(findings: IPackageFinding[]): number {
  return findings.filter((f) => effectiveStatus(f) === EFindingStatus.Conflict).length;
}

const KIND_ORDER = [
  "decision",
  "requirement",
  "module",
  "phase",
  "task",
  "dependency",
  "prerequisite",
  "constraint",
  "risk",
  "open_question",
  "testing",
  "definition_of_done",
];

export interface IFindingGroup {
  kind: string;
  label: string;
  findings: IPackageFinding[];
}

const KIND_LABELS: Record<string, string> = {
  decision: "Decisions",
  requirement: "Requirements",
  module: "Modules",
  phase: "Delivery phases",
  task: "Tasks",
  dependency: "Dependencies",
  prerequisite: "Prerequisites",
  constraint: "Constraints",
  risk: "Risks",
  open_question: "Open questions",
  testing: "Testing",
  definition_of_done: "Definition of done",
};

/** Group findings for display, in a fixed order so the page does not reshuffle
 *  between analyses. Unknown kinds sort last rather than being dropped. */
export function groupFindings(findings: IPackageFinding[]): IFindingGroup[] {
  const byKind = new Map<string, IPackageFinding[]>();
  for (const finding of findings) {
    const list = byKind.get(finding.kind) ?? [];
    list.push(finding);
    byKind.set(finding.kind, list);
  }
  return [...byKind.entries()]
    .sort(([a], [b]) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia === -1 ? KIND_ORDER.length : ia) - (ib === -1 ? KIND_ORDER.length : ib);
    })
    .map(([kind, list]) => ({
      kind,
      label: KIND_LABELS[kind] ?? kind.replace(/_/g, " "),
      findings: list,
    }));
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One thing standing between the package and an executable plan. */
export interface IReadinessFactor {
  label: string;
  /** Points contributed out of `weight`. */
  earned: number;
  weight: number;
  detail: string;
}

export interface IReadiness {
  score: number; // 0-100
  factors: IReadinessFactor[];
  ready: string[];
  needsConfirmation: string[];
  blocked: string[];
}

/** An explainable readiness score: every point is attributable to a factor the
 *  user can see and act on. A bare number would be worse than none — the point
 *  is to say what to fix next, not to grade the package.
 *
 *  Pure so the arithmetic is testable without a rendered page. */
export function readiness(input: {
  documentsTotal: number;
  documentsReady: number;
  findings: IPackageFinding[];
  planChangeCount: number;
  /** Changes that are approved *or already applied* — applying rewrites the
   *  status, so counting only "approved" made a finished import score zero here. */
  approvedChangeCount: number;
  repositoryConnected: boolean;
}): IReadiness {
  const conflicts = input.findings.filter((f) => effectiveStatus(f) === EFindingStatus.Conflict);
  const assumptions = input.findings.filter(
    (f) => effectiveStatus(f) === EFindingStatus.Assumption,
  );
  const missing = input.findings.filter((f) => effectiveStatus(f) === EFindingStatus.Missing);

  const factors: IReadinessFactor[] = [
    {
      label: "Documents readable",
      earned:
        input.documentsTotal === 0
          ? 0
          : Math.round((input.documentsReady / input.documentsTotal) * 25),
      weight: 25,
      detail: `${input.documentsReady} of ${input.documentsTotal} documents could be read`,
    },
    {
      label: "Analysis produced findings",
      earned: input.findings.length > 0 ? 20 : 0,
      weight: 20,
      detail:
        input.findings.length > 0
          ? `${input.findings.length} findings extracted`
          : "No findings yet — run the analysis",
    },
    {
      label: "No unresolved conflicts",
      earned: conflicts.length === 0 ? 25 : 0,
      weight: 25,
      detail:
        conflicts.length === 0
          ? "Nothing contradicts"
          : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} must be resolved first`,
    },
    {
      label: "Plan approved",
      earned:
        input.planChangeCount === 0
          ? 0
          : Math.round((input.approvedChangeCount / input.planChangeCount) * 20),
      weight: 20,
      detail:
        input.planChangeCount === 0
          ? "No plan proposed yet"
          : `${input.approvedChangeCount} of ${input.planChangeCount} changes approved`,
    },
    {
      label: "Repository connected",
      earned: input.repositoryConnected ? 10 : 0,
      weight: 10,
      detail: input.repositoryConnected
        ? "Code has somewhere to live"
        : "No repository linked — you can connect one later",
    },
  ];

  return {
    score: factors.reduce((sum, f) => sum + f.earned, 0),
    factors,
    ready: factors.flatMap((f) => (f.earned === f.weight ? [f.detail] : [])),
    needsConfirmation: [
      ...assumptions.map((f) => `Assumption: ${effectiveTitle(f)}`),
      ...missing.map((f) => `Missing: ${effectiveTitle(f)}`),
    ],
    blocked: conflicts.map((f) => `Conflict: ${effectiveTitle(f)}`),
  };
}

/** The single most useful thing to do next, given where the import stands.
 *  One recommendation, not a list — a summary that ends in five equal options
 *  has not actually helped. */
export function nextAction(input: {
  hasPackage: boolean;
  hasFindings: boolean;
  conflicts: number;
  hasPlan: boolean;
  approvedChanges: number;
  applied: boolean;
}): string {
  if (!input.hasPackage) return "Upload the delivery package to begin.";
  if (!input.hasFindings) return "Analyse the documents to see what they contain.";
  if (input.conflicts > 0)
    return `Resolve ${input.conflicts} conflicting finding${input.conflicts === 1 ? "" : "s"} — the import cannot proceed while documents contradict each other.`;
  if (!input.hasPlan) return "Choose a planning strategy to propose the project structure.";
  // `applied` is checked before `approvedChanges` deliberately. Applying rewrites
  // each change's status to applied/failed, so the approved count drops back to
  // zero — asking a user to "approve what to create" *after* the import ran was
  // exactly the wrong advice, and only a live run surfaced it.
  if (input.applied) return "Open the created work items and start the first cycle.";
  if (input.approvedChanges === 0) return "Review the proposed changes and approve what to create.";
  return "Create the execution plan — this is the first step that changes the project.";
}
