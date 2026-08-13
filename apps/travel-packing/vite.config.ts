import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/packing/" : "/",
  publicDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public"),
  server: {
    host: "0.0.0.0",
    port: 5178,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
}));
