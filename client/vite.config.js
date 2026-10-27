import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Express API owns /api, and the Public folder still serves the club
// photography (/Media) and organizer uploads (/uploads), so all three are
// proxied straight through in dev.
//
// /tickets is intentionally not here. Generated ticket PDFs are delivered by
// email and that folder is not served over HTTP by design.
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/Media", "/uploads"].map((path) => [
        path,
        { target: API_TARGET, changeOrigin: true },
      ])
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Let the dynamic Canvas3D import own its dependency chunk. A manual Three
    // chunk also hoists shared React dependencies, making the entry preload
    // the entire renderer even on pages and phones that never mount it.
  },
});
