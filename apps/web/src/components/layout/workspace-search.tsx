"use client";

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Folder01Icon,
  Target01Icon,
  FileEditIcon,
  GridViewIcon,
  Layers01Icon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons";

import { useProjects } from "@/hooks/project/use-projects";
import { useWorkspaceSearch } from "@/hooks/workspace/use-workspace-search";
import { useCommandChords, type ChordMap } from "@/hooks/use-command-chords";
import {
  visibleCommands,
  type ICommand,
  type ICommandContext,
} from "@/lib/nav/command-registry";
import {
  CREATE_COMMANDS,
  NAVIGATE_COMMANDS,
  MISC_COMMANDS,
  PREFERENCES_COMMANDS,
  HELP_COMMANDS,
} from "@/lib/nav/command-actions";
import { useCommandPaletteStore, type CreateKind } from "@/store/ui/command-palette.store";
import { usePanelStore } from "@/store/ui/panel.store";
import { useAiPaneStore } from "@/store/ui/ai-pane.store";
import { Switch } from "@/components/ui/switch";
import { CreateContainerFlow } from "@/components/solutions";
import { CreateWorkItemModal } from "@/components/board/story/create-work-item-modal";
import { CreatePageDialog } from "@/components/pages/create-page-dialog";
import { CreateViewDialog } from "@/components/views/create-view-dialog";
import { SubPicker } from "@/components/layout/command-palette/sub-picker";
import { ContextualActions } from "@/components/layout/command-palette/contextual-actions";
import { KeyboardShortcutsDialog } from "@/components/layout/command-palette/keyboard-shortcuts-dialog";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

/** "gh" -> "g:h" (plain two-key chord). Modifier chords land in a later task. */
function chordKey(sequence: string): string {
  return sequence.split("").join(":");
}

/** Renders a key sequence like "gh" as `G then H` using keycaps. */
function ChordHint({ sequence }: { sequence: string }) {
  const keys = sequence.includes("+") ? sequence.split("+") : sequence.split("");
  return (
    <CommandShortcut className="flex items-center gap-1 tracking-normal">
      {/* `keys` is a fixed-order split of the immutable `sequence` prop — it never
          reorders or filters, so the index is a stable key here. */}
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">{/* eslint-disable-line react-doctor/no-array-index-as-key */}
          {i > 0 ? <span className="text-[10px] text-muted-foreground/70">then</span> : null}
          <kbd className="inline-flex min-w-5 justify-center rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase">
            {k}
          </kbd>
        </span>
      ))}
    </CommandShortcut>
  );
}

export function WorkspaceSearch({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const params = useParams();
  const routeProjectId = typeof params?.projectId === "string" ? params.projectId : undefined;
  const routeStoryId = typeof params?.storyId === "string" ? params.storyId : undefined;
  const base = `/${workspaceSlug}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Workspace-level ON = search the whole workspace (Plane's footer toggle).
  // OFF scopes results to the project you're currently in (if any).
  const [workspaceLevel, setWorkspaceLevel] = useState(true);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [workItemProjectId, setWorkItemProjectId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const page = useCommandPaletteStore((s) => s.page);
  const setPage = useCommandPaletteStore((s) => s.setPage);
  const openCreateTarget = useCommandPaletteStore((s) => s.openCreate);
  const createTarget = useCommandPaletteStore((s) => s.createTarget);
  const clearCreate = useCommandPaletteStore((s) => s.clearCreate);

  // Kept unconditional (not gated on `open`/query) — also feeds the create-work-item
  // project fallback below, independent of search.
  const { data: projects } = useProjects(workspaceSlug);
  const { data: searchResults } = useWorkspaceSearch(
    workspaceSlug,
    { q: debouncedQ, scope: workspaceLevel ? "workspace" : "project", projectId: routeProjectId },
    open,
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // ⌘K / Ctrl-K toggles the palette from anywhere. No open/close animation — a
  // palette opened hundreds of times a day should feel instant (Raycast rule).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closing the palette (Escape at the root page, click-outside, picking a
  // result) always drops back to the root command list next time it opens.
  useEffect(() => {
    if (!open) setPage(null);
  }, [open, setPage]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const closePalette = () => {
    setOpen(false);
    setQuery("");
  };

  // Escape backs out of a sub-picker instead of closing the dialog; Backspace
  // on an empty query does the same (mirrors Plane's wrapper.tsx keydown).
  // Called from CommandInput, where focus lives for the whole session (cmdk
  // keeps DOM focus in the input even while navigating the list) — stopping
  // propagation here keeps Escape from reaching Radix's own close-on-Escape
  // listener.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (page === null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setPage(null);
    } else if (e.key === "Backspace" && query === "") {
      e.preventDefault();
      setPage(null);
    }
  };

  const runCreate = (kind: CreateKind) => {
    setOpen(false);
    setQuery("");
    if (kind === "project") {
      setProjectDialogOpen(true);
    } else if (kind === "workspace") {
      router.push("/create-workspace");
    } else if (kind === "work-item") {
      // Work items need a project. Prefer the one you're in, else the first project.
      const pid = routeProjectId ?? projects?.[0]?.id;
      if (pid) setWorkItemProjectId(pid);
      else router.push(`${base}/projects`);
    } else {
      // page/view dialogs are mounted below, driven by `createTarget`.
      // TODO(GIN-35): cycle/module create dialogs
      openCreateTarget(kind);
    }
  };

  const ctx: ICommandContext = { base, workspaceSlug, projectId: routeProjectId };
  const createCmds = visibleCommands(CREATE_COMMANDS, ctx);
  const navCmds = visibleCommands(NAVIGATE_COMMANDS, ctx);
  const miscCmds = visibleCommands(MISC_COMMANDS, ctx);
  const prefCmds = visibleCommands(PREFERENCES_COMMANDS, ctx);
  const helpCmds = visibleCommands(HELP_COMMANDS, ctx);

  const runCommand = (cmd: ICommand) => {
    if (cmd.id === "toggle-sidebar") {
      usePanelStore.getState().toggleCollapsed();
      setOpen(false);
      return;
    }
    if (cmd.id === "open-ai-assistant") {
      useAiPaneStore.getState().setOpen(true);
      setOpen(false);
      return;
    }
    if (cmd.id === "copy-page-url") {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
      setOpen(false);
      return;
    }
    if (cmd.id === "focus-search") {
      // Opening the dialog is enough — Radix auto-focuses the first focusable
      // element inside it, which is CommandInput's underlying <input>.
      setOpen(true);
      return;
    }
    if (cmd.id === "open-keyboard-shortcuts") {
      setOpen(false);
      setShortcutsOpen(true);
      return;
    }
    if (cmd.id === "open-docs") {
      window.open("https://docs.gigsnano.com", "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }
    if (cmd.id === "report-bug") {
      window.open(
        "https://github.com/gigsnano/gigsnano/issues",
        "_blank",
        "noopener,noreferrer",
      );
      setOpen(false);
      return;
    }
    if (cmd.type === "change-page") {
      // Fired from a chord while the palette is closed too — open it, else
      // `page` gets armed invisibly and the next ⌘K opens straight into a
      // stale sub-picker (the reset effect below only clears `page` on
      // open -> false, never while the palette stays closed).
      if (cmd.page) {
        setPage(cmd.page);
        setOpen(true);
      }
      return;
    }
    if (cmd.href) {
      go(cmd.href(ctx));
      return;
    }
    if (cmd.id.startsWith("create-")) {
      runCreate(cmd.id.replace("create-", "") as CreateKind);
    }
  };

  function renderCommand(cmd: ICommand) {
    return (
      <CommandItem key={cmd.id} value={cmd.label} onSelect={() => runCommand(cmd)}>
        <HugeiconsIcon icon={cmd.icon} />
        <span>{cmd.label}</span>
        {cmd.keySequence ? <ChordHint sequence={cmd.keySequence} /> : null}
      </CommandItem>
    );
  }

  // Global two-key chords (G→H, N→I, …) and modifier/single-key shortcuts
  // (Ctrl+B, Ctrl+Shift+C, Ctrl+/, plain /). Rebuilt each render; the hook
  // reads both maps through refs so the listener subscribes once.
  const allCmds = [...createCmds, ...navCmds, ...miscCmds, ...prefCmds, ...helpCmds];
  const chordMap: ChordMap = {};
  const modifierMap: ChordMap = {};
  for (const cmd of allCmds) {
    if (!cmd.keySequence) continue;
    if (/^[a-z]{2}$/.test(cmd.keySequence)) {
      chordMap[chordKey(cmd.keySequence)] = () => runCommand(cmd);
    } else if (cmd.keySequence.includes("+") || cmd.keySequence === "/") {
      modifierMap[cmd.keySequence] = () => runCommand(cmd);
    }
  }
  useCommandChords(chordMap, modifierMap);

  const searchProjects = searchResults?.projects ?? [];
  const searchWorkItems = searchResults?.work_items ?? [];
  const searchCycles = searchResults?.cycles ?? [];
  const searchModules = searchResults?.modules ?? [];
  const searchViews = searchResults?.views ?? [];
  const searchPages = searchResults?.pages ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="hidden h-8 w-full min-w-0 max-w-md items-center gap-2 overflow-hidden rounded-md border bg-sidebar-accent/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 sm:flex"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
        <span className="truncate">Search…</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
          <span className="text-sm leading-none">⌘</span>K
        </kbd>
      </button>
      {/* Below sm the search field doesn't fit; an icon opens the same palette. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:scale-[0.97] sm:hidden"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-[18px]" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        // Plane parity: wide panel (max-w-2xl), positioned toward the top, no
        // close button (the [&>button] child is Dialog's X).
        className="top-[12vh] max-w-2xl translate-y-0 gap-0 [&>button]:hidden"
      >
        <CommandInput
          placeholder="Type a command or search…"
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleKeyDown}
        />
        {page !== null ? (
          <button
            type="button"
            onClick={() => setPage(null)}
            className="flex items-center gap-1.5 border-b px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            Back
          </button>
        ) : null}
        {query === "" && page === null && !(routeStoryId && routeProjectId) ? (
          <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
            Type to search across the workspace
          </p>
        ) : null}
        <CommandList className="max-h-96">
          <CommandEmpty>No results found.</CommandEmpty>

          {page === "update-work-item-state" || page === "update-work-item-priority" ? (
            routeStoryId && routeProjectId ? (
              <ContextualActions
                workspaceSlug={workspaceSlug}
                projectId={routeProjectId}
                storyId={routeStoryId}
                page={page}
                setPage={setPage}
                go={go}
                closePalette={closePalette}
              />
            ) : null
          ) : page !== null ? (
            <SubPicker page={page} ctx={ctx} go={go} onBack={() => setPage(null)} />
          ) : (
            <>
              {routeStoryId && routeProjectId ? (
                <ContextualActions
                  workspaceSlug={workspaceSlug}
                  projectId={routeProjectId}
                  storyId={routeStoryId}
                  page={page}
                  setPage={setPage}
                  go={go}
                  closePalette={closePalette}
                />
              ) : null}

              <CommandGroup heading="Create">{createCmds.map(renderCommand)}</CommandGroup>

              <CommandGroup heading="Navigate">{navCmds.map(renderCommand)}</CommandGroup>

              <CommandGroup heading="Miscellaneous">{miscCmds.map(renderCommand)}</CommandGroup>

              <CommandGroup heading="Preferences">{prefCmds.map(renderCommand)}</CommandGroup>

              <CommandGroup heading="Help">{helpCmds.map(renderCommand)}</CommandGroup>

              {searchProjects.length > 0 ? (
                <CommandGroup heading="Projects">
                  {searchProjects.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`project ${p.name} ${p.identifier}`}
                      onSelect={() => go(`${base}/projects/${p.id}`)}
                    >
                      <HugeiconsIcon icon={Folder01Icon} />
                      <span>{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p.identifier}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchWorkItems.length > 0 ? (
                <CommandGroup heading="Work items">
                  {searchWorkItems.map((w) => (
                    <CommandItem
                      key={w.id}
                      value={`work-item ${w.title} ${w.story_number ?? ""}`}
                      onSelect={() => go(`${base}/projects/${w.project_id}/issues/${w.id}`)}
                    >
                      <HugeiconsIcon icon={Target01Icon} />
                      <span className="truncate">{w.title}</span>
                      {w.story_number != null ? (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">#{w.story_number}</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchCycles.length > 0 ? (
                <CommandGroup heading="Cycles">
                  {searchCycles.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`cycle ${c.name}`}
                      onSelect={() => go(`${base}/projects/${c.project_id}/cycles/${c.id}`)}
                    >
                      <HugeiconsIcon icon={GridViewIcon} />
                      <span className="truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchModules.length > 0 ? (
                <CommandGroup heading="Modules">
                  {searchModules.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`module ${m.name}`}
                      onSelect={() => go(`${base}/projects/${m.project_id}/modules/${m.id}`)}
                    >
                      <HugeiconsIcon icon={Layers01Icon} />
                      <span className="truncate">{m.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchViews.length > 0 ? (
                <CommandGroup heading="Views">
                  {searchViews.map((v) => (
                    <CommandItem
                      key={v.id}
                      value={`view ${v.name}`}
                      onSelect={() => go(`${base}/projects/${v.project_id}/views/${v.id}`)}
                    >
                      <HugeiconsIcon icon={GridViewIcon} />
                      <span className="truncate">{v.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchPages.length > 0 ? (
                <CommandGroup heading="Pages">
                  {searchPages.map((pg) => (
                    <CommandItem
                      key={pg.id}
                      value={`page ${pg.title}`}
                      onSelect={() => go(`${base}/projects/${pg.project_id}/pages/${pg.id}`)}
                    >
                      <HugeiconsIcon icon={FileEditIcon} />
                      <span className="truncate">{pg.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          )}
        </CommandList>

        <div className="flex w-full items-center justify-between rounded-b-lg border-t bg-muted/40 px-4 py-2">
          <div />
          <div className="flex items-center gap-2">
            <label htmlFor="cmd-workspace-level" className="text-xs text-muted-foreground">
              Workspace level
            </label>
            <Switch
              id="cmd-workspace-level"
              checked={workspaceLevel}
              onCheckedChange={setWorkspaceLevel}
              disabled={!routeProjectId}
            />
          </div>
        </div>
      </CommandDialog>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Headless create dialogs driven by the palette. */}
      <CreateContainerFlow
        workspaceSlug={workspaceSlug}
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
      />
      {workItemProjectId ? (
        <CreateWorkItemModal
          workspaceSlug={workspaceSlug}
          projectId={workItemProjectId}
          open
          onOpenChange={(next) => {
            if (!next) setWorkItemProjectId(null);
          }}
        />
      ) : null}
      {routeProjectId ? (
        <>
          <CreatePageDialog
            workspaceSlug={workspaceSlug}
            projectId={routeProjectId}
            open={createTarget === "page"}
            onOpenChange={(next) => {
              if (!next) clearCreate();
            }}
          />
          <CreateViewDialog
            workspaceSlug={workspaceSlug}
            projectId={routeProjectId}
            open={createTarget === "view"}
            onOpenChange={(next) => {
              if (!next) clearCreate();
            }}
          />
        </>
      ) : null}
    </>
  );
}
