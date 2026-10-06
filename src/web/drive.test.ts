import { afterEach, expect, it, vi } from "vitest";
import { BrowserDrive, MAX_NOTE_BYTES, validName } from "./drive";
const session = () => ({ account: { id: "alice", email: "alice@test" }, token: "token", expires: Date.now() + 100000, signal: new AbortController().signal });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const metadata = (etag = '"v1"') => ({ etag, title: "Note.md", parents: [{ id: "space" }], mimeType: "text/plain", properties: [{ key: "novaKey", value: "remote", visibility: "PRIVATE" }] });
it("requires the remote revision and sends conditional multipart updates to Drive v2", async () => {
  const fetcher = vi.fn(async () => json({ id: "remote" })); const drive = new BrowserDrive(session(), fetcher);
  const copy = { name: "Note.md", text: "edited", parent: "space", etag: '"current"' };
  await drive.write("remote", copy, false);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/upload/drive/v2/files/remote"), expect.objectContaining({ method: "PUT", cache: "no-store", headers: expect.objectContaining({ "If-Match": '"current"', Authorization: "Bearer token" }) }));
  await expect(drive.write("remote", { ...copy, etag: "" }, false)).rejects.toThrow("revision");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("detects remote edits between metadata and content reads", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(metadata())).mockResolvedValueOnce(new Response("content")).mockResolvedValueOnce(json(metadata('"v2"')));
  await expect(new BrowserDrive(session(), fetcher).read("remote")).rejects.toMatchObject({ status: 412 });
});
it("bounds streamed note downloads even when metadata omits the size", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(metadata())).mockResolvedValueOnce(new Response("x".repeat(MAX_NOTE_BYTES + 1)));
  await expect(new BrowserDrive(session(), fetcher).read("remote")).rejects.toThrow("size limit");
});
it("follows paginated listings while excluding unsafe and non-Nova content", async () => {
  const file = { id: "note", name: "Note.md", mimeType: "text/plain", appProperties: { novaKey: "note" } };
  const fetcher = vi.fn().mockResolvedValueOnce(json({ files: [{ ...file, id: "unsafe", name: "../outside.md" }, { ...file, id: "plain", appProperties: {} }], nextPageToken: "page2" })).mockResolvedValueOnce(json({ files: [file] }));
  expect(await new BrowserDrive(session(), fetcher).tree("space")).toEqual([{ id: "note", name: "Note.md", parent: "space", directory: "", space: "space" }]);
  expect(fetcher.mock.calls[1][0]).toContain("pageToken=page2");
});
it("stops repeated pagination tokens", async () => {
  const fetcher = vi.fn(async () => json({ files: [], nextPageToken: "same" }));
  await expect(new BrowserDrive(session(), fetcher).tree("space")).rejects.toThrow("repeated listing");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not create another root when Nova root identity is ambiguous", async () => {
  const file = { id: "root1", name: ".nova", mimeType: "application/vnd.google-apps.folder" };
  const fetcher = vi.fn(async () => json({ files: [file, { ...file, id: "root2" }] }));
  await expect(new BrowserDrive(session(), fetcher).spaces()).rejects.toThrow("Duplicate");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["../note", ".nova", ".nova.backup", "a/b.md", "a\\b.md", "bad\n.md", "", ".."])('rejects unsafe filename %j', name => expect(validName(name)).toBe(false));
it("rejects absent reserved IDs instead of treating undefined as an identity", async () => {
  const fetcher = vi.fn(async () => json({ ids: [] }));
  await expect(new BrowserDrive(session(), fetcher).reserve()).rejects.toThrow("invalid file identity");
});

afterEach(() => vi.unstubAllGlobals());
it("calls browser fetch with its global receiver for Drive requests", async () => {
  vi.stubGlobal("fetch", function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(json({ ids: ["reserved"] }));
  });
  expect(await new BrowserDrive(session()).reserve()).toBe("reserved");
});

it("checks an unchanged revision without downloading its content again", async () => {
  const fetcher = vi.fn(async () => json(metadata()));
  const cached = { name: "Note.md", parent: "space", text: "baseline", etag: '"v1"' };
  expect(await new BrowserDrive(session(), fetcher).read("remote", cached)).toEqual(cached);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("downloads content when the cached revision is stale", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(metadata('"v2"'))).mockResolvedValueOnce(new Response("updated")).mockResolvedValueOnce(json(metadata('"v2"')));
  const cached = { name: "Note.md", parent: "space", text: "baseline", etag: '"v1"' };
  expect(await new BrowserDrive(session(), fetcher).read("remote", cached)).toMatchObject({ text: "updated", etag: '"v2"' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
