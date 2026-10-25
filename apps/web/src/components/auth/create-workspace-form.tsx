"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCreateWorkspace } from "@/hooks/auth/use-auth";
import { APIError } from "@/services/api-error";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateWorkspaceForm({
  onCreated,
  className,
}: {
  onCreated?: (slug: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ws = await create.mutateAsync({
        name: name.trim(),
        slug: (slug || name).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      });
      if (onCreated) onCreated(ws.slug);
      else router.push(`/${ws.slug}`);
    } catch (err) {
      setError(
        err instanceof APIError && err.status === 409
          ? "That workspace URL is already taken. Try another."
          : "Couldn't create the workspace. Please try again.",
      );
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn("w-full max-w-md rounded-xl border bg-card p-6 shadow-sm", className)}
    >
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Create a workspace</h1>
        <p className="text-sm text-muted-foreground">
          A workspace holds your projects, sprints, and team.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Workspace name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Workspace URL
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            gigsnano.app/
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme"
              className={field}
            />
          </span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="mt-5 w-full transition-transform duration-150 ease-out active:scale-[0.97]"
        disabled={create.isPending}
      >
        {create.isPending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
