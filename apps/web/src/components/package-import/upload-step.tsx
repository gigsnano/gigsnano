"use client";

import { Add01Icon, File01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBytes, isTextFile, needsAttention, parseStateLabel } from "@/lib/package-import/intake";
import { cn } from "@/lib/utils";
import { EPackageDocType, type IDocumentPackage, type IUploadPackageFile } from "@/types";

/** Editable because the classifier is a heuristic and the user knows better.
 *  Correcting one keeps the AI verdict server-side rather than erasing it. */
const DOC_TYPE_LABEL: Record<EPackageDocType, string> = {
  [EPackageDocType.ProductRequirements]: "Product requirements",
  [EPackageDocType.Architecture]: "Architecture",
  [EPackageDocType.UiUx]: "UI/UX spec",
  [EPackageDocType.DesignSystem]: "Design system",
  [EPackageDocType.ImplementationPlan]: "Implementation plan",
  [EPackageDocType.TestPlan]: "Test plan",
  [EPackageDocType.Security]: "Security",
  [EPackageDocType.Deployment]: "Deployment",
  [EPackageDocType.ApiSpec]: "API spec",
  [EPackageDocType.DataModel]: "Data model",
  [EPackageDocType.Schedule]: "Schedule",
  [EPackageDocType.Unknown]: "Unclassified",
};

/** Read a File into what the API expects: text verbatim, binary as a data URL so
 *  the server's extractor receives real bytes. */
async function readFile(file: File): Promise<IUploadPackageFile> {
  const mime = file.type || "application/octet-stream";
  const content = await (isTextFile(file.name, mime)
    ? file.text()
    : new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }));
  return {
    // A folder upload carries its relative path; keep it so the server can
    // preserve the structure the package arrived in.
    file_name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    mime_type: mime,
    content,
  };
}

export function UploadStep({
  pkg,
  isUploading,
  error,
  onUpload,
  onContinue,
  onReclassify,
}: {
  pkg: IDocumentPackage | null;
  isUploading: boolean;
  error: string | null;
  onUpload: (files: IUploadPackageFile[]) => void;
  onContinue: () => void;
  onReclassify?: (documentId: string, docType: EPackageDocType) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const take = async (list: FileList | null) => {
    if (!list?.length) return;
    onUpload(await Promise.all([...list].map(readFile)));
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">Upload the package</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Markdown, PDF, Word or a ZIP. A folder keeps its structure. Nothing is created in the
          project yet — this step only reads the documents.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          void take(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
          "transition-[border-color,background-color] duration-150 ease-out",
          isOver ? "border-primary bg-accent/60" : "border-border bg-muted/30",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
          <HugeiconsIcon icon={File01Icon} className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Drop files here</p>
          <p className="text-xs text-muted-foreground">or choose what to upload</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isUploading}
            onClick={() => fileInput.current?.click()}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Browse files
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isUploading}
            onClick={() => folderInput.current?.click()}>
            <HugeiconsIcon icon={FolderOpenIcon} className="size-4" />
            Upload folder
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => void take(e.target.files)}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose a folder to upload"
          // Non-standard but supported everywhere that matters; React needs the
          // lowercase DOM attribute names here.
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => void take(e.target.files)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isUploading ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      ) : null}

      {pkg && pkg.documents.length > 0 ? (
        <section aria-label="Uploaded documents" className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1.5">
            {pkg.documents.map((doc, index) => (
              <li
                key={doc.id}
                // Staggered so a package of twenty files reads as arriving, not
                // as a wall appearing. Short delays only — this is decoration.
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2",
                  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200",
                  needsAttention(doc) ? "border-amber-500/40 bg-amber-500/5" : "border-border",
                )}
              >
                <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {doc.original_path || doc.file_name || doc.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatBytes(doc.byte_size)}</span>
                </span>
                {onReclassify && !needsAttention(doc) ? (
                  <label className="shrink-0">
                    <span className="sr-only">Document type for {doc.file_name ?? doc.title}</span>
                    <select
                      value={doc.doc_type ?? EPackageDocType.Unknown}
                      onChange={(e) =>
                        onReclassify(doc.id, e.target.value as EPackageDocType)
                      }
                      className="rounded-md border bg-background px-2 py-1 text-xs text-foreground transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {Object.entries(DOC_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    // Never colour alone: the label states the outcome in words.
                    needsAttention(doc)
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {parseStateLabel(doc)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {pkg.counts.ready} ready
              {pkg.counts.needs_attention > 0
                ? ` · ${pkg.counts.needs_attention} need attention`
                : ""}
            </p>
            <Button type="button" onClick={onContinue} disabled={pkg.counts.ready === 0}>
              Analyse documents
            </Button>
          </div>
          {pkg.counts.ready === 0 ? (
            <p className="text-xs text-muted-foreground">
              None of these could be read, so there is nothing to analyse yet.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
