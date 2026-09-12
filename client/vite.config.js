import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The proxy lets the browser call /api without local CORS or hard-coded URLs.
    proxy: {
      "/api": "http://localhost:5001",
    },
  },
});
