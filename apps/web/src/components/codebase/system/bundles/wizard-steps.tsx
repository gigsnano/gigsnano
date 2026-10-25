"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REPOSITORY_TYPE_LABEL, REPOSITORY_TYPE_OPTIONS } from "@/constants/codebase-meta";
import { cn } from "@/lib/utils";
import {
  ERepoAccess,
  ERepositoryType,
  type IBundleDependency,
  type IBundleRepoConfig,
  type IBundleValidationResult,
  type IProjectRepository,
} from "@/types";

import { ValidationSummary } from "./validation-summary";
import { makeDep, makeRepoConfig, type IWizardState } from "./wizard-state";

export type { IWizardState } from "./wizard-state";

/** A native select styled like the app's inputs — keeps the wizard dependency-free. */
function Select({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border bg-input/30 px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

/* ---------- Step 1: Details ---------- */
export function StepDetails({
  state,
  update,
}: {
  state: IWizardState;
  update: (patch: Partial<IWizardState>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bundle-name">Bundle name</Label>
        <Input
          id="bundle-name"
          autoFocus
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Customer Platform"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bundle-purpose">Purpose</Label>
        <Input
          id="bundle-purpose"
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Full web, API and shared library runtime"
        />
      </div>
      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        A System Bundle is a coordinated product or subsystem — for example a web application, its API,
        and a shared library that ship together. It is not another Git repository.
      </p>
    </div>
  );
}

/* ---------- Step 2: Repositories ---------- */
export function StepRepositories({
  state,
  update,
  repos,
}: {
  state: IWizardState;
  update: (patch: Partial<IWizardState>) => void;
  repos: IProjectRepository[];
}) {
  const selectedIds = new Set(state.repos.map((c) => c.project_repository_id));

  function toggle(repo: IProjectRepository) {
    if (selectedIds.has(repo.id)) {
      update({ repos: state.repos.filter((c) => c.project_repository_id !== repo.id) });
    } else {
      update({ repos: [...state.repos, makeRepoConfig(repo, state.repos.length)] });
    }
  }

  if (repos.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Connect repositories on the Repositories tab first.
      </p>
    );
  }

  return (
    <div className="space-y-0.5 rounded-md border p-1">
      {repos.map((repo) => (
        <label
          key={repo.id}
          className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-muted"
        >
          <Checkbox
            checked={selectedIds.has(repo.id)}
            onCheckedChange={() => toggle(repo)}
            aria-label={`Add ${repo.display_name}`}
          />
          <span className="min-w-0 flex-1 truncate">{repo.display_name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {REPOSITORY_TYPE_LABEL[repo.repository_type]}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ---------- Step 3: Configure ---------- */
export function StepConfigure({
  state,
  update,
  repoName,
  invalidPaths,
}: {
  state: IWizardState;
  update: (patch: Partial<IWizardState>) => void;
  repoName: (id: string) => string;
  invalidPaths: Set<string>;
}) {
  function patchRepo(id: string, patch: Partial<IBundleRepoConfig>) {
    update({
      repos: state.repos.map((c) => (c.project_repository_id === id ? { ...c, ...patch } : c)),
    });
  }

  if (state.repos.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Select repositories in the previous step.</p>;
  }

  return (
    <div className="space-y-3">
      {state.repos.map((c) => (
        <div key={c.project_repository_id} className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">{repoName(c.project_repository_id)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                ariaLabel="Repository type"
                value={c.repository_type}
                onChange={(v) => patchRepo(c.project_repository_id, { repository_type: v as ERepositoryType })}
              >
                {REPOSITORY_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {REPOSITORY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Branch</Label>
              <Input
                value={c.branch}
                onChange={(e) => patchRepo(c.project_repository_id, { branch: e.target.value })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Source path</Label>
              <Input
                value={c.source_path}
                onChange={(e) => patchRepo(c.project_repository_id, { source_path: e.target.value })}
                placeholder="(repo root)"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mount path</Label>
              <Input
                value={c.mount_path}
                onChange={(e) => patchRepo(c.project_repository_id, { mount_path: e.target.value })}
                aria-invalid={invalidPaths.has(c.project_repository_id)}
                className={cn("h-8", invalidPaths.has(c.project_repository_id) && "border-destructive")}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Select
                ariaLabel="Access"
                value={c.access}
                onChange={(v) => patchRepo(c.project_repository_id, { access: v as ERepoAccess })}
              >
                <option value={ERepoAccess.Write}>Write</option>
                <option value={ERepoAccess.Reference}>Reference</option>
              </Select>
              <span className="text-xs text-muted-foreground">
                {c.access === ERepoAccess.Write
                  ? "Agents may branch, commit and open PRs."
                  : "Read-only — searchable but never modified."}
              </span>
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Checkbox
                checked={c.required}
                onCheckedChange={(v) => patchRepo(c.project_repository_id, { required: Boolean(v) })}
                aria-label="Required"
              />
              Required
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Step 4: Dependencies + commands ---------- */
export function StepDependencies({
  state,
  update,
  repoName,
}: {
  state: IWizardState;
  update: (patch: Partial<IWizardState>) => void;
  repoName: (id: string) => string;
}) {
  const ids = state.repos.map((c) => c.project_repository_id);

  function patchRepo(id: string, patch: Partial<IBundleRepoConfig>) {
    update({ repos: state.repos.map((c) => (c.project_repository_id === id ? { ...c, ...patch } : c)) });
  }

  function addDep() {
    if (ids.length < 2) return;
    update({ deps: [...state.deps, makeDep(ids[0], ids[1])] });
  }

  function patchDep(index: number, patch: Partial<IBundleDependency>) {
    update({ deps: state.deps.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-sm font-medium">Build &amp; test commands</p>
        {state.repos.map((c) => (
          <div key={c.project_repository_id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
            <span className="truncate text-sm text-muted-foreground">{repoName(c.project_repository_id)}</span>
            <Input
              value={c.build_command}
              onChange={(e) => patchRepo(c.project_repository_id, { build_command: e.target.value })}
              placeholder="build command"
              className="h-8"
            />
            <Input
              value={c.test_command}
              onChange={(e) => patchRepo(c.project_repository_id, { test_command: e.target.value })}
              placeholder="test command"
              className="h-8"
            />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Dependencies (optional)</p>
          <button
            type="button"
            onClick={addDep}
            disabled={ids.length < 2}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            + Add dependency
          </button>
        </div>
        {state.deps.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dependencies. Add build-order links if one repo must build before another.</p>
        ) : (
          state.deps.map((d, i) => (
            <div key={d.key} className="flex items-center gap-2 text-sm">
              <Select
                ariaLabel="From repository"
                value={d.from_project_repository_id}
                onChange={(v) => patchDep(i, { from_project_repository_id: v })}
              >
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {repoName(id)}
                  </option>
                ))}
              </Select>
              <span className="text-muted-foreground">→</span>
              <Select
                ariaLabel="To repository"
                value={d.to_project_repository_id}
                onChange={(v) => patchDep(i, { to_project_repository_id: v })}
              >
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {repoName(id)}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => update({ deps: state.deps.filter((_, j) => j !== i) })}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* ---------- Step 5: Review ---------- */
export function StepReview({
  state,
  result,
  repoName,
}: {
  state: IWizardState;
  result: IBundleValidationResult;
  repoName: (id: string) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{state.name || "Untitled bundle"}</p>
        {state.description ? <p className="text-xs text-muted-foreground">{state.description}</p> : null}
      </div>
      <div className="space-y-1 rounded-lg border p-3 text-sm">
        {state.repos.map((c) => (
          <div key={c.project_repository_id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate">{repoName(c.project_repository_id)}</span>
            <span className="text-xs text-muted-foreground">{c.mount_path || "(root)"}</span>
            <span className="w-16 text-right text-xs text-muted-foreground">
              {c.access === ERepoAccess.Write ? "Write" : "Reference"}
            </span>
          </div>
        ))}
        {state.repos.length === 0 ? (
          <p className="text-xs text-muted-foreground">No repositories selected.</p>
        ) : null}
      </div>
      <ValidationSummary result={result} />
    </div>
  );
}
