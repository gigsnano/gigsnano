import type { ReactNode } from "react";

function InlineMarkdown({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>,
    );
    last = re.lastIndex;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  if (parts.length === 0) {
    return text;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return parts;
}

/** Minimal markdown renderer as structured React nodes (no raw HTML sink). */
export function SimpleMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listStartLine = -1;

  const flushList = (afterLine: number) => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(
      <ul key={`ul-${listStartLine}`} className="list-disc space-y-0.5 pl-5">
        {listItems}
      </ul>,
    );
    listItems = [];
    listStartLine = afterLine;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(lineIndex);
      continue;
    }

    const h3 = trimmed.match(/^### (.+)$/);
    if (h3) {
      flushList(lineIndex);
      blocks.push(
        <h3 key={`h3-${lineIndex}`} className="mb-1 mt-2 text-sm font-semibold">
          <InlineMarkdown text={h3[1]} />
        </h3>,
      );
      continue;
    }

    const h2 = trimmed.match(/^## (.+)$/);
    if (h2) {
      flushList(lineIndex);
      blocks.push(
        <h2 key={`h2-${lineIndex}`} className="mb-1 mt-3 text-base font-semibold">
          <InlineMarkdown text={h2[1]} />
        </h2>,
      );
      continue;
    }

    const h1 = trimmed.match(/^# (.+)$/);
    if (h1) {
      flushList(lineIndex);
      blocks.push(
        <h1 key={`h1-${lineIndex}`} className="mb-1 mt-3 text-lg font-semibold">
          <InlineMarkdown text={h1[1]} />
        </h1>,
      );
      continue;
    }

    const li = trimmed.match(/^[-*] (.+)$/);
    if (li) {
      if (listItems.length === 0) {
        listStartLine = lineIndex;
      }
      listItems.push(
        <li key={`li-${lineIndex}`}><InlineMarkdown text={li[1]} /></li>,
      );
      continue;
    }

    flushList(lineIndex);
    blocks.push(
      <p key={`p-${lineIndex}`} className="mb-1">
        <InlineMarkdown text={trimmed} />
      </p>,
    );
  }

  flushList(lines.length);

  return <div className={className}>{blocks}</div>;
}
