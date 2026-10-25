import { APIError } from "@/services/api-error";

/** Extract a human-readable message from a failed marketplace API call. */
export function marketplaceApiMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (!(err instanceof APIError)) return fallback;
  const data = err.data;
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
