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
afterEach(() => { delete window.google; vi.restoreAllMocks(); localStorage.clear(); vi.unstubAllGlobals(); });
it("opens the Google popup synchronously and restores a verified session after reopening", async () => {
  const { auth, request, fetcher } = setup(); const connection = auth.connect();
  expect(request).toHaveBeenCalledWith({ prompt: "select_account" });
  options.callback({ access_token: "secret-token", expires_in: 3600, scope: DRIVE_SCOPE });
  expect((await connection).account.id).toBe("alice");
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("about?fields=user"), expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } }));
  const restored = new WebAuth("web-client").current()!;
  expect(restored.token).toBe("secret-token"); expect(restored.account.id).toBe("alice");
  expect(restored.expires).toBe(auth.current()!.expires);
  expect(restored.signal.aborted).toBe(false);
  expect(sessionStorage.length).toBe(0);
  const signal = auth.current()!.signal; auth.disconnect(); expect(signal.aborted).toBe(true); expect(auth.current()).toBeUndefined();
  expect(new WebAuth("web-client").current()).toBeUndefined();
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

it("preserves authorization on disposal but cancels the old page's requests", async () => {
  const { auth } = setup(); const connection = auth.connect();
  options.callback({ access_token: "token", expires_in: 3600, scope: DRIVE_SCOPE });
  const session = await connection; auth.dispose();
  expect(session.signal.aborted).toBe(true);
  expect(new WebAuth("web-client").current()?.token).toBe("token");
});
it("does not restore expired authorization or another OAuth client's session", async () => {
  const { auth } = setup(); const connection = auth.connect();
  options.callback({ access_token: "token", expires_in: 3600, scope: DRIVE_SCOPE });
  const session = await connection;
  const saved = localStorage.getItem("nova-web-drive-session-v1")!;
  expect(new WebAuth("other-client").current()).toBeUndefined();
  localStorage.setItem("nova-web-drive-session-v1", saved);
  vi.spyOn(Date, "now").mockReturnValue(session.expires);
  expect(new WebAuth("web-client").current()).toBeUndefined();
  expect(localStorage.getItem("nova-web-drive-session-v1")).toBeNull();
});
it.each(["{", "null", '{"clientId":"web-client","token":"token","expires":"tomorrow"}'])("ignores malformed saved authorization: %s", saved => {
  localStorage.setItem("nova-web-drive-session-v1", saved);
  expect(new WebAuth("web-client").current()).toBeUndefined();
  expect(localStorage.getItem("nova-web-drive-session-v1")).toBeNull();
});
it("keeps sign-in usable when browser storage is blocked", async () => {
  const { auth } = setup();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(auth.current()).toBeUndefined();
  const connection = auth.connect();
  options.callback({ access_token: "token", expires_in: 3600, scope: DRIVE_SCOPE });
  expect((await connection).token).toBe("token");
  expect(auth.current()?.token).toBe("token");
  auth.disconnect(); expect(auth.current()).toBeUndefined();
});
