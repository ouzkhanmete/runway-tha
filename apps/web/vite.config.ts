import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
const proxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@packages/shared": resolve(__dirname, "../../packages/shared/src"),
      "@apps/web": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 5173,
    host: true,
    proxy,
  },
});
