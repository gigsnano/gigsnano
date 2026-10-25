/** User-facing copy for a failed email + password sign-in. */
export function signInErrorMessage(status: number, code?: string): string {
  if (code === "network" || status === 0) return "Can't reach GigsNano. Check your connection.";
  if (status === 401) return "Email or password is incorrect.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  return "Something went wrong. Try again.";
}
