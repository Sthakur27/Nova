import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Prefer DOM-free dependency exports so Markdown also runs in a worker.
  resolve: { conditions: ["worker", "module", "browser", "development|production"] },
  server: { strictPort: true },
  clearScreen: false,
});
