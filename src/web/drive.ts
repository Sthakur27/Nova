import type { Session } from "./auth";
import type { RemoteCopy, Space } from "./store";

const API = "https://www.googleapis.com/drive/v3/files";
const V2 = "https://www.googleapis.com/drive/v2/files";
const FOLDER = "application/vnd.google-apps.folder";
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;
type File = { id: string; name: string; mimeType: string; parents?: string[]; size?: string; appProperties?: Record<string, string> };
export type RemoteNote = { id: string; name: string; parent: string; directory: string; space: string };
export class DriveError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "Google access expired. Reconnect Google Drive; your edits stay on this device."
      : status === 412 ? "The Drive copy changed during sync. Both versions were preserved. Retry to review them."
      : status === 404 ? "This note is missing from Drive. Your device copy was preserved."
      : status === 403 ? "Google Drive refused access. Check account permissions and available Drive space."
      : status === 429 ? "Google Drive is busy. Wait a moment before retrying sync."
      : `Google Drive returned error ${status}. Your device copy was preserved.`);
  }
}
export const validName = (name: string) => !!name && name.length <= 255 && name !== "." && name !== ".."
  && !name.startsWith(".nova") && !name.startsWith(".tmp") && !/[\\/:\x00-\x1f\x7f]/.test(name);
const id = (value: string) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Google returned an invalid file identity.");
  return value;
};
const textFile = (file: File) => !file.mimeType.startsWith("application/vnd.google-apps.")
  && /\.(md|markdown|txt|json|ya?ml|csv|html?|css|[cm]?jsx?|tsx?|py|xml|rs|sh|toml|log)$/i.test(file.name);

export class BrowserDrive {
  private downloaded = 0;
  constructor(readonly session: Session, private fetcher: typeof fetch = fetch) {}
  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.session.signal.aborted) throw new Error("Google connection changed. Retry with the current account.");
    if (this.session.expires <= Date.now()) throw new DriveError(401);
    const response = await this.fetcher(url, { ...init, cache: "no-store",
      headers: { ...init.headers, Authorization: `Bearer ${this.session.token}` },
      signal: AbortSignal.any([this.session.signal, AbortSignal.timeout(30000)]),
    });
    if (!response.ok) throw new DriveError(response.status);
    return response;
  }
  private async list(query: string): Promise<File[]> {
    const files: File[] = []; let page = "";
    const pages = new Set<string>();
    do {
      if (pages.has(page)) throw new Error("Google returned a repeated listing page. Retry sync.");
      pages.add(page);
      const params = new URLSearchParams({ q: query, pageSize: "1000", fields: "nextPageToken,files(id,name,mimeType,parents,size,appProperties)", ...(page ? { pageToken: page } : {}) });
      const data = await (await this.request(`${API}?${params}`)).json();
      if (!Array.isArray(data.files)) throw new Error("Google returned an invalid file listing.");
      files.push(...data.files);
      if (files.length > 10000 || pages.size > 100) throw new Error("This space is too large for the web preview.");
      page = data.nextPageToken ?? "";
    } while (page);
    for (const file of files) { id(file.id); if (typeof file.name !== "string" || typeof file.mimeType !== "string") throw new Error("Invalid Drive file metadata."); }
    return files;
  }
  private children(parent: string) { return this.list(`trashed = false and '${id(parent)}' in parents`); }
  private async folder(parent: string, key: string, name: string): Promise<string> {
    const found = await this.list(`trashed = false and '${id(parent)}' in parents and appProperties has { key='novaKey' and value='${key}' }`);
    if (found.length > 1) throw new Error("Duplicate Nova folders exist in Drive. Resolve them in Drive before syncing.");
    if (found.length) {
      if (found[0].mimeType !== FOLDER) throw new Error("Nova's Drive folder has been replaced with a file.");
      return found[0].id;
    }
    const created = await (await this.request(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent], appProperties: { novaKey: key } }),
    })).json();
    return id(created.id);
  }
  async spaces(): Promise<Space[]> {
    const base = await this.folder("root", "nova-notes-v1", ".nova");
    let spaces = (await this.children(base)).filter(file => file.mimeType === FOLDER && file.appProperties?.novaKey);
    if (!spaces.length) {
      await this.folder(base, "nova-cloud-default-v2", "Notes");
      spaces = (await this.children(base)).filter(file => file.mimeType === FOLDER && file.appProperties?.novaKey);
    }
    return spaces.map(file => ({ id: file.id, name: file.name, account: this.session.account.id }));
  }
  async tree(space: string): Promise<RemoteNote[]> {
    const notes: RemoteNote[] = []; const seen = new Set<string>(); let count = 0;
    const walk = async (parent: string, directory: string, depth: number) => {
      if (depth > 20 || seen.has(parent)) throw new Error("Cloud folders are too deeply nested or have repeated identities.");
      seen.add(parent);
      const children = await this.children(parent);
      count += children.length;
      if (count > 10000) throw new Error("This space is too large for the web preview.");
      for (const file of children) {
        if (!file.appProperties?.novaKey || !validName(file.name)) continue;
        if (file.mimeType === FOLDER) await walk(file.id, directory ? `${directory}/${file.name}` : file.name, depth + 1);
        else if (textFile(file)) {
          if (Number(file.size) > MAX_NOTE_BYTES) throw new Error(`“${file.name}” exceeds the web preview's 2 MB limit. No local copy was removed.`);
          notes.push({ id: file.id, name: file.name, parent, directory, space });
        }
      }
    };
    await walk(space, "", 0); return notes;
  }
  private async metadata(fileId: string) {
    const params = new URLSearchParams({ fields: "etag,title,parents(id),mimeType,labels(trashed),fileSize,properties" });
    const meta = await (await this.request(`${V2}/${id(fileId)}?${params}`)).json();
    if (meta.labels?.trashed) throw new DriveError(404);
    if (typeof meta.etag !== "string" || !meta.etag || !validName(meta.title) || meta.parents?.length !== 1
      || !meta.properties?.some((property: { key: string; visibility: string }) => property.key === "novaKey" && property.visibility === "PRIVATE")
      || !textFile({ id: fileId, name: meta.title, mimeType: meta.mimeType ?? "" })) throw new Error("This Drive file is no longer a supported Nova note. It was left unchanged.");
    if (Number(meta.fileSize) > MAX_NOTE_BYTES) throw new Error("This note exceeds the web preview's 2 MB limit.");
    return { etag: meta.etag as string, name: meta.title as string, parent: id(meta.parents[0].id) };
  }
  async read(fileId: string): Promise<RemoteCopy> {
    const before = await this.metadata(fileId);
    const response = await this.request(`${API}/${id(fileId)}?alt=media`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Google returned no note content.");
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length; this.downloaded += value.length;
        if (length > MAX_NOTE_BYTES || this.downloaded > 32 * 1024 * 1024) throw new Error("Download exceeds the web preview's size limit. Your device copies are unchanged.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("Binary files cannot be opened as notes.");
    const after = await this.metadata(fileId);
    if (before.etag !== after.etag) throw new DriveError(412);
    return { ...after, text };
  }
  async reserve(): Promise<string> {
    const data = await (await this.request(`${API}/generateIds?count=1&space=drive&type=files`)).json();
    return id(data.ids?.[0]);
  }
  async write(fileId: string, copy: RemoteCopy, create: boolean): Promise<void> {
    if (!validName(copy.name)) throw new Error("Choose a note name without slashes or reserved characters.");
    if (new TextEncoder().encode(copy.text).length > MAX_NOTE_BYTES) throw new Error("This note exceeds the web preview's 2 MB limit. Export it before closing.");
    if (!create && !copy.etag) throw new Error("A remote revision is required to update this note safely.");
    const boundary = `nova_${crypto.randomUUID()}`;
    const metadata = create ? { id: id(fileId), name: copy.name, parents: [id(copy.parent)], mimeType: "text/plain", appProperties: { novaKey: fileId } } : { title: copy.name };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${copy.text}\r\n--${boundary}--\r\n`;
    // Match the native engine: v2 exposes a usable ETag for conditional writes.
    await this.request(create ? "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id"
      : `https://www.googleapis.com/upload/drive/v2/files/${id(fileId)}?uploadType=multipart&fields=id`, {
      method: create ? "POST" : "PUT", body,
      headers: { "Content-Type": `multipart/related; boundary=${boundary}`, ...(!create ? { "If-Match": copy.etag } : {}) },
    });
  }
}
