"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";

import { cn } from "@/lib/utils";
import type { IContentError } from "@/types/content/source-mode";

/** CodeMirror 6 Markdown editor for the editor's source mode (GIN-307). Controlled by
 *  `value`; emits edits via `onChange`; renders parse `errors` as lint diagnostics. */
export function MarkdownSourceEditor({
  value,
  onChange,
  errors,
  autoFocus = true,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  errors: IContentError[];
  autoFocus?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Build the view once; keep it out of React's render path.
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.contentAttributes.of({ "aria-label": "Markdown source" }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-doctor/exhaustive-deps -- construct once; `value` is synced by the effect below and edits flow out via updateListener.
  }, []);

  // Sync external value changes (e.g. re-entering source) without losing the cursor.
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  // Reflect parse errors as CodeMirror lint diagnostics (line/col when known).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const diagnostics: Diagnostic[] = errors.map((e) => {
      const line = Math.min(Math.max((e.line ?? 1) - 1, 0), v.state.doc.lines - 1);
      const from = v.state.doc.line(line + 1).from + Math.max((e.col ?? 1) - 1, 0);
      return { from, to: from + 1, severity: "error", message: e.message };
    });
    v.dispatch(setDiagnostics(v.state, diagnostics));
  }, [errors]);

  return (
    <div
      ref={host}
      role="group"
      aria-label="Markdown source editor"
      className={cn("gn-source-editor rounded-md border text-sm", className)}
    />
  );
}
