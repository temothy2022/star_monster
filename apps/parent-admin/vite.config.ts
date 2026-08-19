import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/parent/" : "/",
  publicDir: path.join(repoRoot, "packages/assets/static"),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@dnd-kit/")) return "vendor-dnd";
          if (id.includes("node_modules/antd/") || id.includes("node_modules/@ant-design/")) return "vendor-antd";
          if (id.includes("node_modules/@refinedev/")) return "vendor-refine";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
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
