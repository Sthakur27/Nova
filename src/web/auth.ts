import type { Account } from "./store";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type TokenOptions = { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void };
export type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (options: TokenOptions) => { requestAccessToken: (options: { prompt: string }) => void } } } };
declare global { interface Window { google?: GoogleIdentity } }
export type Session = { account: Account; token: string; expires: number; signal: AbortSignal };

let identityLoading: Promise<void> | undefined;
export function loadIdentity(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (identityLoading) return identityLoading;
  identityLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); reject(new Error("Google sign-in could not load. Check your connection and retry.")); }, 15000);
    script.src = "https://accounts.google.com/gsi/client"; script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Google sign-in could not load. Check your connection and retry.")); };
    document.head.append(script);
  }).catch(error => { identityLoading = undefined; throw error; });
  return identityLoading;
}

export class WebAuth {
  private session?: Session;
  private controller = new AbortController();
  private generation = 0;
  private cancelPending?: () => void;
  constructor(readonly clientId: string, private fetcher: typeof fetch = fetch) {}
  current(): Session | undefined {
    if (this.session && this.session.expires <= Date.now()) this.disconnect();
    return this.session;
  }
  disconnect() {
    this.generation++; this.controller.abort(); this.controller = new AbortController();
    this.session = undefined; this.cancelPending?.(); this.cancelPending = undefined;
  }
  // Called synchronously by the click handler after GIS loads, to keep popup user activation.
  connect(): Promise<Session> {
    if (!this.clientId || !window.google) return Promise.reject(new Error("Google sign-in is not configured or has not loaded."));
    this.disconnect();
    const generation = this.generation;
    const signal = this.controller.signal;
    return new Promise((resolve, reject) => {
      const finishError = (error: unknown) => { if (generation === this.generation) this.cancelPending = undefined; reject(error); };
      this.cancelPending = () => reject(new Error("Sign-in cancelled."));
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId, scope: DRIVE_SCOPE,
        callback: response => {
          if (generation !== this.generation) return;
          if (response.error || !response.access_token || !response.scope?.split(" ").includes(DRIVE_SCOPE)) {
            finishError(new Error("Google Drive access was not granted. Your local notes are unchanged.")); return;
          }
          const token = response.access_token;
          const lifetime = Number(response.expires_in);
          if (!Number.isFinite(lifetime) || lifetime <= 30) { finishError(new Error("Google returned an expired access token. Try connecting again.")); return; }
          const expires = Date.now() + (lifetime - 30) * 1000;
          void this.fetcher("https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)", {
            headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store",
          }).then(async result => {
            if (!result.ok) throw new Error("Could not verify the Google Drive account. Try connecting again.");
            const { user } = await result.json();
            if (!user?.permissionId || typeof user.permissionId !== "string") throw new Error("Google did not return an account identity.");
            if (generation !== this.generation || signal.aborted) return;
            const session = { token, expires, signal, account: { id: user.permissionId, email: user.emailAddress || "Google Drive account" } };
            this.session = session; this.cancelPending = undefined; resolve(session);
          }).catch(finishError);
        },
        error_callback: () => finishError(new Error("Google sign-in was closed or blocked. Try connecting again.")),
      });
      client.requestAccessToken({ prompt: "select_account" });
    });
  }
}
