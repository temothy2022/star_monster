import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/super/" : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
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
    port: 5177,
    proxy: {
      "/api": {
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
