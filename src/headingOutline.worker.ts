import { headingOutline } from "./markdownOutline";
self.onmessage = ({ data }: MessageEvent<string>) => {
  try { self.postMessage({ headings: headingOutline(data) }); }
  catch { self.postMessage({ error: "Unable to prepare this note’s outline." }); }
};
