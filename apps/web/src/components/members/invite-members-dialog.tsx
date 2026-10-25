"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { useUsers } from "@/hooks/workspace/use-users";
import { useMembers } from "@/hooks/workspace/use-members";
import { useInviteMembers } from "@/hooks/workspace/use-invitations";
import { useProjects } from "@/hooks/project/use-projects";
import { useLimitStatus } from "@/hooks/billing/use-entitlements";
import { UpgradeNudge } from "@/components/billing/gates";
import { EEntitlementLimit } from "@/constants/plans";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ASSIGNABLE_PROJECT_ROLES,
  ASSIGNABLE_WORKSPACE_ROLES,
  PROJECT_ROLE_LABEL,
  WORKSPACE_ROLE_LABEL,
} from "@/constants/roles";
import {
  addRecipients,
  removeRecipient,
  sendableRecipients,
  RECIPIENT_PROBLEM_LABEL,
  type IRecipient,
} from "@/lib/members/recipient-parse";
import { cn } from "@/lib/utils";
import { EProjectRole, EWorkspaceRole, type IRecipientResult, type IUser } from "@/types";

/** Matches the server's cap so the limit is visible before submission rather
 *  than discovered as a rejection. */
const MAX_BATCH = 50;

const OUTCOME_TONE: Record<string, "ok" | "warn" | "bad"> = {
  sent: "ok",
  resent: "ok",
  already_member: "warn",
  already_invited: "warn",
  invalid: "bad",
  disposable: "bad",
  failed: "bad",
};

function RecipientChip({
  recipient,
  onRemove,
}: {
  recipient: IRecipient;
  onRemove: () => void;
}) {
  const problem = recipient.problem;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        "transition-colors",
        problem
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
      // The chip itself carries the reason, so a screen reader hears why an
      // address is rejected without having to find separate error text.
      title={problem ? RECIPIENT_PROBLEM_LABEL[problem] : undefined}
    >
      {problem ? (
        <HugeiconsIcon icon={Alert01Icon} className="size-3 shrink-0" aria-hidden />
      ) : null}
      <span className="truncate">{recipient.display}</span>
      <span className="sr-only">
        {problem ? `. ${RECIPIENT_PROBLEM_LABEL[problem]}` : ""}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${recipient.display}`}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
      </button>
    </span>
  );
}

function ResultRow({ result }: { result: IRecipientResult }) {
  const tone = OUTCOME_TONE[result.outcome] ?? "warn";
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <HugeiconsIcon
        icon={tone === "ok" ? CheckmarkCircle02Icon : Alert01Icon}
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          tone === "ok" && "text-primary",
          tone === "warn" && "text-muted-foreground",
          tone === "bad" && "text-destructive",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{result.email}</span>
        <span className="block text-muted-foreground">{result.detail}</span>
      </span>
    </li>
  );
}

/**
 * Invite people to the workspace, optionally with project access attached.
 *
 * There is no project-level invitation. A seat is a workspace act — billing and
 * identity both live there — so a project invite is this same invitation
 * carrying a grant that is applied the moment it is accepted (GIN-529). That is
 * why the project page mounts this dialog with `project` preset rather than
 * having an invite flow of its own.
 */
export function InviteMembersDialog({
  workspaceSlug,
  project,
  trigger,
}: {
  workspaceSlug: string;
  /** Preset the grant and hide the picker — the project page already answered it. */
  project?: { id: string; name: string };
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [recipients, setRecipients] = useState<IRecipient[]>([]);
  const [role, setRole] = useState<EWorkspaceRole>(EWorkspaceRole.Member);
  const [projectIds, setProjectIds] = useState<string[]>(project ? [project.id] : []);
  const [projectRole, setProjectRole] = useState<EProjectRole>(EProjectRole.Member);
  const [results, setResults] = useState<IRecipientResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: members } = useMembers(workspaceSlug);
  // Only for the picker; on a project page the preset makes this list unused.
  const { data: projects } = useProjects(workspaceSlug);
  const invite = useInviteMembers(workspaceSlug);
  const { atLimit: seatsAtLimit } = useLimitStatus(
    workspaceSlug,
    EEntitlementLimit.Seats,
    (members ?? []).length,
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: page, isPending: isLoadingUsers } = useUsers({
    q: debouncedQ || undefined,
    limit: 8,
    offset: 0,
  });

  const memberUserIds = new Set((members ?? []).map((m) => m.user_id));
  const chosen = new Set(recipients.map((r) => r.value));
  const directory: IUser[] = (page?.items ?? []).filter(
    (u) => !memberUserIds.has(u.id) && !chosen.has(u.email.toLowerCase()),
  );

  const sendable = sendableRecipients(recipients);
  const overLimit = recipients.length > MAX_BATCH;
  const selectedProjects = new Set(projectIds);

  function commitTyped(text: string) {
    if (!text.trim()) return;
    const { recipients: next } = addRecipients(recipients, text);
    setRecipients(next);
    setQuery("");
  }

  function pickUser(user: IUser) {
    const { recipients: next } = addRecipients(recipients, user.email);
    setRecipients(next);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter and comma both commit — typing "a@x.io," is as natural as pressing
    // Enter, and a tokenized field that only accepts one of them feels broken.
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTyped(query);
      return;
    }
    if (event.key === "Backspace" && !query && recipients.length) {
      setRecipients(recipients.slice(0, -1));
    }
  }

  function reset() {
    setRecipients([]);
    setQuery("");
    setResults(null);
    setRole(EWorkspaceRole.Member);
    setProjectIds(project ? [project.id] : []);
    setProjectRole(EProjectRole.Member);
  }

  function toggleProject(id: string) {
    setProjectIds((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  }

  function send() {
    // Commit whatever is still in the box: losing a typed address because the
    // user pressed the button instead of Enter is the classic tokenizer bug.
    const { recipients: pending } = addRecipients(recipients, query);
    const toSend = sendableRecipients(pending);
    if (!toSend.length) return;

    invite.mutate(
      {
        emails: toSend.map((r) => r.value),
        role,
        // Omitted rather than sent empty: the endpoint forbids unknown fields,
        // so an ordinary workspace invite keeps working against a backend that
        // predates grants instead of 422-ing on a key it means nothing by.
        ...(projectIds.length
          ? {
              project_grants: projectIds.map((id) => ({ project_id: id, role: projectRole })),
            }
          : {}),
      },
      {
        onSuccess: (data) => {
          setResults(data.results);
          setRecipients([]);
          setQuery("");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm">Invite members</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="text-sm font-semibold">
          {project ? `Invite to ${project.name}` : "Invite members"}
        </DialogTitle>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          {project
            ? // Said plainly, because it is the part people get wrong: there is
              // no project-only membership. The seat comes first, always.
              "Invitations are to the workspace. Whoever accepts joins this project straight away."
            : "Add existing users or invite new people by email."}
        </p>

        {seatsAtLimit ? (
          <UpgradeNudge
            title="Seat limit reached"
            description="Free includes 5 members. Upgrade to add more."
          />
        ) : results ? (
          <div className="flex flex-col gap-3">
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border px-3">
              {results.map((r) => (
                <ResultRow key={r.email} result={r} />
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={reset}>
                Invite more
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="invite-search" className="sr-only">
                Search people or enter an email address
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
                {recipients.map((r) => (
                  <RecipientChip
                    key={r.value}
                    recipient={r}
                    onRemove={() => setRecipients(removeRecipient(recipients, r.value))}
                  />
                ))}
                <input
                  id="invite-search"
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    // Only intercept an actual list; a single address should
                    // stay editable in the box like normal typing.
                    if (/[,;\n\r\t]/.test(text)) {
                      e.preventDefault();
                      commitTyped(text);
                    }
                  }}
                  onBlur={() => commitTyped(query)}
                  placeholder={recipients.length ? "" : "Search name or enter email…"}
                  className="h-6 min-w-[12rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Separate multiple addresses with commas. Up to {MAX_BATCH} at a time.
              </p>
            </div>

            {/* Fixed height, not max-height: the list shrinks a row at a time as
                the query debounces, and a centered dialog that resizes on every
                keystroke reads as the whole thing jumping. Reserve the space once
                and let the content change inside it. */}
            <div className="h-40 overflow-y-auto">
              {directory.length ? (
                <div>
                  <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                    People in your directory
                  </p>
                  {directory.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => pickUser(u)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <Avatar name={u.display_name} src={u.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {u.display_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : !isLoadingUsers && debouncedQ ? (
                <p className="px-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Mail01Icon} className="mr-1 inline size-3.5" aria-hidden />
                  No matching people — press Enter to invite {debouncedQ} by email.
                </p>
              ) : null}
            </div>

            {project ? (
              <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                They join{" "}
                <span className="font-medium text-foreground">{project.name}</span> as{" "}
                <span className="font-medium text-foreground">
                  {PROJECT_ROLE_LABEL[projectRole].toLowerCase()}
                </span>{" "}
                when they accept.
              </p>
            ) : (projects ?? []).length ? (
              <div>
                <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  Add to projects <span className="font-normal">(optional)</span>
                </p>
                <div className="max-h-28 overflow-y-auto rounded-md border p-1">
                  {(projects ?? []).map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="size-3.5 accent-primary"
                      />
                      <span className="truncate text-foreground">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {projectIds.length ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Project role
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Project role for these invitations: ${PROJECT_ROLE_LABEL[projectRole]}`}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {PROJECT_ROLE_LABEL[projectRole]}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ASSIGNABLE_PROJECT_ROLES.map((r) => (
                      <DropdownMenuItem key={r} onSelect={() => setProjectRole(r)}>
                        <span className="flex-1">{PROJECT_ROLE_LABEL[r]}</span>
                        {r === projectRole ? (
                          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-xs text-muted-foreground">
                  · applied when they accept
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Role</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Role for these invitations: ${WORKSPACE_ROLE_LABEL[role]}`}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {WORKSPACE_ROLE_LABEL[role]}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                      <DropdownMenuItem key={r} onSelect={() => setRole(r)}>
                        <span className="flex-1">{WORKSPACE_ROLE_LABEL[r]}</span>
                        {r === role ? (
                          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={send}
                  disabled={invite.isPending || overLimit || (!sendable.length && !query.trim())}
                >
                  {invite.isPending
                    ? "Sending…"
                    : `Send invitations${sendable.length ? ` (${sendable.length})` : ""}`}
                </Button>
              </div>
            </div>

            {overLimit ? (
              <p className="text-xs text-destructive">
                That&apos;s {recipients.length} recipients — remove {recipients.length - MAX_BATCH}{" "}
                to stay within the {MAX_BATCH} limit.
              </p>
            ) : null}
            {invite.isError ? (
              <p className="text-xs text-destructive">
                Couldn&apos;t send the invitations. Please try again.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
