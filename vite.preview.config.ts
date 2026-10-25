import { defineConfig } from "vite";
export default defineConfig({
  root: "preview",
  server: { port: 5179, fs: { allow: [".."] } },
  build: { outDir: "../dist-preview", emptyOutDir: true },
});
