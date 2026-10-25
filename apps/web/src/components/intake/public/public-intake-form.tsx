"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, InboxIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubmitPublicIntake } from "@/hooks/intake/use-intake";

export function PublicIntakeForm({ token }: { token: string }) {
  const submit = useSubmitPublicIntake(token);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — real users never fill this
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (company || !title.trim()) return; // bot trap + required guard
    submit.mutate(
      { title: title.trim(), body: body.trim(), email: email.trim() || null },
      { onSuccess: () => setDone(true) },
    );
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={InboxIcon} className="size-5" />
          <span className="text-sm font-medium">Submit a request</span>
        </div>

        {done ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-300">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-7" />
            </div>
            <h1 className="text-lg font-semibold">Thanks — we got it</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your request is in the queue. The team will triage it shortly.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                setTitle("");
                setBody("");
                setEmail("");
                setDone(false);
              }}
            >
              Submit another
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border bg-card p-6 shadow-sm">
            <label htmlFor="pi-title" className="text-sm font-medium">
              What do you need?
            </label>
            <Input
              id="pi-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of your request"
              className="mt-1.5"
              maxLength={300}
              required
            />

            <label htmlFor="pi-body" className="mt-4 block text-sm font-medium">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="pi-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Steps, context, links — anything that helps."
              rows={5}
              className="mt-1.5 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />

            <label htmlFor="pi-email" className="mt-4 block text-sm font-medium">
              Your email <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="pi-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1.5"
            />

            {/* Honeypot: visually hidden, off-tab; bots fill it, humans don't. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="hidden"
            />

            {submit.isError ? (
              <p className="mt-3 text-sm text-destructive">
                Couldn&apos;t submit — the link may be invalid or expired.
              </p>
            ) : null}

            <Button
              type="submit"
              className="mt-5 w-full"
              disabled={!title.trim() || submit.isPending}
            >
              {submit.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">Powered by GigsNano</p>
      </div>
    </main>
  );
}
