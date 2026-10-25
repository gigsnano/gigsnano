"use client";

import { isValidElement, type ReactNode } from "react";
import type { Components } from "streamdown";
import { cn } from "@/lib/utils";
import { looksLikeFlow, parseFlowArtifact } from "@/lib/code/flow-artifact";
import { Citation } from "./citation";
import { FlowDiagram } from "./flow-diagram";

/** Flatten a rendered markdown node back to its raw text (code fences aren't
 * syntax-highlighted here, so this is usually a single string). */
function nodeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * Element renderers for chat markdown. Streamdown ships a document-scale
 * typographic default (24px h2, 1rem block rhythm) that reads as a raw doc
 * inside a chat bubble. These overrides take explicit control so replies sit at
 * chat scale, inherit theme tokens, and give inline code real contrast against
 * the `bg-muted` bubble — rather than fighting Streamdown's baked utilities on
 * specificity. Defined at module scope (stable identities; not per-render).
 */
export const chatMarkdownComponents: Components = {
  h1: ({ className, ...props }) => (
    <h1 className={cn("mt-3.5 text-base font-semibold tracking-tight first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-3.5 text-[15px] font-semibold tracking-tight first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-3 text-sm font-semibold tracking-tight first:mt-0", className)} {...props} />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn("mt-3 text-[13px] font-semibold text-muted-foreground first:mt-0", className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("text-sm leading-relaxed", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("list-disc space-y-1.5 pl-[1.15rem] marker:text-muted-foreground/70", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn("list-decimal space-y-1.5 pl-[1.35rem] marker:font-medium marker:text-muted-foreground/70", className)}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("text-sm leading-relaxed [&>ol]:mt-1 [&>ul]:mt-1", className)} {...props} />
  ),
  a: ({ className, href, children, ...props }) => {
    if (typeof href === "string" && href.startsWith("#gigs-cite:")) {
      return <Citation href={href}>{children}</Citation>;
    }
    return (
      <a
        className={cn(
          "font-medium text-primary underline underline-offset-2 transition-opacity hover:opacity-70",
          className,
        )}
        href={href}
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },
  hr: ({ className, ...props }) => (
    <hr className={cn("my-3 border-border", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("border-l-2 border-border pl-3 text-muted-foreground", className)}
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    // Fenced blocks carry a `language-*` class and are wrapped by <pre>; leave
    // those unstyled here (the `pre` override frames them). Everything else is
    // inline code — render a compact chip with contrast against the bubble.
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code className={cn("font-mono text-[0.8em]", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded-[5px] bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ className, children, ...props }) => {
    // Code Intelligence flow artifacts arrive as a JSON code fence; render valid
    // ones as an interactive diagram instead of raw JSON (GIN-314). Anything that
    // isn't a valid flow (ordinary JSON, other languages, streaming-partial) falls
    // straight through to the normal code block — never misclassified.
    const text = nodeText(children);
    if (looksLikeFlow(text)) {
      const parsed = parseFlowArtifact(text);
      if (parsed.ok) return <FlowDiagram flow={parsed.flow} source={text} />;
    }
    return (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border border-border/60 bg-foreground/[0.06] p-2.5 text-[0.8em] leading-relaxed",
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    );
  },
};
