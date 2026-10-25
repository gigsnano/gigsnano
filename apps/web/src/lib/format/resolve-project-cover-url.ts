import { DEFAULT_PROJECT_COVER } from "@/constants/project-gallery";
import { REMOTE_IMAGE_HOSTNAMES } from "@/constants/remote-image-hosts";

const ALLOWED_HOSTS = new Set<string>(REMOTE_IMAGE_HOSTNAMES);

/** Returns a cover URL safe for `next/image`, falling back to the default gallery cover. */
export function resolveProjectCoverUrl(url: string | null | undefined): string {
  if (!url) return DEFAULT_PROJECT_COVER.url;

  try {
    const { hostname } = new URL(url);
    if (ALLOWED_HOSTS.has(hostname)) return url;
  } catch {
    // Invalid URL — use default cover.
  }

  return DEFAULT_PROJECT_COVER.url;
}
