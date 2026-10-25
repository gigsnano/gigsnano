"use client";

import { useEffect, useRef } from "react";

import { RichEditor } from "@/components/editor";
import { imageService } from "@/services/image.service";
import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import type { IProject, IUpdateProjectPayload } from "@/types";

/**
 * The Overview document: an editable project-name line + the seamless inline
 * rich editor bound to `project.overview`. Both autosave (debounced) via
 * `onChange`.
 */
export function OverviewEditor({
  project,
  onChange,
}: {
  project: IProject;
  onChange: (payload: IUpdateProjectPayload) => void;
}) {
  const [name, setName] = useAdjustedState(project.name);
  const timers = useRef<{ name?: ReturnType<typeof setTimeout>; overview?: ReturnType<typeof setTimeout> }>({});

  const debouncedSave = (key: "name" | "overview", payload: IUpdateProjectPayload) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => onChange(payload), 600);
  };

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.name);
      clearTimeout(t.overview);
    };
  }, []);

  return (
    <div className="mt-10">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          const next = e.target.value.trim();
          if (next) debouncedSave("name", { name: next });
        }}
        aria-label="Project name"
        placeholder="Untitled project"
        className="mb-3 w-full bg-transparent text-2xl font-semibold leading-tight tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <RichEditor
        value={project.overview}
        onChange={(html) => debouncedSave("overview", { overview: html })}
        onUploadImage={(file) => imageService.uploadImage(project.workspace_slug, file, project.id)}
      />
    </div>
  );
}
