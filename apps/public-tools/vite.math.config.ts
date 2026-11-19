import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, "math-print"),
  base: "/math-print/",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: path.join(here, "dist/math-print"),
    emptyOutDir: true,
  },
});
