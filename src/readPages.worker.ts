import { buildReadPages } from "./readPages";

self.onmessage = ({ data }: MessageEvent<{ text: string; markdown: boolean }>) => {
  try {
    self.postMessage({ pages: buildReadPages(data.text, data.markdown) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
