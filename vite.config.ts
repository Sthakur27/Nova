import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  define: { __NOVA_TARGET__: JSON.stringify(process.env.TAURI_ENV_PLATFORM ?? "desktop") },
  plugins: [react()],
  // Prefer DOM-free dependency exports so Markdown also runs in a worker.
  resolve: { conditions: ["worker", "module", "browser", "development|production"] },
  server: { strictPort: true, host: process.env.TAURI_DEV_HOST || "127.0.0.1", hmr: process.env.TAURI_DEV_HOST ? { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 1421 } : undefined },
  clearScreen: false,
});
