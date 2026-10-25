import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);

export function normalizeRemote(url: string): string | null {
  const m = url.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
  if (!m) return null;
  return `${m[1]}/${m[2]}`.toLowerCase();
}

export async function getRepoFullName(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await run("git remote get-url origin", { cwd });
    return normalizeRemote(stdout);
  } catch {
    return null;
  }
}
