import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/parent/" : "/",
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
