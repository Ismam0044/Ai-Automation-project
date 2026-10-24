import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "/alerts": "http://localhost:3000",
      "/monitor": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/workspaces": "http://localhost:3000",
    },
  },
});
