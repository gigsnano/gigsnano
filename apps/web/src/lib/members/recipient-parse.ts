/** Recipient entry rules for the invite dialog (GIN-526).
 *
 * Pure and separately tested because this is where the fiddly cases live —
 * pasted lists, mixed separators, casing, duplicates, throwaway domains. The
 * server re-validates and re-deduplicates all of it: this module makes the UI
 * honest, it is not the guard.
 */

/** Mirrors the backend's shape check (`invitations/service.py::_EMAIL_RE`).
 *  Deliberately permissive — the authoritative test is whether delivery works. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Comma, semicolon, newline and tab all separate addresses. Pasting a column
 *  out of a spreadsheet or a mail client's "To" line both land here. */
const SEPARATORS = /[,;\n\r\t]+/;

/** Disposable-mailbox providers. A workspace seat is an access grant, so an
 *  address that self-destructs in ten minutes cannot be recovered, audited, or
 *  used to reach the person again.
 *
 *  ponytail: a static list of the common providers, not an exhaustive one —
 *  the long tail runs to six figures of domains and goes stale weekly. This
 *  catches the casual case at zero cost; if abuse ever justifies it, swap the
 *  set for a maintained feed behind `isDisposableEmail` and nothing else moves.
 *  Kept in sync by hand with `apps/api/src/gigsnano_api/features/invitations/service.py`. */
const DISPOSABLE_DOMAINS = new Set([
  "0-mail.com", "10minutemail.com", "20minutemail.com", "33mail.com",
  "burnermail.io", "dispostable.com", "emailondeck.com", "fakeinbox.com",
  "getairmail.com", "getnada.com", "guerrillamail.com", "guerrillamail.info",
  "harakirimail.com", "inboxbear.com", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailnesia.com", "mintemail.com", "moakt.com",
  "mohmal.com", "mytemp.email", "sharklasers.com", "spam4.me",
  "temp-mail.io", "temp-mail.org", "tempmail.com", "tempmailo.com",
  "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de",
  "yopmail.com", "yopmail.fr", "yopmail.net",
]);

/** Why a recipient can't be invited. `null` means it can. */
export type TRecipientProblem = "invalid" | "disposable";

export interface IRecipient {
  /** Normalized — what gets sent and what dedup compares. */
  value: string;
  /** As typed, so a chip shows the user their own input back. */
  display: string;
  problem: TRecipientProblem | null;
}

export const RECIPIENT_PROBLEM_LABEL: Record<TRecipientProblem, string> = {
  invalid: "Not a valid email address",
  disposable: "Temporary email addresses aren't allowed",
};

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

export function domainOf(raw: string): string {
  return normalizeEmail(raw).split("@").pop() ?? "";
}

/** True for a known throwaway-mailbox provider. Subdomains count
 *  (`foo.mailinator.com`), because most of these hand them out freely. */
export function isDisposableEmail(raw: string): boolean {
  const domain = domainOf(raw);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return [...DISPOSABLE_DOMAINS].some((blocked) => domain.endsWith(`.${blocked}`));
}

export function problemFor(raw: string): TRecipientProblem | null {
  if (!isValidEmail(raw)) return "invalid";
  if (isDisposableEmail(raw)) return "disposable";
  return null;
}

/** Split one blob of typed or pasted text into candidate addresses.
 *  Angle-bracket forms ("Ada <ada@x.io>") are unwrapped, because pasting from a
 *  mail client is the single most likely source of a multi-address paste. */
export function splitRecipients(input: string): string[] {
  return input
    .split(SEPARATORS)
    .map((part) => part.trim().replace(/^.*<([^>]+)>$/, "$1").trim())
    .filter(Boolean);
}

/** Add `input`'s addresses to `existing`, dropping anything already present.
 *  Returns the new list plus what was skipped, so the dialog can say why a
 *  pasted address silently didn't appear instead of just losing it. */
export function addRecipients(
  existing: IRecipient[],
  input: string,
): { recipients: IRecipient[]; duplicates: string[] } {
  const seen = new Set(existing.map((r) => r.value));
  const duplicates: string[] = [];
  const added: IRecipient[] = [];

  for (const raw of splitRecipients(input)) {
    const value = normalizeEmail(raw);
    if (seen.has(value)) {
      duplicates.push(raw);
      continue;
    }
    seen.add(value);
    added.push({ value, display: raw.trim(), problem: problemFor(raw) });
  }

  return { recipients: [...existing, ...added], duplicates };
}

export function removeRecipient(existing: IRecipient[], value: string): IRecipient[] {
  return existing.filter((r) => r.value !== value);
}

/** Recipients that can actually be submitted. */
export function sendableRecipients(recipients: IRecipient[]): IRecipient[] {
  return recipients.filter((r) => r.problem === null);
}
