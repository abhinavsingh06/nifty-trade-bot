import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DASHBOARD_BACKEND = "http://127.0.0.1:3020";

export default defineConfig({
  root: "dashboard",
  plugins: [react()],
  build: {
    outDir: "../dashboard-dist",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": { target: DASHBOARD_BACKEND, changeOrigin: true },
      "/auth": { target: DASHBOARD_BACKEND, changeOrigin: true },
      "/zerodha": { target: DASHBOARD_BACKEND, changeOrigin: true },
      "/ws": { target: DASHBOARD_BACKEND, ws: true }
    }
  }
});
