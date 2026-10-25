import { contentLines } from "@/lib/workspace/file-preview";

/** Plain monospace block with line numbers (fallback when Shiki has no grammar). */
export function PlainCodeBlock({ content }: { content: string }) {
  const lines = contentLines(content);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse font-mono text-xs leading-relaxed">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="hover:bg-muted/30">
              <td
                className="sticky left-0 w-10 select-none border-r bg-muted/40 px-2 py-0 text-right align-top text-muted-foreground/70"
                aria-hidden
                tabIndex={-1}
              >
                {index + 1}
              </td>
              <td className="whitespace-pre px-4 py-0 text-foreground/90">{line || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
