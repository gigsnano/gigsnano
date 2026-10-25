export type BmadChoiceOption = { n: string; label: string };
export type BmadWidget =
  | { kind: "choice"; options: BmadChoiceOption[] }
  | { kind: "open"; question: string }
  | null;

const OPTION_RE = /^\s*(\d+)[.)]\s+(.+?)\s*$/;
const CUE_RE = /\b(select|choose|pick)\b|\b1\s*[-–]\s*9\b/i;

/** Mask fenced code blocks so numbered lines inside ``` never count as options. */
function stripCodeFences(lines: string[]): boolean[] {
  const inFence: boolean[] = [];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      inFence.push(true); // the fence marker line itself is "inside"
      continue;
    }
    inFence.push(fenced);
  }
  return inFence;
}

export function parseBmadResponse(text: string): {
  body: string;
  widget: BmadWidget;
} {
  const lines = text.split("\n");
  const masked = stripCodeFences(lines);

  // Find the longest contiguous run of numbered option lines (outside fences).
  let runStart = -1;
  let runEnd = -1; // exclusive
  let i = 0;
  while (i < lines.length) {
    if (!masked[i] && OPTION_RE.test(lines[i])) {
      let j = i;
      while (j < lines.length && !masked[j] && OPTION_RE.test(lines[j])) j++;
      if (j - i > runEnd - runStart) {
        runStart = i;
        runEnd = j;
      }
      i = j;
    } else {
      i++;
    }
  }

  const hasRun = runStart !== -1 && runEnd - runStart >= 2;
  if (hasRun) {
    // Cue: a select/choose/pick/1-9 phrase adjacent to the run, OR the
    // non-empty line immediately before the run ends with '?'.
    let prev = runStart - 1;
    while (prev >= 0 && lines[prev].trim() === "") prev--;
    const precededByQuestion = prev >= 0 && lines[prev].trim().endsWith("?");
    // Cue must be adjacent to the run — not anywhere in the message — so a
    // normal doc with an incidental "select"/"choose" word plus a numbered
    // list is NOT misread as a clickable menu.
    const vicinity = [
      prev >= 0 ? lines[prev] : "",
      ...lines.slice(runEnd, runEnd + 3),
    ].join("\n");
    const hasCue = CUE_RE.test(vicinity) || precededByQuestion;

    if (hasCue) {
      const options: BmadChoiceOption[] = [];
      for (let k = runStart; k < runEnd; k++) {
        const m = lines[k].match(OPTION_RE);
        if (m && m[2].trim()) options.push({ n: m[1], label: m[2].trim() });
      }
      // Body = everything except the option run and a trailing standalone
      // "Select 1-9…"-style prompt line right after it.
      let dropEnd = runEnd;
      while (
        dropEnd < lines.length &&
        (lines[dropEnd].trim() === "" || CUE_RE.test(lines[dropEnd]))
      ) {
        dropEnd++;
      }
      const body = [...lines.slice(0, runStart), ...lines.slice(dropEnd)]
        .join("\n")
        .trim();
      if (options.length >= 2) return { body, widget: { kind: "choice", options } };
    }
  }

  // Open question: last non-empty line ends with '?'.
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const last = nonEmpty[nonEmpty.length - 1]?.trim() ?? "";
  if (last.endsWith("?")) {
    // The line may contain leading prose ("Great. What is...?") — isolate
    // just the final sentence as the question.
    const sentences = last.split(/(?<=[.!?])\s+/).filter(Boolean);
    const question = sentences[sentences.length - 1] ?? last;
    return { body: text, widget: { kind: "open", question } };
  }

  return { body: text, widget: null };
}
