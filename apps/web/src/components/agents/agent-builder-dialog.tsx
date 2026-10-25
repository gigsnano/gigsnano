"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useBundles, useCreateAgent } from "@/hooks/agents/use-agents";
import { cn } from "@/lib/utils";

const AVATAR_PALETTE = [
  "#f97316",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#22c55e",
  "#eab308",
  "#64748b",
];

const VOICES = [
  { id: "", label: "Default" },
  { id: "en-US-JennyNeural", label: "Jenny" },
  { id: "en-US-GuyNeural", label: "Guy" },
  { id: "en-GB-SoniaNeural", label: "Sonia" },
];

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function initialState() {
  return {
    name: "",
    persona: "",
    domain: "",
    instructions: "",
    avatarColor: AVATAR_PALETTE[0],
    voiceId: "",
    bundles: [] as string[],
  };
}

export function AgentBuilderDialog({
  workspaceSlug,
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState(initialState);
  const { data: bundles } = useBundles(workspaceSlug);
  const create = useCreateAgent(workspaceSlug);
  const selectedBundles = new Set(form.bundles);

  const toggleBundle = (key: string) => {
    setForm((f) => ({
      ...f,
      bundles: f.bundles.includes(key)
        ? f.bundles.filter((b) => b !== key)
        : [...f.bundles, key],
    }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    create.mutate(
      {
        name: form.name.trim(),
        persona: form.persona.trim(),
        domain: form.domain.trim() || "general",
        instructions: form.instructions.trim(),
        avatar_color: form.avatarColor,
        voice_id: form.voiceId,
        bundles: form.bundles,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm(initialState());
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogTitle>New agent</DialogTitle>
        <DialogDescription>
          Compose a custom specialist for this workspace's callable roster.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="agent-name">
            Name
            <Input
              id="agent-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Finance"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="agent-persona">
              Persona
              <Input
                id="agent-persona"
                value={form.persona}
                onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
                placeholder="Priya"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="agent-domain">
              Domain
              <Input
                id="agent-domain"
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                placeholder="finance"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="agent-instructions">
            Instructions
            <textarea
              id="agent-instructions"
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={3}
              className={cn(field, "min-h-[4.5rem] py-2")}
            />
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Avatar colour</legend>
            <div className="flex flex-wrap gap-2">
              {AVATAR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use avatar colour ${color}`}
                  aria-pressed={form.avatarColor === color}
                  onClick={() => setForm((f) => ({ ...f, avatarColor: color }))}
                  className={cn(
                    "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                    form.avatarColor === color ? "ring-2 ring-ring" : "hover:opacity-80",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="agent-voice">
            Voice
            <select
              id="agent-voice"
              value={form.voiceId}
              onChange={(e) => setForm((f) => ({ ...f, voiceId: e.target.value }))}
              className={field}
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          {bundles?.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Capability bundles</legend>
              {bundles.map((bundle) => (
                <label
                  key={bundle.key}
                  htmlFor={`agent-bundle-${bundle.key}`}
                  className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                >
                  <Checkbox
                    id={`agent-bundle-${bundle.key}`}
                    checked={selectedBundles.has(bundle.key)}
                    onCheckedChange={() => toggleBundle(bundle.key)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{bundle.label}</span>
                    <span className="text-xs text-muted-foreground">{bundle.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !form.name.trim()}>
              {create.isPending ? "Creating…" : "Create agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
