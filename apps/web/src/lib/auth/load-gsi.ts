/** Loads the Google Identity Services script exactly once (promise-cached). */
let loaderPromise: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    if (document.getElementById("google-gsi")) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.id = "google-gsi";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

type CredentialCallback = (credential: string) => void;

let gsiInitialized = false;
let credentialCallback: CredentialCallback = () => {};

/** Updates the handler invoked when Google returns an ID token (no re-init). */
export function setGoogleCredentialCallback(callback: CredentialCallback) {
  credentialCallback = callback;
}

/** Initializes GSI once per page load; safe to call from multiple components/effects. */
export async function ensureGoogleIdentityInitialized(clientId: string): Promise<void> {
  await loadGoogleIdentityServices();
  if (gsiInitialized || !window.google) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => credentialCallback(response.credential),
  });
  gsiInitialized = true;
}

export function renderGoogleSignInButton(
  parent: HTMLElement,
  options: Record<string, unknown>,
): void {
  if (!window.google) return;
  parent.innerHTML = "";
  window.google.accounts.id.renderButton(parent, options);
}
