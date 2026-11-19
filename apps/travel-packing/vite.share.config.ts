import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/packing-share/",
  publicDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public"),
  build: { outDir: "dist-share" },
});
