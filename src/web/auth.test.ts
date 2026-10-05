// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { DRIVE_SCOPE, WebAuth, type GoogleIdentity } from "./auth";
let options: Parameters<GoogleIdentity["accounts"]["oauth2"]["initTokenClient"]>[0];
function setup() {
  const request = vi.fn();
  window.google = { accounts: { oauth2: { initTokenClient: value => { options = value; return { requestAccessToken: request }; } } } };
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ user: { permissionId: "alice", emailAddress: "alice@example.test" } })));
  return { request, fetcher, auth: new WebAuth("web-client", fetcher) };
}
afterEach(() => { delete window.google; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens the Google popup synchronously and keeps tokens out of persistent storage", async () => {
  const { auth, request, fetcher } = setup(); const connection = auth.connect();
  expect(request).toHaveBeenCalledWith({ prompt: "select_account" });
  options.callback({ access_token: "secret-token", expires_in: 3600, scope: DRIVE_SCOPE });
  expect((await connection).account.id).toBe("alice");
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("about?fields=user"), expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } }));
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  const signal = auth.current()!.signal; auth.disconnect(); expect(signal.aborted).toBe(true); expect(auth.current()).toBeUndefined();
});
it("rejects cancelled sign-in and ignores a late response", async () => {
  const { auth, fetcher } = setup(); const connection = auth.connect(); const rejected = expect(connection).rejects.toThrow("cancelled");
  auth.disconnect(); options.callback({ access_token: "late", expires_in: 3600, scope: DRIVE_SCOPE });
  await rejected; expect(fetcher).not.toHaveBeenCalled(); expect(auth.current()).toBeUndefined();
});
it("does not accept partial consent", async () => {
  const { auth, fetcher } = setup(); const connection = auth.connect();
  options.callback({ access_token: "token", expires_in: 3600, scope: "openid" });
  await expect(connection).rejects.toThrow("not granted"); expect(fetcher).not.toHaveBeenCalled();
});
it("expires authorization while leaving cached account data untouched", async () => {
  const { auth } = setup(); const connection = auth.connect();
  options.callback({ access_token: "token", expires_in: 60, scope: DRIVE_SCOPE });
  const session = await connection;
  localStorage.setItem("cached-note", "offline edit");
  vi.spyOn(Date, "now").mockReturnValue(session.expires + 1);
  expect(auth.current()).toBeUndefined(); expect(session.signal.aborted).toBe(true); expect(localStorage.getItem("cached-note")).toBe("offline edit");
});

it("calls browser fetch with its global receiver during account verification", async () => {
  setup();
  vi.stubGlobal("fetch", function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(new Response(JSON.stringify({ user: { permissionId: "alice" } })));
  });
  const connection = new WebAuth("web-client").connect();
  options.callback({ access_token: "token", expires_in: 3600, scope: DRIVE_SCOPE });
  expect((await connection).account.id).toBe("alice");
});
