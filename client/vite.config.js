import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/alerts": "http://localhost:3000",
      "/monitor": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
