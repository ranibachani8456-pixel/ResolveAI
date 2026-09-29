import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
    css: true,
  },
  server: {
    // Preserve popup communication for browsers that are not using FedCM.
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
    // The proxy lets the browser call /api without local CORS or hard-coded URLs.
    proxy: {
      "/api": "http://localhost:5001",
    },
  },
});
