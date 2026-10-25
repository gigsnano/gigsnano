"use client";

import { useState } from "react";

import { contentService } from "@/services/content.service";
import type { IContentError } from "@/types/content/source-mode";

type Json = Record<string, unknown>;

/** Cached on entering source mode: the canonical json and the markdown we showed. */
export interface ISourceCache {
  json: Json;
  markdown: string;
}

export type TExitDecision =
  | { kind: "restore"; json: Json }
  | { kind: "parse"; markdown: string };

/** Pure exit rule: an unedited buffer restores the cached json verbatim (lossless
 *  by construction); an edited buffer must be re-parsed + validated. */
export function decideExit({
  cached,
  buffer,
}: {
  cached: ISourceCache;
  buffer: string;
}): TExitDecision {
  if (buffer === cached.markdown) return { kind: "restore", json: cached.json };
  return { kind: "parse", markdown: buffer };
}

export function useSourceMode({
  getJson,
  setJson,
}: {
  getJson: () => Json;
  setJson: (json: Json) => void;
}) {
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const [cache, setCache] = useState<ISourceCache | null>(null);
  const [buffer, setBuffer] = useState("");
  const [errors, setErrors] = useState<IContentError[]>([]);
  const [lossy, setLossy] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const sourceDirty = cache !== null && buffer !== cache.markdown;

  const enter = () => {
    const json = getJson();
    setBusy(true);
    contentService
      .toMarkdown(json)
      .then(({ markdown, lossy: lossyTypes }) => {
        setCache({ json, markdown });
        setBuffer(markdown);
        setLossy(lossyTypes);
        setErrors([]);
        setMode("source");
      })
      .catch(() => {
        // network failure: stay visual, busy cleared by finally below
      })
      .finally(() => setBusy(false));
  };

  /** Returns a promise that resolves true if the switch happened, false if blocked. */
  const exit = (): Promise<boolean> => {
    if (!cache) return Promise.resolve(true);
    const decision = decideExit({ cached: cache, buffer });
    if (decision.kind === "restore") {
      setJson(decision.json);
      setMode("visual");
      setCache(null);
      return Promise.resolve(true);
    }
    setBusy(true);
    return contentService
      .fromMarkdown(decision.markdown)
      .then(({ json, errors: parseErrors }) => {
        if (parseErrors.length || !json) {
          setErrors(parseErrors.length ? parseErrors : [{ message: "Could not parse Markdown" }]);
          return false; // stay in source; buffer preserved; canonical json untouched
        }
        setJson(json);
        setMode("visual");
        setCache(null);
        setErrors([]);
        return true;
      })
      .catch(() => {
        // network failure: stay in source; buffer preserved; canonical json untouched
        setErrors([{ message: "Could not parse Markdown" }]);
        return false;
      })
      .finally(() => setBusy(false));
  };

  return { mode, buffer, setBuffer, errors, lossy, sourceDirty, busy, enter, exit };
}
