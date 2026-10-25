const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export function triggerDownload(absoluteUrl: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = absoluteUrl;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
