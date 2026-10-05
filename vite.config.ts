import { defineConfig, loadEnv, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { webServiceWorker } from "./scripts/web-shell";
import react from "@vitejs/plugin-react";
function webShell(): Plugin {
  return {
    name: "nova-web-shell",
    transformIndexHtml: { order: "pre", handler(html) {
      return html.replace('/src/main.tsx', '/src/web/main.tsx').replace('</head>',
        '<link rel="manifest" href="/manifest.webmanifest"/><link rel="apple-touch-icon" href="/apple-touch-icon.png"/></head>');
    } },
    generateBundle(_, bundle) {
      const icons = [
        ["icon-256.png", "src-tauri/icons/128x128@2x.png"],
        ["icon-1024.png", "src-tauri/icons/ios/AppIcon-512@2x.png"],
        ["apple-touch-icon.png", "src-tauri/icons/ios/AppIcon-60x60@3x.png"],
      ];
      const version = createHash("sha256");
      for (const [fileName, path] of icons) {
        const source = readFileSync(path); version.update(source);
        this.emitFile({ type: "asset", fileName, source });
      }
      const manifest = { name: "Nova Notes", short_name: "Nova", id: "/", start_url: "/", scope: "/", display: "standalone", background_color: "#17181c", theme_color: "#17181c",
        icons: [{ src: "/icon-256.png", sizes: "256x256", type: "image/png" }, { src: "/icon-1024.png", sizes: "1024x1024", type: "image/png" }] };
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest) });
      const files = [...new Set(["/index.html", "/manifest.webmanifest", ...icons.map(([name]) => `/${name}`), ...Object.keys(bundle).map(name => `/${name}`)])];
      version.update(JSON.stringify(manifest));
      for (const entry of Object.values(bundle)) version.update(entry.type === "chunk" ? entry.code : entry.source);
      const hash = version.update(JSON.stringify(files)).digest("hex").slice(0, 16);
      this.emitFile({ type: "asset", fileName: "sw.js", source: webServiceWorker(hash, files) });
    },
  };
}
export default defineConfig(({ mode }) => {
  const web = mode === "web";
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    define: { __NOVA_TARGET__: JSON.stringify(process.env.TAURI_ENV_PLATFORM ?? "desktop"), __NOVA_WEB_CLIENT_ID__: JSON.stringify(web ? env.VITE_GOOGLE_WEB_CLIENT_ID ?? "" : "") },
    plugins: [react(), ...(web ? [webShell()] : [])],
    build: { outDir: web ? "dist-web" : "dist" },
    // Prefer DOM-free dependency exports so Markdown also runs in a worker.
    resolve: { conditions: ["worker", "module", "browser", "development|production"] },
    server: { strictPort: true, host: process.env.TAURI_DEV_HOST || "127.0.0.1", hmr: process.env.TAURI_DEV_HOST ? { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 1421 } : undefined },
    clearScreen: false,
  };
});
