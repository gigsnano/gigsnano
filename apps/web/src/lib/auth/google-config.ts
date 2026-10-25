/** Inlined at build time — unset in prod ⇒ Google button self-hides. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export const isGoogleSignInEnabled = Boolean(GOOGLE_CLIENT_ID);
