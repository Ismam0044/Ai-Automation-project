import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/alerts": "http://localhost:3000",
      "/monitor": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
