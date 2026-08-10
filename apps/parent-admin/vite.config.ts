import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/parent/" : "/",
  publicDir: path.join(repoRoot, "packages/assets/static"),
  server: {
    host: "0.0.0.0",
    port: 5176,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/hanzi-assets": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/poem-assets": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
}));
