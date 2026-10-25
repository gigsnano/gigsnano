/**
 * Per-project workspace files served by the backend workspace endpoints
 * (cloned repo + generated BMAD docs). `path` is POSIX-relative (forward
 * slashes); `.git` is excluded server-side.
 */
export interface IWorkspaceEntry {
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface IWorkspaceFile {
  path: string;
  content: string;
}
