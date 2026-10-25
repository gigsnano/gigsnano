import { APIError } from "@/services/api-error";

/**
 * Human-readable message for an auth-form API error. Prefers the backend's
 * `{ detail: "..." }` (FastAPI HTTPException), falling back to a friendly line
 * per status code so a rejected mutation never surfaces as a raw stack trace.
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const detail = (error.data as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (error.status === 409) return "That email is already registered. Try signing in instead.";
    if (error.status === 401) return "Invalid email or password.";
    return "Something went wrong. Please try again.";
  }
  return "Couldn't reach the server. Check your connection and try again.";
}
