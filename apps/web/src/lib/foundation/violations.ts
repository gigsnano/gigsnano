import type { IValidationResult, IViolation } from "@/types/project/foundation";

export function groupViolationsByFile(
  violations: IViolation[],
): { file: string; items: IViolation[] }[] {
  const order: string[] = [];
  const byFile = new Map<string, IViolation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) {
      byFile.set(v.file, []);
      order.push(v.file);
    }
    byFile.get(v.file)!.push(v);
  }
  return order
    .map((file) => ({ file, items: byFile.get(file)! }))
    .sort((a, b) => {
      if (a.file === "") return 1; // repo-level last
      if (b.file === "") return -1;
      return 0;
    });
}

export function blockingCount(result: IValidationResult): number {
  return result.violations.filter((v) => v.blocking).length;
}
