export type TWorkspacePreviewKind = "markdown" | "code" | "text" | "unsupported";

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "cs",
  "cpp",
  "c",
  "h",
  "hpp",
  "rb",
  "php",
  "swift",
  "sql",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "toml",
  "json",
  "xml",
  "html",
  "css",
  "scss",
  "less",
  "vue",
  "svelte",
  "dockerfile",
  "graphql",
  "gql",
]);

const TEXT_EXTENSIONS = new Set(["txt", "log", "env", "ini", "cfg", "conf", "gitignore", "editorconfig"]);

/** Extension from a POSIX workspace path (lowercase, no dot). */
function extensionFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base.toLowerCase() === "dockerfile") return "dockerfile";
  if (base.startsWith(".")) return base.slice(1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Human-readable language label for the preview header chip. */
export function languageFromPath(path: string): string | null {
  const ext = extensionFromPath(path);
  if (!ext) return null;
  const labels: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    py: "Python",
    go: "Go",
    rs: "Rust",
    md: "Markdown",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    html: "HTML",
    css: "CSS",
    dockerfile: "Dockerfile",
  };
  return labels[ext] ?? ext.toUpperCase();
}

/** Shiki grammar id for syntax highlighting; null → plain monospace fallback. */
export function shikiLanguageFromPath(path: string): string | null {
  const ext = extensionFromPath(path);
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    sql: "sql",
    sh: "shellscript",
    bash: "shellscript",
    zsh: "shellscript",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    vue: "vue",
    svelte: "svelte",
    dockerfile: "dockerfile",
    graphql: "graphql",
    gql: "graphql",
    md: "markdown",
    mdx: "markdown",
    env: "dotenv",
  };
  return map[ext] ?? null;
}

/** Best-effort preview mode from filename. */
export function workspacePreviewKind(path: string): TWorkspacePreviewKind {
  const ext = extensionFromPath(path);
  if (ext === "md" || ext === "mdx") return "markdown";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (!ext && path.split("/").pop()?.includes(".")) return "unsupported";
  if (!ext) return "text";
  return "unsupported";
}

/** Split content into lines for the line-number gutter. */
export function contentLines(content: string): string[] {
  if (!content) return [""];
  return content.replace(/\r\n/g, "\n").split("\n");
}
